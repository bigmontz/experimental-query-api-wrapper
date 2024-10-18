
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
import config from './config'
import { when, withSession } from './test.utils'
import neo4j, { Wrapper } from '../../src'

when(config.version >= 5.26, () => describe('transactions', () => {
  let wrapper: Wrapper

  beforeAll(async () => {
    await config.startNeo4j()
  }, 120_000) // long timeout since it may need to download docker image

  afterAll(async () => {
    await config.stopNeo4j()
  }, 20000)

  beforeEach(() => {
    wrapper = neo4j.wrapper(
      `http://${config.hostname}:${config.httpPort}`,
      neo4j.auth.basic(config.username, config.password),
      { 
        logging: neo4j.logging.console('debug')
      }
    )
  })

  afterEach(async () => {
    for await (const session of withSession(wrapper, { database: config.database })) {
      await session.run('MATCH (n) DETACH DELETE n')
    }
    await wrapper?.close()
  })

  describe('unmanaged', () => {
    it.each([
      [0],
      [1],
      [2],
      [5]
    ])('should be able to run %s queries and commit a read tx', async (queries) => {
      for await (const session of withSession(wrapper, { database: config.database, defaultAccessMode: 'READ' })) {
        const tx = await session.beginTransaction()
        try  {
          for (let i = 0; i < queries; i++) {
            //  TODO FIXME, SEND ME AS A PARAM
            await expect(tx.run(`RETURN ${i} AS a`)).resolves.toBeDefined()
          }

          await expect(tx.commit()).resolves.toBe(undefined)
        } finally {
          await tx.close()
        }
      }
    })

    it.each([
      [0],
      [1],
      [2],
      [5]
    ])('should be able to run %s queries and commit a write tx', async (queries) => {
      for await (const session of withSession(wrapper, { database: config.database, defaultAccessMode: 'WRITE' })) {
        const tx = await session.beginTransaction()
        try  {
          for (let i = 0; i < queries; i++) {
            //  TODO FIXME, SEND ME AS A PARAM
            await expect(tx.run(`CREATE (n:Person{a:${i}}) RETURN n.a AS a`)).resolves.toBeDefined()
          }

          await expect(tx.commit()).resolves.toBe(undefined)
        } finally {
          await tx.close()
        }
      }
    })
  })

  describe('managed', () => {
    it.each([
      [0],
      [1],
      [2],
      [5]
    ])('should be able to run %s queries using executeRead', async (queries) => {
      for await (const session of withSession(wrapper, { database: config.database })) {
        await expect(session.executeRead(async tx => {
          for (let i = 0; i < queries; i++) {
            //  TODO FIXME, SEND ME AS A PARAM
            await expect(tx.run(`RETURN ${i} AS a`)).resolves.toBeDefined()
          }
        })).resolves.toBe(undefined)
      }
    })

    it.each([
      [0],
      [1],
      [2],
      [5]
    ])('should be able to run %s queries using executeWrite', async (queries) => {
      for await (const session of withSession(wrapper, { database: config.database, })) {
        await expect(session.executeWrite(async tx => {
          for (let i = 0; i < queries; i++) {
            //  TODO FIXME, SEND ME AS A PARAM
            await expect(tx.run(`CREATE (n:Person{a:${i}}) RETURN n.a AS a`)).resolves.toBeDefined()
          }
        })).resolves.toBe(undefined)
      }
    })

    it('should be able to run a read query using executeQuery', async () => {
      const i = 34
      await expect(wrapper.executeQuery(`RETURN ${i} AS a`, undefined, {
        database: config.database,
        routing: 'READ'
      })).resolves.toBeDefined()
    })

    it('should be able to run a write query using executeQuery', async () => {
      const i = 34
      await expect(wrapper.executeQuery(`CREATE (n:Person{a:${i}}) RETURN n.a AS a`, undefined, {
        database: config.database,
        routing: 'WRITE'
      })).resolves.toBeDefined()
    })
  })
}))