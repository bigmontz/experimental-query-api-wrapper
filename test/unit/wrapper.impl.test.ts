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
import { newError, ConnectionProvider, Driver, internal, auth } from 'neo4j-driver-core'
import { Logger, Wrapper } from '../../src'
import { WrapperImpl } from '../../src/wrapper.impl'


describe('Wrapper', () => {
    let connectionProvider: ConnectionProvider
    let wrapper: Wrapper | null
    let driver: Driver | null
    const META_INFO = {
        routing: false,
        typename: '',
        address: 'localhost'
    }
    const CONFIG = {}

    beforeEach(() => {
        connectionProvider = new ConnectionProvider()
        connectionProvider.close = jest.fn(() => Promise.resolve())


        driver = new Driver(
            META_INFO,
            CONFIG,
            mockCreateConnectionProvider(connectionProvider),
        )

        wrapper = new WrapperImpl(driver)
    })

    afterEach(async () => {
        if (wrapper != null) {
            await wrapper.close()
            wrapper = null
        }
    })

    it.each([
        ['Promise.resolve(true)', Promise.resolve(true)],
        ['Promise.resolve(false)', Promise.resolve(false)],
        [
            "Promise.reject(newError('something went wrong'))",
            Promise.reject(newError('something went wrong'))
        ]
    ])('.supportsMultiDb() => %s', (_, expectedPromise) => {
        connectionProvider.supportsMultiDb = jest.fn(() => expectedPromise)

        const promise: Promise<boolean> | undefined = wrapper?.supportsMultiDb()

        expect(promise).toBe(expectedPromise)

        promise?.catch(_ => 'Do nothing').finally(() => { })
    })

    it.each([
        ['Promise.resolve(true)', Promise.resolve(true)],
        ['Promise.resolve(false)', Promise.resolve(false)],
        [
            "Promise.reject(newError('something went wrong'))",
            Promise.reject(newError('something went wrong'))
        ]
    ])('.supportsSessionAuth() => %s', (_, expectedPromise) => {
        connectionProvider.supportsSessionAuth = jest.fn(() => expectedPromise)

        const promise: Promise<boolean> | undefined = wrapper?.supportsSessionAuth()

        expect(promise).toBe(expectedPromise)

        promise?.catch(_ => 'Do nothing').finally(() => { })
    })

    it.each([
        ['Promise.resolve(true)', Promise.resolve(true)],
        ['Promise.resolve(false)', Promise.resolve(false)],
        [
            "Promise.reject(newError('something went wrong'))",
            Promise.reject(newError('something went wrong'))
        ]
    ])('.supportsUserImpersonation() => %s', (_, expectedPromise) => {
        connectionProvider.supportsUserImpersonation = jest.fn(() => expectedPromise)

        const promise: Promise<boolean> | undefined = wrapper?.supportsUserImpersonation()

        expect(promise).toBe(expectedPromise)

        promise?.catch(_ => 'Do nothing').finally(() => { })
    })

    it.each([
        ['Promise.resolve(object)', Promise.resolve({ })],
        [
            "Promise.reject(newError('something went wrong on verify conn'))",
            Promise.reject(newError('something went wrong on verify conn'))
        ]
    ])('.verifyConnectivity() => %s', (_, expectedPromise) => {
        connectionProvider.verifyConnectivityAndGetServerInfo = jest.fn(() => expectedPromise)
        const config = { database: 'db' }

        const promise: Promise<any> | undefined = wrapper?.verifyConnectivity(config)

        expect(promise).toBe(expectedPromise)
        expect(connectionProvider.verifyConnectivityAndGetServerInfo).toHaveBeenCalledWith({ ...config, accessMode: 'READ' })
        promise?.catch(_ => 'Do nothing').finally(() => { })
    })

    it.each([
        ['with auth, Promise.resolve(true)', Promise.resolve(true), auth.basic('new_user', 'word_pass')],
        ['with auth, Promise.resolve(false)', Promise.resolve(false), auth.basic('new_user', 'word_pass')],
        [
            "with auth, Promise.reject(newError('something went wrong on verify authentication'))",
            Promise.reject(newError('something went wrong on verify authentication')),
            auth.basic('new_user', 'word_pass')
        ],
        ['without auth, Promise.resolve(true)', Promise.resolve(true), undefined],
        ['without auth, Promise.resolve(false)', Promise.resolve(false), undefined],
        [
            "without auth, Promise.reject(newError('something went wrong on verify authentication'))",
            Promise.reject(newError('something went wrong on verify authentication')),
            undefined
        ]
    ])('.verifyAuthentication() => %s', (_, expectedPromise, authToken?) => {
        connectionProvider.verifyAuthentication = jest.fn(() => expectedPromise)
        const config = authToken != null ? { database: 'db', auth: authToken  } : { database: 'db' }

        const promise: Promise<boolean> | undefined = wrapper?.verifyAuthentication(config)

        expect(promise).toEqual(expectedPromise)
        expect(connectionProvider.verifyAuthentication).toHaveBeenCalledWith({...config, accessMode: 'READ'})

        promise?.catch(_ => 'Do nothing').finally(() => { })
        expectedPromise.catch(_ => 'Do nothing').finally(() => {})
    })

    describe('.session()',  () => {
        it.each([
            ['auth.basic', auth.basic('neo5j', 'imposter')],
            ['auth.bearer', auth.bearer('myjwt')]
        ])('should support auth (%s)', async (_, token) => {
            const sessionFactorySpy = jest.spyOn(driver!, 'session')

            const session = wrapper?.session({ auth: token, database: 'neo4j'})

            try  {
                expect(sessionFactorySpy).toHaveBeenCalledWith(expect.objectContaining({ auth: token }))
            } finally {
                await session?.close()
            }
        })

        it.each([
            [undefined],
            ['imposter']
        ])('should support impersonation (%s)', async (impersonatedUser) => {
            const sessionFactorySpy = jest.spyOn(driver!, 'session')

            const session = wrapper?.session({ impersonatedUser, database: 'neo4j'})

            try  {
                expect(sessionFactorySpy).toHaveBeenCalledWith(expect.objectContaining({ impersonatedUser }))
            } finally {
                await session?.close()
            }
        })
    })

    function mockCreateConnectionProvider(connectionProvider: ConnectionProvider) {
        return (
            id: number,
            config: Object,
            log: Logger,
            hostNameResolver: internal.resolver.ConfiguredCustomResolver
        ) => connectionProvider
    }
})