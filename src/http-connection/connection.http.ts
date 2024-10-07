/**
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [https://neo4j.com]
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Connection, types, internal, newError } from "neo4j-driver-core"
import { BeginTransactionConfig, CommitTransactionConfig, RunQueryConfig } from "neo4j-driver-core/types/connection"
import { ResultStreamObserver } from "./stream-observers"
import { QueryRequestCodec, QueryResponseCodec, RawQueryResponse } from "./query.codec"
import { BeginTransactionRequestCodec, BeginTransactionResponse, BeginTransactionResponseCodec, CommitTransactionRequestCodec, CommitTransactionResponse, CommitTransactionResponseCodec, RollbackTransactionRequestCodec, RollbackTransactionResponse, RollbackTransactionResponseCodec } from "./transaction.codec"
import { WrapperConfig } from "../types"
import Pipe from "./lang/pipe"

export type HttpScheme = 'http' | 'https'

let currentId = 0

export interface HttpConnectionConfig {
    release: () => Promise<void>
    auth: types.AuthToken
    queryEndpoint: string
    address: internal.serverAddress.ServerAddress
    config: WrapperConfig
    logger: internal.logger.Logger,
    errorHandler: (error: Error & { code: string, retriable: boolean }) => Error
}


export default class HttpConnection extends Connection {
    private _release: () => Promise<void>
    private _auth: types.AuthToken
    private _queryEndpoint: string
    private _address: internal.serverAddress.ServerAddress
    private _config: types.InternalConfig
    private _abortController?: AbortController
    private _log?: internal.logger.Logger
    private _sessionAffinityHeader: string 
    private _id: number
    private _errorHandler: (error: Error & { code: string, retriable: boolean }) => Error
    private _open: boolean
    private _currentTx: { id: string, affinity?: string, host: string, database: string } | undefined
    private _workPipe: Pipe

    constructor(config: HttpConnectionConfig) {
        super()
        this._id = currentId++
        this._release = config.release
        this._auth = config.auth
        this._queryEndpoint = config.queryEndpoint
        this._config = config.config
        this._log = config.logger
        this._errorHandler = config.errorHandler
        this._open = true
        this._currentTx = undefined
        this._workPipe = new Pipe(config.logger)
        this._sessionAffinityHeader = config.config.httpSessionAffinityHeader ?? 'neo4j-cluster-affinity'
    }

    run(query: string, parameters?: Record<string, unknown> | undefined, config?: RunQueryConfig | undefined): internal.observer.ResultStreamObserver {
        const observer = new ResultStreamObserver({
            highRecordWatermark: config?.highRecordWatermark ?? Number.MAX_SAFE_INTEGER,
            lowRecordWatermark: config?.lowRecordWatermark ?? Number.MIN_SAFE_INTEGER,
            afterComplete: config?.afterComplete,
            server: this._address,
        })

        const requestCodec = QueryRequestCodec.of(
            this._auth,
            query,
            parameters,
            config
        )

        this._abortController = new AbortController()

        this._workPipe.attach(() => {
            const request: RequestInit & { url: string } = {
                url: this._getTransactionApi(config?.database!),
                method: 'POST',
                mode: 'cors',
                headers: this._headers(requestCodec),
                signal: this._abortController?.signal,
                body: JSON.stringify(requestCodec.body)
            }
    
            this._log?.debug(`${this} REQUEST: ${JSON.stringify(request)} `)
    
            return fetch(request.url, request).
                then(async (res) => {
                    return [res.headers.get('content-type'), (await res.json()) as RawQueryResponse]
                })
                .catch((error) => this._handleAndReThrown(newError(`Failure accessing "${request.url}"`, 'SERVICE_UNAVAILABLE', error)))
                .catch((error) => observer.onError(error))
                .then(async ([contentType, rawQueryResponse]: [string, RawQueryResponse]) => {
                    if (rawQueryResponse == null) {
                        // is already dead
                        return
                    }
                    this._log?.debug(`${this} ${JSON.stringify(rawQueryResponse)}`)
                    const batchSize = config?.fetchSize ?? Number.MAX_SAFE_INTEGER
                    const codec = QueryResponseCodec.of(this._config, contentType, rawQueryResponse);
    
                    if (codec.error) {
                        throw codec.error
                    }
                    observer.onKeys(codec.keys)
                    const stream = codec.stream()
    
                    while (!observer.completed) {
                        if (observer.paused) {
                            await new Promise((resolve) => setTimeout(resolve, 20))
                            continue
                        }
    
                        for (let i = 0; !observer.paused && i < batchSize && !observer.completed; i++) {
                            const { done, value: rawRecord } = stream.next()
                            if (!done) {
                                observer.onNext(rawRecord)
                            } else {
                                observer.onCompleted(codec.meta)
                            }
                        }
                    }
    
                    observer.onCompleted(codec.meta)
    
                })
                .catch(this._handleAndReThrown.bind(this))
                .catch(error => { 
                    observer.onError(error)
                    throw error
                })
                .finally(() => {
                    this._abortController = undefined
                })
        })

        return observer
    }

    private _headers(requestCodec: any) {
        const headers: Record<string, string | ReadonlyArray<string>>  = {
            'Content-Type': requestCodec.contentType,
            Accept: requestCodec.accept,
            Authorization: requestCodec.authorization,
        }

        if (this._currentTx?.affinity != null) {
            headers[this._sessionAffinityHeader] = this._currentTx.affinity
        } 
        return headers
    }


    beginTransaction(config: BeginTransactionConfig): internal.observer.ResultStreamObserver {
        const observer = new ResultStreamObserver({
            server: this._address,
            afterComplete: config?.afterComplete,
            highRecordWatermark: Number.MAX_SAFE_INTEGER,
            lowRecordWatermark: Number.MIN_SAFE_INTEGER,
          })
        observer.prepareToHandleSingleResponse()


        const requestCodec = BeginTransactionRequestCodec.of(
            this._auth,
            config
        )

        this._abortController = new AbortController()

        this._workPipe.attach(() => {
            const request: RequestInit & { url: string } = {
                url: this._getExplicityTransactionApi(config?.database!),
                method: 'POST',
                mode: 'cors',
                headers: this._headers(requestCodec),
                signal: this._abortController?.signal,
                body: JSON.stringify(requestCodec.body)
            }
    
            this._log?.debug(`${this} REQUEST: ${JSON.stringify(request)} `)
    
            return fetch(request.url, request).
                then(async (res) => {
                    return [res.headers.get('content-type'), res.headers.get(this._sessionAffinityHeader), (await res.json()) as BeginTransactionResponse]
                })
                .catch((error) => this._handleAndReThrown(newError(`Failure accessing "${request.url}"`, 'SERVICE_UNAVAILABLE', error)))
                .catch((error) => observer.onError(error))
                .then(async ([contentType, affinity, rawBeginTransactionResponse]: [string, string|null, BeginTransactionResponse]) => {
                    if (rawBeginTransactionResponse == null) {
                        // is already dead
                        return
                    }
                    this._log?.debug(`${this} ${JSON.stringify(rawBeginTransactionResponse)}`)
                
                    const codec = BeginTransactionResponseCodec.of(this._config, contentType, rawBeginTransactionResponse);
    
                    if (codec.error) {
                        throw codec.error
                    }
    
                    this._currentTx = {
                        id: codec.id,
                        host: codec.host,
                        database: config?.database!,
                    }
    
                    if (affinity != null) {
                        this._currentTx.affinity = affinity
                    }
    
                    observer.onCompleted({})
                    
                })
                .catch(this._handleAndReThrown.bind(this))
                .catch(error => {
                    observer.onError(error)
                    throw error
                })
                .finally(() => {
                    this._abortController = undefined
                })
        })


        return observer
    }

    commitTransaction(config: CommitTransactionConfig): internal.observer.ResultStreamObserver {
        const observer = new ResultStreamObserver({
            server: this._address,
            afterComplete: config?.afterComplete,
            highRecordWatermark: Number.MAX_SAFE_INTEGER,
            lowRecordWatermark: Number.MIN_SAFE_INTEGER,
          })
        observer.prepareToHandleSingleResponse()


        const requestCodec = CommitTransactionRequestCodec.of(
            this._auth,
            config
        )

        this._abortController = new AbortController()

        this._workPipe.attach(() => {
            const request: RequestInit & { url: string } = {
                url: this._getTransactionCommitApi(),
                method: 'POST',
                mode: 'cors',
                headers: this._headers(requestCodec),
                signal: this._abortController?.signal,
            }
    
            this._log?.debug(`${this} REQUEST: ${JSON.stringify(request)} `)
    
            return fetch(request.url, request).
                then(async (res) => {
                    return [res.headers.get('content-type'), (await res.json()) as CommitTransactionResponse]
                })
                .catch((error) => this._handleAndReThrown(newError(`Failure accessing "${request.url}"`, 'SERVICE_UNAVAILABLE', error)))
                .catch((error) => observer.onError(error))
                .then(async ([contentType, rawCommitTransactionResponse]: [string, CommitTransactionResponse]) => {
                    if (rawCommitTransactionResponse == null) {
                        // is already dead
                        return
                    }
                    this._log?.debug(`${this} ${JSON.stringify(rawCommitTransactionResponse)}`)
                
                    const codec = CommitTransactionResponseCodec.of(this._config, contentType, rawCommitTransactionResponse);
    
                    if (codec.error) {
                        throw codec.error
                    }
    
                    this._currentTx = undefined
    
                    observer.onCompleted(codec.meta)
                    
                })
                .catch(this._handleAndReThrown.bind(this))
                .catch(error => {
                    observer.onError(error)
                    throw error
                })
                .finally(() => {
                    this._abortController = undefined
                })

        })

        

        return observer
    }

    rollbackTransaction(config: CommitTransactionConfig): internal.observer.ResultStreamObserver {
        const observer = new ResultStreamObserver({
            server: this._address,
            afterComplete: config?.afterComplete,
            highRecordWatermark: Number.MAX_SAFE_INTEGER,
            lowRecordWatermark: Number.MIN_SAFE_INTEGER,
          })
        observer.prepareToHandleSingleResponse()


        const requestCodec = RollbackTransactionRequestCodec.of(
            this._auth,
            config
        )

        this._abortController = new AbortController()

        this._workPipe.attach(() => {
            const request: RequestInit & { url: string } = {
                url: this._getTransactionApi(this._currentTx?.database!),
                method: 'DELETE',
                mode: 'cors',
                headers: this._headers(requestCodec),
                signal: this._abortController?.signal,
            }
    
            this._log?.debug(`${this} REQUEST: ${JSON.stringify(request)} `)
    
            return fetch(request.url, request).
                then(async (res) => {
                    return [res.headers.get('content-type'), (await res.json()) as RollbackTransactionResponse]
                })
                .catch((error) => this._handleAndReThrown(newError(`Failure accessing "${request.url}"`, 'SERVICE_UNAVAILABLE', error)))
                .catch((error) => observer.onError(error))
                .then(async ([contentType, rawRollbackTransactionResponse]: [string, RollbackTransactionResponse]) => {
                    if (rawRollbackTransactionResponse == null) {
                        // is already dead
                        return
                    }
                    this._log?.debug(`${this} ${JSON.stringify(rawRollbackTransactionResponse)}`)
                
                    const codec = RollbackTransactionResponseCodec.of(this._config, contentType, rawRollbackTransactionResponse);
    
                    if (codec.error) {
                        throw codec.error
                    }
    
                    this._currentTx = undefined
    
                    observer.onCompleted(codec.meta)
                    
                })
                .catch(this._handleAndReThrown.bind(this))
                .catch(error => {
                    observer.onError(error)
                    throw error
                })
                .finally(() => {
                    this._abortController = undefined
                })
        })

        return observer
    }

    private _handleAndReThrown(error: Error & { code: string, retriable: boolean }) {
        this._currentTx = undefined
        throw this._errorHandler(error)
    }

    private _getTransactionApi(database: string): string {
        if (this._currentTx === undefined) {
            return this._queryEndpoint.replace('{databaseName}', database)
        }
        // TODO: ADD HOST
        return this._queryEndpoint.replace('{databaseName}',  this._currentTx.database) + `/tx/${this._currentTx.id}`
    }

    private _getTransactionCommitApi(): string {
        // TODO: ADD HOST
        return this._queryEndpoint.replace('{databaseName}', this._currentTx?.database!) + `/tx/${this._currentTx?.id}/commit`
    }

    private _getExplicityTransactionApi(database: string): string {
        return this._queryEndpoint.replace('{databaseName}', database) + '/tx'
    }

    static async discover({ scheme, address }: { scheme: HttpScheme, address: internal.serverAddress.ServerAddress }): Promise<{
        query: string
        version: string
        edition: string
    }> {
        return await fetch(`${scheme}://${address.asHostPort()}`, {
            headers: {
                Accept: 'application/json',
            }
        })
            .then(async (res) => (await res.json()) as Record<string, string>)
            .then(json => {
                if (typeof json.query !== 'string') {
                    throw new Error('Query API is not available')

                }
                return { query: json.query, version: json.neo4j_version, edition: json.neo4j_edition }
            })
            .catch(e => {
                throw newError(`Failure discovering endpoints. Caused by: ${e.message}`, 'SERVICE_UNAVAILABLE', e)
            })
    }

    get id (): number {
        return this._id
    }

    set auth(auth: types.AuthToken) {
        this._auth = auth
    }

    get auth(): types.AuthToken {
        return this._auth
    }

    set queryEndpoint(queryEndpoint: string) {
        this._queryEndpoint = queryEndpoint
    }

    get queryEndpoint(): string {
        return this._queryEndpoint
    }

    getProtocolVersion(): number {
        return 0
    }

    isOpen(): boolean {
        return this._open
    }

    hasOngoingObservableRequests(): boolean {
        return this._abortController != null
    }

    async resetAndFlush(): Promise<void> {
        this._abortController?.abort(newError('User aborted operation.'))
        this._currentTx = undefined
        this._workPipe.recover()
    }

    release(): Promise<void> {
        this._workPipe.recover()
        return this._release()
    }

    async close(): Promise<void> {
        this._abortController?.abort(newError('Aborted since connection is being closed.'))
        this._open = false
    }

    toString() {
        return `HttpConnection [${this._id}]`
    }
}