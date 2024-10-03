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

import { error, newError, types } from "neo4j-driver-core"
import { BeginTransactionConfig } from "neo4j-driver-core/types/connection"

export type BeginTransactionRequestCodecConfig = Pick<BeginTransactionConfig, 'bookmarks' | 'txConfig' | 'mode' | 'impersonatedUser'>
export type CommitTransactionRequestCodecConfig = {}
export type RollbackTransactionRequestCodecConfig = {}


// TODO: EXTRACT COMMON
const NEO4J_QUERY_CONTENT_TYPE = 'application/vnd.neo4j.query'

export type RawTransaction = {
    id: string
    expires: number
    tx_host: string
}

export type RawBeginTransactionSuccessResponse = {
    transaction: RawTransaction
}

export type RawTransactionError = {
    code: string,
    message: string
    error?: string
}

export type RawTransactionFailuresResponse = {
    errors: RawTransactionError[]
}

export type BeginTransactionResponse = RawBeginTransactionSuccessResponse | RawTransactionFailuresResponse 

export class BeginTransactionRequestCodec {
    private _body?: Record<string, unknown>
 
    static of (
        auth: types.AuthToken,
        config?: BeginTransactionRequestCodecConfig | undefined
    ): BeginTransactionRequestCodec {
        return new BeginTransactionRequestCodec(auth, config)
    }

    private constructor(
        private _auth: types.AuthToken,
        private _config?: BeginTransactionRequestCodecConfig
    ) {

    }

    get contentType (): string {
        return `${NEO4J_QUERY_CONTENT_TYPE}, application/json`
    }

    get accept (): string {
        // TODO: verify accept type
        return 'application/json'
    }

    get authorization(): string {
        // TODO: Move shared logic to common file.
        switch (this._auth.scheme) {
            case 'bearer':
                return `Bearer ${btoa(this._auth.credentials)}`
            case 'basic':
                return `Basic ${btoa(`${this._auth.principal}:${this._auth.credentials}`)}`
            default:
                throw new Error(`Authorization scheme "${this._auth.scheme}" is not supported.`)
        }
    }

    get body (): Record<string, unknown> {
        // TODO: MOVE COMMON LOGIC TO COMMON PLACE, MAYBE
        if (this._body != null) {
            return this._body
        }

        this._body = {}

        if (this._config?.bookmarks != null && !this._config.bookmarks.isEmpty()) {
            this._body.bookmarks = this._config?.bookmarks?.values()
        }

        if (this._config?.txConfig.timeout != null) {
            this._body.maxExecutionTime = this._config?.txConfig.timeout.toInt()
        }

        if (this._config?.impersonatedUser != null) {
            this._body.impersonatedUser = this._config?.impersonatedUser
        }

        if (this._config?.mode) {
            this._body.accessMode = this._config.mode.toUpperCase()
        }

        return this._body
    }
}

export class BeginTransactionResponseCodec {
    static of(
        config: types.InternalConfig,
        contentType: string,
        response: BeginTransactionResponse): BeginTransactionResponseCodec {
        if (isSuccess(response)) {
            return new BeginTransactionSuccessResponseCodec(config, response)
        }

        return new BeginTransactionFailureResponseCodec(response.errors?.length > 0 ?
            newError(
                response.errors[0].message,
                // TODO: REMOVE THE ?? AND .ERROR WHEN SERVER IS FIXED
                response.errors[0].code ?? response.errors[0].error
            ) :
            newError('Server replied an empty error response', error.PROTOCOL_ERROR))

    }

    get error(): Error | undefined {
        throw new Error('Not implemented')
    }

    get id(): string {
        throw new Error('Not implemented')
    }

    get expires(): number {
        throw new Error('Not implemented')
    }

    get host(): string {
        throw new Error('Not implemented')
    }

}

class  BeginTransactionSuccessResponseCodec extends BeginTransactionResponseCodec {
    constructor(
        private readonly _config: types.InternalConfig, 
        private readonly _response: RawBeginTransactionSuccessResponse) {
        super()
    }

    get error(): Error | undefined {
        return undefined;
    }

    get id(): string {
        return this._response.transaction.id
    }

    get expires(): number {
        throw this._response.transaction.expires
    }

    get host(): string {
        throw this._response.transaction.tx_host
    }
}

class BeginTransactionFailureResponseCodec extends BeginTransactionResponseCodec {
    constructor(private readonly _error: Error) {
        super()
    }

    get error(): Error | undefined {
        return this._error
    }

    get id(): string {
        throw this._error
    }

    get expires(): number {
        throw this._error
    }

    get host(): string {
        throw this._error
    }
}

export type RawCommitTransactionSuccessResponse = {
    bookmarks: string[] | undefined
}

export type CommitTransactionResponse = RawCommitTransactionSuccessResponse | RawTransactionFailuresResponse 


export class CommitTransactionRequestCodec {
    static of (
        auth: types.AuthToken,
        config?: CommitTransactionRequestCodecConfig | undefined
    ): CommitTransactionRequestCodec {
        return new CommitTransactionRequestCodec(auth, config)
    }

    private constructor(
        private _auth: types.AuthToken,
        private _config?: CommitTransactionRequestCodecConfig
    ) {

    }

    get contentType (): string {
        return `${NEO4J_QUERY_CONTENT_TYPE}, application/json`
    }

