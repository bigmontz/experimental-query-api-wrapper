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
    HttpConnectionProviderInjectable, NewHttpConnection
} from '../../../src/http-connection/connection-provider.http'

import { auth, internal, newError, staticAuthTokenManager } from "neo4j-driver-core"
import HttpConnection, { HttpScheme } from '../../../src/http-connection/connection.http'
import { RunQueryConfig } from "neo4j-driver-core/types/connection"
import { ResultStreamObserver } from '../../../src/http-connection/stream-observers'
import { AuthToken } from '../../../src'



const {
    pool: {
        Pool
    }
} = internal


type JestSpiesRun =  jest.SpyInstance<
    internal.observer.ResultStreamObserver, 
    [query: string, parameters?: Record<string, unknown> | undefined, config?: RunQueryConfig | undefined], 
    any
>

type JestSpiesOnRelease = jest.SpyInstance<Promise<void>, [], any>

describe('HttpConnectionProvider', () => {
    describe('pool configuration', () => {
        describe('create', () => {
            it('should create a connection and register in the open connections', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { provider } = newProvider(address, { newPool })

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
                newProvider(address, { newPool })
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
                newProvider(address, { newPool })
                const authToken = auth.basic('local_user', 'local_password')
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ auth: authToken }, address, async () => {})

                expect(connection.auth).toBe(authToken)
            })

            it('should configure auth token provided by auth manager when no auth in context', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { authTokenManager} } = newProvider(address, { newPool })
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                expect(connection.auth).toBe(await authTokenManager.getToken())
            })

            it('should configure query endpoint', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { provider, } = newProvider(address, { newPool })
                const queryEndpoint = 'myqueryendpoint'
                // @ts-expect-error
                provider._queryEndpoint = queryEndpoint

                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ queryEndpoint }, address, async () => {})

                // @ts-expect-error
                expect(connection._queryEndpoint).toBe(queryEndpoint)
            })

            it('should set config', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { config }} = newProvider(address, { newPool })
                
                const [[{ create }]] = newPool.mock.calls

                const connection = await create!({ }, address, async () => {})

                // @ts-expect-error
                expect(connection._config).toBe(config)
            })
            
            it('should configure logger', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { log }} = newProvider(address, { newPool })
                
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
                    const { params: { authTokenManager } } = newProvider(address, { newPool })
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

                it('should forget _queryEndpoint when SERVICE_UNAVAILABLE', async () => {
                    const error = newError('some neo4j error', 'SERVICE_UNAVAILABLE')
                    const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                    const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                    const { provider, params: { authTokenManager } } = newProvider(address, { newPool })
                    const spyOnHandleSecurityException = jest.spyOn(authTokenManager, 'handleSecurityException')
                    // @ts-expect-error
                    provider._queryEndpoint = 'some endpoint'

                    const [[{ create }]] = newPool.mock.calls
    

                    const connection = await create!({ }, address, async () => {})


                    // @ts-expect-error
                    const errorHandler = connection._errorHandler
    
                    const returnedError = errorHandler(error)
                    expect(returnedError).toBe(error)
                    if (error != null && typeof error === 'object') {
                        // @ts-expect-error
                        expect(returnedError.retriable).not.toBe(true)
                    }

                    expect(spyOnHandleSecurityException).not.toHaveBeenCalled()

                    // @ts-expect-error
                    expect(provider._queryEndpoint).toBe(undefined)  
                }) 

                it.each([
                    [newError('some retriable error', 'Neo.ClientError.Security.MadeUp'), true],
                    [newError('some retriable error', 'Neo.ClientError.Security.MadeUp'), false]
                ])('should treated security error %s when as authManager said', async (error: Error, retriable: boolean) => {
                    const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                    const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                    const { params: { authTokenManager } } = newProvider(address, { newPool })
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
                const { provider } = newProvider(address, { newPool })

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
                const { provider } = newProvider(address, { newPool })

                const [[{ validateOnAcquire, create }]] = newPool.mock.calls

                expect(typeof create).toBe('function')
                const connection = await create!({ queryEndpoint: 'endpoint 1'}, address, async () => {})
                expect(connection).toBeInstanceOf(HttpConnection)
                expect(connection.queryEndpoint).toBe('endpoint 1')

                expect(typeof validateOnAcquire).toBe('function')

                const newAuth = auth.basic('newUser', 'newPassword')
                expect(await validateOnAcquire!({ auth: newAuth, queryEndpoint: 'endpoint 2' }, connection)).toBe(true)

                expect(connection.auth).toEqual(newAuth)
                expect(connection.queryEndpoint).toBe('endpoint 2')
            })

            it('should update auth with authManager auth', async () => {
                const newPool = jest.fn<internal.pool.Pool<HttpConnection>, ConstructorParameters<typeof internal.pool.Pool<HttpConnection>>>()
                const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
                const { params: { authTokenManager } } = newProvider(address, { newPool })
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
                const { params: { authTokenManager } } = newProvider(address, { newPool })
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

    describe('.supportsMultiDb()', () => {
        it ('should resolves true', async () => {
            const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
            const { provider } = newProvider(address, { newPool: jest.fn() })

            await expect(provider.supportsMultiDb()).resolves.toBe(true)
        })
    })

    describe('.supportsUserImpersonation()', () => {
        it ('should resolves true', async () => {
            const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
            const { provider } = newProvider(address)

            await expect(provider.supportsUserImpersonation()).resolves.toBe(true)
        })
    })

    describe('.supportsSessionAuth()', () => {
        it ('should resolves true', async () => {
            const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
            const { provider } = newProvider(address)

            await expect(provider.supportsSessionAuth()).resolves.toBe(true)
        })
    })

    describe.each(['READ', 'WRITE'].flatMap(mode => [
        ['neo4j', mode],
        ['system', mode],
        ['otherdb', mode]
    ]))('.verifyConnectivityAndGetServerInfo({ database: "%s", accessMode: "%"})', (database, accessMode) => {
        const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
        
        it('should be able to acquire a new connection and run "CALL db.ping()" using access mode', async () => {    
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address)

            // new instances
            const { provider, params: { scheme} } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject
            const result = await provider.verifyConnectivityAndGetServerInfo({ database, accessMode })

            // Assert results
            expect(result.address).toBe(address.asHostPort())
            expect(result.protocolVersion).toBe(5.19)
            expect(result.agent).toBe('5.19.0')

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it('should throw when release throws', async () => {
            const error = new Error('something in the way it crashes')
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address, { 
                mockReleaseImplementation: async () => {
                    throw error
                }
            })

            // new instances
            const { provider, params: { scheme} } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject and assertion
            await expect(provider.verifyConnectivityAndGetServerInfo({ database, accessMode })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it('should fail if query run fails', async () => {
            const error = new Error('something in the way it crashes')
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address, { 
                mockRunImplementation: () => {
                    const observer = new ResultStreamObserver({
                        server: address,
                        highRecordWatermark: 100,
                        lowRecordWatermark: 1001
                    })
        
                    observer.onError(error)
        
                    return observer
                }
            })

            // new instances
            const { provider, params: { scheme} } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject and assertion
            await expect(provider.verifyConnectivityAndGetServerInfo({ database, accessMode })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it('should fail if discovery fails', async () => {
            const error = new Error('something in the way it crashes')
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address)

            // new instances
            const { provider, params: { scheme} } = newProvider(address, { newHttpConnection })
            
            // mocking
            discoverSpy.mockRejectedValue(error)

            // Subject and assertion
            await expect(provider.verifyConnectivityAndGetServerInfo({ database, accessMode })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(0)
            expect(spyOnRunners.length).toBe(0)
            expect(spyOnRelease.length).toBe(0)
        })
    })

    describe.each(['READ', 'WRITE'].flatMap(mode => [
            [mode, auth.basic('session', 'password')],
            [mode, auth.bearer('the session bearer')],
            [mode, undefined]
        ]).flatMap((modeAndAuth) => [
            ['neo4j', ...modeAndAuth],
            ['system', ...modeAndAuth],
            ['otherdb', ...modeAndAuth]
        ]) as [string, string, AuthToken | undefined][]
    )('.verifyAuthentication({ database: "%s", accessMode: "%", auth: %o})', (database, accessMode, auth) => {
        const address = internal.serverAddress.ServerAddress.fromUrl('localhost:7474')
        
        it('should be return true if connection acquisition and query run successfully', async () => {    
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address)

            // new instances
            const { provider, params: { scheme, authTokenManager} } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject
            const result = await provider.verifyAuthentication({ database, accessMode, auth })

            // Assert results
            expect(result).toBe(true)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi,
                auth: auth ?? await authTokenManager.getToken()
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it('should throw when release throws', async () => {
            const error = new Error('something in the way it crashes')
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address, { 
                mockReleaseImplementation: async () => {
                    throw error
                }
            })

            // new instances
            const { provider, params: { scheme, authTokenManager} } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject and assertion
            await expect(provider.verifyAuthentication({ database, accessMode, auth })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi,
                auth: auth ?? await authTokenManager.getToken()
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it.each([
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.CredentialsExpired')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.Forbidden')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.TokenExpired')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.Unauthorized')]
        ])('should return false on invalid auth errors (%o)', async (error) => {
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address, { 
                mockRunImplementation: () => {
                    const observer = new ResultStreamObserver({
                        server: address,
                        highRecordWatermark: 100,
                        lowRecordWatermark: 1001
                    })
        
                    observer.onError(error)
        
                    return observer
                }
            })

            // new instances
            const { provider, params: { scheme, authTokenManager } } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject 
            const result = await provider.verifyAuthentication({ database, accessMode, auth })

            // Assert results
            expect(result).toBe(false)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi,
                auth: auth ?? authTokenManager.getToken()
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it.each([
            [new Error('something in the way it crashes')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.MadeUp')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Security.AuthenticationRateLimit')],
            [newError('Something in the way it neo4j error', 'Neo.ClientError.Some.Other')]
        ])('should fail if query run fail with non related errors (%o)', async (error) => {
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address, { 
                mockRunImplementation: () => {
                    const observer = new ResultStreamObserver({
                        server: address,
                        highRecordWatermark: 100,
                        lowRecordWatermark: 1001
                    })
        
                    observer.onError(error)
        
                    return observer
                }
            })

            // new instances
            const { provider, params: { scheme, authTokenManager } } = newProvider(address, { newHttpConnection })
            const expectedQueryApi = `${scheme}://${address.asHostPort()}/db/{databaseName}/query/v2`
            
            // mocking
            discoverSpy.mockResolvedValue({
                query: expectedQueryApi,
                version: '5.19.0',
                edition: 'enterprise'
            })

            // Subject and assertion
            await expect(provider.verifyAuthentication({ database, accessMode, auth })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(1)
            expect(newHttpConnection).toHaveBeenCalledWith(expect.objectContaining({
                queryEndpoint: expectedQueryApi,
                auth: auth ?? authTokenManager.getToken()
            }))
            expect(spyOnRunners[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRunners[0]).toHaveBeenCalledWith('CALL db.ping()', {}, expect.objectContaining({
                database,
                mode: accessMode
            }))
            expect(spyOnRelease[0]).toHaveBeenCalledTimes(1)
            expect(spyOnRelease[0].mock.invocationCallOrder[0]).toBeGreaterThan(spyOnRunners[0].mock.invocationCallOrder[0])
        })

        it('should fail if discovery fails', async () => {
            const error = new Error('something in the way it crashes')
            // Setting up state holders
            const { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease } = setupSpies(address)

            // new instances
            const { provider, params: { scheme} } = newProvider(address, { newHttpConnection })
            
            // mocking
            discoverSpy.mockRejectedValue(error)

            // Subject and assertion
            await expect(provider.verifyAuthentication({ database, accessMode, auth })).rejects.toBe(error)

            // introspecting
            expect(newHttpConnection).toHaveBeenCalledTimes(0)
            expect(spyOnRunners.length).toBe(0)
            expect(spyOnRelease.length).toBe(0)
        })
    })
})

function setupSpies(address: internal.serverAddress.ServerAddress, spies?: {
    mockRunImplementation?: (() => ResultStreamObserver),
    mockReleaseImplementation?: () => Promise<void>
}) {
    const connections: HttpConnection[] = []
    const spyOnRunners: JestSpiesRun[] = []
    const spyOnRelease: JestSpiesOnRelease[] = []

    // mocks and spies
    const newHttpConnection: NewHttpConnection = jest.fn((...params) => {
        const connection = new HttpConnection(...params)
        const run = jest.spyOn(connection, 'run')

        const mockRunImplementation = spies?.mockRunImplementation ?? (() => {
            const observer = new ResultStreamObserver({
                server: address,
                highRecordWatermark: 100,
                lowRecordWatermark: 1001
            })

            observer.onKeys(['1'])
            observer.onNext([1])

            observer.onCompleted({})

            return observer
        })

        run.mockImplementation(mockRunImplementation)

        const release = jest.spyOn(connection, 'release')

        if (typeof spies?.mockReleaseImplementation === 'function') {
            release.mockImplementation(spies.mockReleaseImplementation)
        }

        spyOnRunners.push(run)
        spyOnRelease.push(release)
        connections.push(connection)


        return connection
    })
    const discoverSpy = jest.spyOn(HttpConnection, 'discover')
    return { newHttpConnection, discoverSpy, spyOnRunners, spyOnRelease }
}

function newProvider(address: internal.serverAddress.ServerAddress, injectable?: Partial<HttpConnectionProviderInjectable>) {
    const params = {
        address,
        authTokenManager: staticAuthTokenManager({ authToken: auth.basic('neo4j', 'password ') }),
        config: { encrypted: false },
        id: 1,
        scheme: 'http' as HttpScheme,
        log: new internal.logger.Logger('debug', () => { })
    }
    
    return { provider :new HttpConnectionProvider(params, {
        newPool: (...params) => new Pool<HttpConnection>(...params),
        newHttpConnection: (...params) => new HttpConnection(...params),
        ...injectable
    }), params }
}
