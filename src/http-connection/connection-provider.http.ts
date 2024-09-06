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
import { ConnectionProvider, internal, AuthTokenManager, Connection, Releasable, types, ServerInfo } from "neo4j-driver-core"
import HttpConnection, { HttpScheme } from "./connection.http"

const {
    pool: { 
        Pool,
        PoolConfig,
    }
} = internal 

export type HttpConnectionProviderConfig = {
    id: number,
    log: internal.logger.Logger
    address: internal.serverAddress.ServerAddress
    scheme: HttpScheme
    authTokenManager: AuthTokenManager
    config: types.InternalConfig
    [rec: string]: any
}

type AcquisitionContext = { auth: types.AuthToken }

export type HttpConnectionProviderInjectable = {
    newPool: (...params: ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>) => internal.pool.Pool<HttpConnection>
}

export default class HttpConnectionProvider extends ConnectionProvider {
    private _id: number
    private _log: internal.logger.Logger
    private _address: internal.serverAddress.ServerAddress
    private _scheme: HttpScheme
    private _authTokenManager: AuthTokenManager
    private _config: types.InternalConfig
    private _queryEndpoint?: string
    private _discoveryPromise?: Promise<{
        query: string
    }>
    private _openConnections: { [n: number]: HttpConnection}
    private _pool: internal.pool.Pool<HttpConnection>
    
    constructor(config: HttpConnectionProviderConfig, { newPool }: HttpConnectionProviderInjectable = {
        newPool: (...params) => new Pool<HttpConnection>(...params) 
    }) {
        super()
        this._id = config.id
        this._log = config.log
        this._address = config.address
        this._scheme = config.scheme
        this._authTokenManager = config.authTokenManager
        this._config = config.config
        this._openConnections = {}
        this._pool = newPool({
            create: this._createConnection.bind(this),
            destroy: this._destroyConnection.bind(this),
            validateOnAcquire: this._validateConnectionOnAcquire.bind(this),
            config: PoolConfig.fromDriverConfig(config.config),
            log: this._log
        })
    }

    async acquireConnection(param?: { accessMode?: string | undefined; database?: string | undefined; bookmarks: internal.bookmarks.Bookmarks; impersonatedUser?: string | undefined; onDatabaseNameResolved?: ((databaseName?: string | undefined) => void) | undefined; auth?: types.AuthToken | undefined } | undefined): Promise<Connection & Releasable> {
        if (this._queryEndpoint == null) {
            if (this._discoveryPromise == null) {
                this._discoveryPromise = HttpConnection.discover({ address: this._address, scheme: this._scheme })
            }

            const discoveryResult = await this._discoveryPromise
            this._queryEndpoint = discoveryResult.query
        }

        return await this._pool.acquire({ auth: param?.auth }, this._address)
    }


    async verifyConnectivityAndGetServerInfo(param?: { database?: string | undefined; accessMode?: string | undefined } | undefined): Promise<ServerInfo> {
        const discoveryInfo = await HttpConnection.discover({ scheme: this._scheme, address: this._address })

        return new ServerInfo({
            address: this._address,
            version: discoveryInfo.version
        }, parseFloat(discoveryInfo.version))
    }

    async supportsMultiDb(): Promise<boolean> {
        return true
    }

    async close(): Promise<void> {
        await this._pool.close()

        await Promise.all(Object.values(this._openConnections).map(c => c.close()))
    }

    private async _createConnection(
        context: AcquisitionContext,
        address: internal.serverAddress.ServerAddress,
        release: (address: internal.serverAddress.ServerAddress, connection: HttpConnection) => Promise<void>): Promise<HttpConnection> {

        const auth = context.auth ?? await this._authTokenManager.getToken()

        const connection: HttpConnection = new HttpConnection({
            release: async () => await release(address, connection),
            auth,
            address,
            queryEndpoint: this._queryEndpoint!,
            config: this._config,
            logger: this._log,
            errorHandler: (error: Error & { code: string, retriable: boolean }): Error => {
                if (error == null || typeof error.code !== 'string' || !error.code.startsWith('Neo.ClientError.Security.') || context?.auth != null) {
                    return error
                }
                const handled = this._authTokenManager.handleSecurityException(auth, error.code as unknown as `Neo.ClientError.Security.${string}`)
                if (handled) {
                    error.retriable = true
                }

                return error
            }
        })

        this._openConnections[connection.id] = connection

        return connection
    }

    private async _validateConnectionOnAcquire(context: AcquisitionContext, conn: HttpConnection): Promise<boolean> {
        try {
            conn.auth = context.auth ?? await this._authTokenManager.getToken()
            return true
        } catch (error) {
            this._log.debug(
                `The connection ${conn.id} is not valid because of an error ${error.code} '${error.message}'`
            )
            return false
        }
    }

    private async _destroyConnection (conn: HttpConnection): Promise<void> {
        delete this._openConnections[conn.id]
        return await conn.close()
    }
}