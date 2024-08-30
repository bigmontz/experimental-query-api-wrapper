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

import HttpConnectionProvider, { 
    HttpConnectionProviderInjectable, 
    HttpConnectionProviderConfig 
} from '../../../src/http-connection/connection-provider.http'

import { auth, authTokenManagers, internal, staticAuthTokenManager } from "neo4j-driver-core"
import HttpConnection from '../../../src/http-connection/connection.http'
import { logging } from '../../../src'

type NewPool = (...params: ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>) => internal.pool.Pool<HttpConnection>


describe('HttpConnectionProvider', () => {

    describe('pool configuration', () => {
        describe('create', () => {
            it('should create a connection and register in the open connections', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const provider = newProvider(address, newPool)

                const [[{ create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')

                const connection = await create!({}, address, async () => {})

                expect(connection).toBeInstanceOf(HttpConnection)

                // @ts-expect-error
                expect(provider._openConnections[connection.id]).toBe(connection)

                // needs to check connection construction
            })
        })

        describe('destroy', () => {
            it('should close a connection and de-register in the open connections', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const provider = newProvider(address, newPool)

                const [[{ destroy, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof destroy).toBe('function')
                await destroy!(connection)

                // @ts-expect-error
                expect(provider._openConnections.hasOwnProperty(connection.id)).toBe(false)
                expect(connection.isOpen()).toBe(false)
                // needs to check connection construction
            })
        })

        describe('validateOnAcquire', () => {
            it('should update auth', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const provider = newProvider(address, newPool)

                const [[{ validateOnAcquire, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof validateOnAcquire).toBe('function')

                const newAuth = auth.basic('newUser', 'newPassword')
                await validateOnAcquire!({ auth: newAuth }, connection)

                expect(connection.auth).toEqual(newAuth)
            })
        })
    })
})

function newProvider(address: internal.serverAddress.ServerAddress, newPool: jest.Mock<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>) {
    return new HttpConnectionProvider({
        address,
        authTokenManager: staticAuthTokenManager({ authToken: auth.basic('neo4j', 'password ') }),
        config: {},
        id: 1,
        scheme: 'http',
        log: new internal.logger.Logger('debug', () => { })
    }, {
        newPool
    })
}
