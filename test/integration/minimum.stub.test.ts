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
import neo4j from "../../src"
import config from "./config"
import { withSession } from "./test.utils"

describe('minimum requirements stub', () => {
    const mocks: (string|undefined)[] = []
    const localMocks: (string|undefined)[] = []

    beforeAll(async () => {
        await config.startWireMock()
        mocks.push(await config.loadWireMockStub('discovery'))
    }, 120_000) // long timeout since it may need to download docker image

    afterAll(async () => {
        await Promise.all(mocks.map(config.deleteWireMockStub))
        mocks.length = 0
        await config.stopWireMock()
    }, 20000)

    afterEach(async () => {
        await Promise.all(localMocks.map(config.deleteWireMockStub))
        localMocks.length = 0
    })

    it('should accept bearer token', async () => {
        localMocks.push(
            await config.loadWireMockStub('session_run_bearer_token_return_1')
        )

        const wrapper = neo4j.wrapper(
            `http://${config.hostname}:${config.wireMockPort}`,
            neo4j.auth.bearer('nicestTokenEver')
        )

        for await (const session of withSession(wrapper, { database: 'neo4j' })) {
            await expect(session.run('RETURN 1')).resolves.toBeDefined()
        }
    })

    it('should support session auth', async () => {
        localMocks.push(
            await config.loadWireMockStub('session_run_bearer_token_return_1')
        )

        const wrapper = neo4j.wrapper(
            `http://${config.hostname}:${config.wireMockPort}`,
            // this auth doesn't work
            neo4j.auth.basic('neo4j', 'password')
        )

        for await (const session of withSession(wrapper, { database: 'neo4j', auth: neo4j.auth.bearer('nicestTokenEver') })) {
            await expect(session.run('RETURN 1')).resolves.toBeDefined()
        }
    })

    it('should support impersonation', async () => {
        localMocks.push(
            await config.loadWireMockStub('session_run_bearer_token_impersonated_return_1')
        )

        const wrapper = neo4j.wrapper(
            `http://${config.hostname}:${config.wireMockPort}`,
            neo4j.auth.bearer('nicestTokenEver')
        )

        for await (const session of withSession(wrapper, { database: 'neo4j', impersonatedUser: 'the_imposter' })) {
            await expect(session.run('RETURN 1')).resolves.toBeDefined()
        }
    })

})