    get accept (): string {
        // TODO: verify accept type
        return 'application/json'
    }

    get authorization(): string {
        // TODO: Move shared logic to common file.
        switch (this._auth.scheme) {
            case 'bearer':
                return `Bearer ${btoa(this._auth.credentials)}`
            case 'basic':
                return `Basic ${btoa(`${this._auth.principal}:${this._auth.credentials}`)}`
            default:
                throw new Error(`Authorization scheme "${this._auth.scheme}" is not supported.`)
        }
    }
}

export class CommitTransactionResponseCodec {
    static of(
        config: types.InternalConfig,
        contentType: string,
        response: CommitTransactionResponse): CommitTransactionResponseCodec {
        if (isCommitSuccess(response)) {
            return new CommitTransactionSuccessResponseCodec(config, response)
        }

        return new CommitTransactionFailureResponseCodec(response.errors?.length > 0 ?
            newError(
                response.errors[0].message,
                // TODO: REMOVE THE ?? AND .ERROR WHEN SERVER IS FIXED
                response.errors[0].code ?? response.errors[0].error
            ) :
            newError('Server replied an empty error response', error.PROTOCOL_ERROR))

    }

    get error(): Error | undefined {
        throw new Error('Not implemented')
    }

    get meta(): Record<string, unknown> {
        throw new Error('Not implemented')
    }
}

class  CommitTransactionSuccessResponseCodec extends CommitTransactionResponseCodec {
    constructor(
        private readonly _config: types.InternalConfig, 
        private readonly _response: RawCommitTransactionSuccessResponse) {
        super()
    }

    get error(): Error | undefined {
        return undefined;
    }

    get meta(): Record<string, unknown> {
        return {
            bookmarks: this._response.bookmarks
        }
    }
}

class CommitTransactionFailureResponseCodec extends CommitTransactionResponseCodec {
    constructor(private readonly _error: Error) {
        super()
    }

    get error(): Error | undefined {
        return this._error
    }

    get meta(): Record<string, unknown> {
        throw this._error
    }
}

export type RawRollbackTransactionSuccessResponse = {
    e: any
}

export type RollbackTransactionResponse = RawRollbackTransactionSuccessResponse | RawTransactionFailuresResponse 


export class RollbackTransactionRequestCodec {
    static of (
        auth: types.AuthToken,
        config?: RollbackTransactionRequestCodecConfig | undefined
    ): RollbackTransactionRequestCodec {
        return new RollbackTransactionRequestCodec(auth, config)
    }

    private constructor(
        private _auth: types.AuthToken,
        private _config?: RollbackTransactionRequestCodecConfig
    ) {

    }

    get contentType (): string {
        return `${NEO4J_QUERY_CONTENT_TYPE}, application/json`
    }

    get accept (): string {
        // TODO: verify accept type
        return 'application/json'
    }

    get authorization(): string {
        // TODO: Move shared logic to common file.
        switch (this._auth.scheme) {
            case 'bearer':
                return `Bearer ${btoa(this._auth.credentials)}`
            case 'basic':
                return `Basic ${btoa(`${this._auth.principal}:${this._auth.credentials}`)}`
            default:
                throw new Error(`Authorization scheme "${this._auth.scheme}" is not supported.`)
        }
    }
}

export class RollbackTransactionResponseCodec {
    static of(
        config: types.InternalConfig,
        contentType: string,
        response: RollbackTransactionResponse): RollbackTransactionResponseCodec {
        if (isRollbackSuccess(response)) {
            return new RollbackTransactionSuccessResponseCodec(config, response)
        }

        return new RollbackTransactionFailureResponseCodec(response.errors?.length > 0 ?
            newError(
                response.errors[0].message,
                // TODO: REMOVE THE ?? AND .ERROR WHEN SERVER IS FIXED
                response.errors[0].code ?? response.errors[0].error
            ) :
            newError('Server replied an empty error response', error.PROTOCOL_ERROR))

    }

    get error(): Error | undefined {
        throw new Error('Not implemented')
    }

    get meta(): Record<string, unknown> {
        throw new Error('Not implemented')
    }
}

class  RollbackTransactionSuccessResponseCodec extends RollbackTransactionResponseCodec {
    constructor(
        private readonly _config: types.InternalConfig, 
        private readonly _response: RawRollbackTransactionSuccessResponse) {
        super()
    }

    get error(): Error | undefined {
        return undefined;
    }

    get meta(): Record<string, unknown> {
        return {
        }
    }
}

class RollbackTransactionFailureResponseCodec extends RollbackTransactionResponseCodec {
    constructor(private readonly _error: Error) {
        super()
    }

    get error(): Error | undefined {
        return this._error
    }

    get meta(): Record<string, unknown> {
        throw this._error
    }
}

function isSuccess(obj: BeginTransactionResponse): obj is RawBeginTransactionSuccessResponse {
    // @ts-expect-error
    if (obj.errors != null) {
        return false
    }
    return true
}

function isCommitSuccess(obj: CommitTransactionResponse): obj is RawCommitTransactionSuccessResponse {
    // @ts-expect-error
    if (obj.errors != null) {
        return false
    }
    return true
}

function isRollbackSuccess(obj: RollbackTransactionResponse): obj is RawRollbackTransactionSuccessResponse {
    // @ts-expect-error
    if (obj.errors != null) {
        return false
    }
    return true
}