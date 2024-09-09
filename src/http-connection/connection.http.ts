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
import { RunQueryConfig } from "neo4j-driver-core/types/connection"
import { ResultStreamObserver } from "./stream-observers"
import { QueryRequestCodec, QueryResponseCodec, RawQueryResponse } from "./query.codec"

export type HttpScheme = 'http' | 'https'

let currentId = 0

export interface HttpConnectionConfig {
    release: () => Promise<void>
    auth: types.AuthToken
    queryEndpoint: string
    address: internal.serverAddress.ServerAddress
    config: types.InternalConfig
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
    private _id: number
    private _errorHandler: (error: Error & { code: string, retriable: boolean }) => Error
    private _open: boolean

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

        const request: RequestInit & { url: string } = {
            url: this._getTransactionApi(config?.database!),
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': requestCodec.contentType,
                Accept: requestCodec.accept,
                Authorization: requestCodec.authorization,
            },
            signal: this._abortController.signal,
            body: JSON.stringify(requestCodec.body)
        }

        this._log?.debug(`${this} REQUEST: ${JSON.stringify(request)} `)

        fetch(request.url, request).
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
            .catch(error => observer.onError(error))
            .finally(() => {
                this._abortController = undefined
            })

        return observer
    }

    private _handleAndReThrown(error: Error & { code: string, retriable: boolean }) {
        throw this._errorHandler(error)
    }

    private _getTransactionApi(database: string): string {
        return this._queryEndpoint.replace('{databaseName}', database)
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
    }

    release(): Promise<void> {
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