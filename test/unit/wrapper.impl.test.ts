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
import { newError, ConnectionProvider, Driver, internal } from 'neo4j-driver-core'
import { Logger, Wrapper } from '../../src'
import { WrapperImpl } from '../../src/wrapper.impl'


describe('Wrapper', () => {
    let connectionProvider: ConnectionProvider
    let wrapper: Wrapper | null
    const META_INFO = {
        routing: false,
        typename: '',
        address: 'localhost'
    }
    const CONFIG = {}

    beforeEach(() => {
        connectionProvider = new ConnectionProvider()
        connectionProvider.close = jest.fn(() => Promise.resolve())


        const driver = new Driver(
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

    function mockCreateConnectionProvider(connectionProvider: ConnectionProvider) {
        return (
            id: number,
            config: Object,
            log: Logger,
            hostNameResolver: internal.resolver.ConfiguredCustomResolver
        ) => connectionProvider
    }
})