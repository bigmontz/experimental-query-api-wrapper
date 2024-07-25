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

export interface HttpConnectionProviderConfig {
    id: number,
    log: internal.logger.Logger
    address: internal.serverAddress.ServerAddress
    scheme: HttpScheme
    authTokenManager: AuthTokenManager
    config: types.InternalConfig
    [rec: string]: any
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


    constructor(config: HttpConnectionProviderConfig) {
        super()
        this._id = config.id
        this._log = config.log
        this._address = config.address
        this._scheme = config.scheme
        this._authTokenManager = config.authTokenManager
        this._config = config.config
    }

    async acquireConnection(param?: { accessMode?: string | undefined; database?: string | undefined; bookmarks: internal.bookmarks.Bookmarks; impersonatedUser?: string | undefined; onDatabaseNameResolved?: ((databaseName?: string | undefined) => void) | undefined; auth?: types.AuthToken | undefined } | undefined): Promise<Connection & Releasable> {
        if (this._queryEndpoint == null) {
            if (this._discoveryPromise == null) {
                this._discoveryPromise = HttpConnection.discover({ address: this._address, scheme: this._scheme })
            }

            const discoveryResult = await this._discoveryPromise
            this._queryEndpoint = discoveryResult.query
        }
        
        const auth = param?.auth ?? await this._authTokenManager.getToken()
        
        return new HttpConnection({ release: async () => {}, auth, address: this._address, database: (param?.database ?? 'neo4j'), queryEndpoint: this._queryEndpoint, config: this._config, logger: this._log }) 
    }


    async verifyConnectivityAndGetServerInfo(param?: { database?: string | undefined; accessMode?: string | undefined } | undefined): Promise<ServerInfo> {
        const discoveryInfo = await HttpConnection.discover({ scheme: this._scheme, address: this._address })
        
        return new ServerInfo({
            address: this._address,
            version: discoveryInfo.version
        }, parseFloat(discoveryInfo.version))
    }
    
    async close(): Promise<void> {
        
    }
}