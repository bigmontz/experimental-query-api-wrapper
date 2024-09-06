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

import { auth, authTokenManagers, internal, newError, staticAuthTokenManager } from "neo4j-driver-core"
import HttpConnection, { HttpScheme } from '../../../src/http-connection/connection.http'
import { logging } from '../../../src'

type NewPool = (...params: ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>) => internal.pool.Pool<HttpConnection>


describe('HttpConnectionProvider', () => {

    describe('pool configuration', () => {
        describe('create', () => {
            it('should create a connection and register in the open connections', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { provider } = newProvider(address, newPool)

                const [[{ create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')

                const connection = await create!({}, address, async () => {})

                expect(connection).toBeInstanceOf(HttpConnection)

                // @ts-expect-error
                expect(provider._openConnections[connection.id]).toBe(connection)
            })

            it('should configure release function', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                newProvider(address, newPool)
                const release = jest.fn(async (address: internal.serverAddress.ServerAddress, connection: HttpConnection) => {})

                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({}, address, release)


                expect(release.mock.calls.length).toBe(0)

                await connection.release()

                expect(release).toHaveBeenCalledWith(address, connection)
            })

            it('should configure context auth when available', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                newProvider(address, newPool)
                const authToken = auth.basic('local_user', 'local_password')
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ auth: authToken }, address, async () => {})

                expect(connection.auth).toBe(authToken)
            })

            it('should configure auth token provided by auth manager when no auth in context', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { authTokenManager} } = newProvider(address, newPool)
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                expect(connection.auth).toBe(await authTokenManager.getToken())
            })

            it('should configure query endpoint', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { provider, } = newProvider(address, newPool)
                const queryEndpoint = 'myqueryendpoint'
                // @ts-expect-error
                provider._queryEndpoint = queryEndpoint

                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                // @ts-expect-error
                expect(connection._queryEndpoint).toBe(queryEndpoint)
            })

            it('should configure query endpoint', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { config }} = newProvider(address, newPool)
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                // @ts-expect-error
                expect(connection._config).toBe(config)
            })
            
            it('should configure logger', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { log }} = newProvider(address, newPool)
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                // @ts-expect-error
                expect(connection._log).toBe(log)
            })

            describe('configured error handler', () => {
                it.each([
                    [null],
                    [undefined],
                    [new Error('some no neo4j error')],
                    [newError('some neo4j error', 'Neo.ClientError.Made.Up')], 
                ])('should return unmodified error when %s', async (error: Error | undefined | null) => {
                    const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                    const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                    const { params: { authTokenManager } } = newProvider(address, newPool)
                    const spyOnHandleSecurityException = jest.spyOn(authTokenManager, 'handleSecurityException')

                    const [[{ create }]] = newPool.mock.calls
    

                    const connection = await create!({ }, address, async () => {})

                    // @ts-expect-error
                    const errorHandler = connection._errorHandler
    
                    // @ts-expect-error
                    const returnedError = errorHandler(error)
                    expect(returnedError).toBe(error)
                    if (error != null && typeof error === 'object') {
                        // @ts-expect-error
                        expect(returnedError.retriable).not.toBe(true)
                    }

                    expect(spyOnHandleSecurityException).not.toHaveBeenCalled()
                })

                it.each([
                    [newError('some retriable error', 'Neo.ClientError.Security.MadeUp'), true],
                    [newError('some retriable error', 'Neo.ClientError.Security.MadeUp'), false]
                ])('should treated security error %s when as authManager said', async (error: Error, retriable: boolean) => {
                    const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                    const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                    const { params: { authTokenManager } } = newProvider(address, newPool)
                    const spyOnHandleSecurityException = jest.spyOn(authTokenManager, 'handleSecurityException')
                    spyOnHandleSecurityException.mockImplementation(() => retriable)
                    
                    const [[{ create }]] = newPool.mock.calls
    

                    const connection = await create!({ }, address, async () => {})

                    // @ts-expect-error
                    const errorHandler = connection._errorHandler
    
                    // @ts-expect-error
                    const returnedError = errorHandler(error)
                    expect(returnedError).toBe(error)
                    // @ts-expect-error
                    expect(returnedError.retriable).toBe(retriable)
                })
            })
        })

        describe('destroy', () => {
            it('should close a connection and de-register in the open connections', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { provider } = newProvider(address, newPool)

                const [[{ destroy, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof destroy).toBe('function')
                await destroy!(connection)

                // @ts-expect-error
                expect(provider._openConnections.hasOwnProperty(connection.id)).toBe(false)
                expect(connection.isOpen()).toBe(false)
            })
        })

        describe('validateOnAcquire', () => {
            it('should update auth with context auth', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                newProvider(address, newPool)

                const [[{ validateOnAcquire, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof validateOnAcquire).toBe('function')

                const newAuth = auth.basic('newUser', 'newPassword')
                expect(await validateOnAcquire!({ auth: newAuth }, connection)).toBe(true)

                expect(connection.auth).toEqual(newAuth)
            })

            it('should update auth with authManager auth', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { authTokenManager } } = newProvider(address, newPool)
                const spyOnGetToken = jest.spyOn(authTokenManager, 'getToken')
                    

                const [[{ validateOnAcquire, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof validateOnAcquire).toBe('function')

                const newAuth = auth.basic('newUser', 'newPassword')
                spyOnGetToken.mockResolvedValueOnce(newAuth)
                expect(await validateOnAcquire!({ }, connection)).toBe(true)

                expect(connection.auth).toEqual(newAuth)
            })

            it('should return false if update auth token fail', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { authTokenManager } } = newProvider(address, newPool)
                const spyOnGetToken = jest.spyOn(authTokenManager, 'getToken')
                    

                const [[{ validateOnAcquire, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)

                expect(typeof validateOnAcquire).toBe('function')

                const newAuth = auth.basic('newUser', 'newPassword')
                spyOnGetToken.mockRejectedValueOnce(new Error('failed'))
                expect(await validateOnAcquire!({ }, connection)).toBe(false)

                expect(connection.auth).not.toEqual(newAuth)
            })
        })
    })
})

function newProvider(address: internal.serverAddress.ServerAddress, newPool: jest.Mock<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>) {
    const params = {
        address,
        authTokenManager: staticAuthTokenManager({ authToken: auth.basic('neo4j', 'password ') }),
        config: { encrypted: false },
        id: 1,
        scheme: 'http' as HttpScheme,
        log: new internal.logger.Logger('debug', () => { })
    }
    
    return { provider :new HttpConnectionProvider(params, {
        newPool
    }), params }
}
