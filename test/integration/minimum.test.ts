
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
import neo4j, { Date, DateTime, Duration, LocalDateTime, LocalTime, Neo4jError, Plan, Point, ProfiledPlan, Time, Wrapper, WrapperSession, WrapperSessionConfig, int } from '../../src'
import { when, withSession as _withSession } from './test.utils'

const NESTED_OBJECT = { 
  a: { 
    a: 1,
    b: 2,
    c: 3,
    d: 4
  }, 
  b: {
    a: true,
    b: false
  },
  c: {
    a: 1.1,
    b: 2.2,
    c: 3.3
  },
  d: {
    a: 'a',
    b: 'b',
    c: 'c',
    temp: '˚C'
  },
  e: {
    a: null
  },
  f: {
    a: int(1),
    b: true,
    c: 3.3,
    d: 'Hello, world!',
    e: null
  }
}

const LIST_OF_OBJECTS = [{
  a: 1,
  b: 2
}, {
  c: 3,
  d: 4
}]

const OBJECT_OF_LISTS = {
  a: [1],
  b: [1, 2]
}

when(config.version >= 5.23, () => describe('minimum requirement', () => {
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
      neo4j.auth.basic(config.username, config.password)
    )
  })

  afterEach(async () => {
    for await (const session of withSession({ database: config.database })) {
      await session.run('MATCH (n) DETACH DELETE n')
    }
    await wrapper?.close()
  })

  it.each([
    [config.database],
    ['system']
  ])('should verifyConnectivity ({ database: "%s"})', async (database) => {
    await expect(wrapper.verifyConnectivity({ database })).resolves.toBeDefined()
  })

  it.each([
    // bool
    ['bool', v(true)],
    ['bool', v(false)],
    // null
    ['null', v(null)],
    // integer
    ['Integer', v(int(1))],
    ['Integer', v(int(-7))],
    ['Integer', v(int(-129))],
    ['Integer', v(int(129))],
    ['Integer', v(int(2147483647))],
    ['Integer', v(int(-2147483648))],
    // bigint
    ['bigint', v(1n, int)],
    ['bigint', v(-7n, int)],
    ['bigint', v(-129n, int)],
    ['bigint', v(129n, int)],
    ['bigint', v(2147483647n, int)],
    ['bigint', v(-2147483648n, int)],
    // number
    ['number', v(0)],
    ['number', v(0.0)],
    ['number', v(Number.POSITIVE_INFINITY)],
    ['number', v(Number.NEGATIVE_INFINITY)],
    ['number', v(Number.NaN)],
    ['number', v(1)],
    ['number', v(-1)],
    ['number', v(2**1023)], // max exponent
    ['number', v(2**-1022)], // min exponent
    ['number', v(9007199254740991)], // max mantissa
    ['number', v(-9007199254740991)], // min mantissa
    ['number', v(-(2 + 1 + 2e-51))],
    // string
    ['string', v('')],
    ['string', v('1')],
    ['string', v('-17∂ßå®')],
    ['string', v('String')],
    // list
    ['list', v(["Hello", int(1134), "World"])],
    ['list', v(new Set(["Hello", int(1134), "World"]), s => [...s])],
    // object
    ['object', v({ a: 'Hello', b: 1234, c: 'World' })],
    
    // The following doesn't work, it returns as [['a', 'Hello'], ['b', 1234], ['c', 'World']]
    // The same behavior in the driver
    //['object', v(new Map<string, any>([['a', 'Hello'], ['b', 1234], ['c', 'World']]), m => Object.fromEntries(m.entries()) )]

    // bytes
    ['bytes', v(new Uint8Array([0x00, 0x33, 0x66, 0x99, 0xCC, 0xFF]))],
    
    // spatial types
    ['WGS Point 2D', v(new Point(int(4326), 1.2, 3.4))],
    ['CARTESIAN Point 2D', v(new Point(int(7203), 1.2, 3.4))],
    ['WGS Point 3D', v(new Point(int(4979), 1.2, 3.4, 5.6))],
    ['CARTESIAN Point 3D', v(new Point(int(9157), 1.2, 3.4, 5.6))],

    // Temporal Types
    ['Duration', v(new Duration(int(1), int(2), int(30), int(3000)))],
    ['LocalTime', v(new LocalTime(int(1), int(2), int(20), int(234)))],
    ['Time', v(new Time(int(1), int(20), int(23), int(234), int(7200)))],
    ['Date', v(new Date(int(1999), int(6), int(12)))],
    ['LocalDateTime', v(new LocalDateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234)))],
    ['DateTime Offset and Zone', v(new DateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234), int(7200), 'Europe/Berlin'))],
    ['DateTime Offset', v(new DateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234), int(7200)))],
    
    // Combinations
    ['nested objects', v(NESTED_OBJECT)],
    ['list of objects', v(LIST_OF_OBJECTS)],
    ['object of lists', v(OBJECT_OF_LISTS)]
  ])('should be able to echo "%s" (%s)', async (_, [input, expectedOutput]) => {
    for await (const session of withSession({ database: config.database })) {
      const { records: [first] } = await session.run('RETURN $input as output',  { input })
      expect(first.get('output')).toEqual(expectedOutput) 
    } 
  })

  it ('should not support DateTime without offset', async () => {
    for await (const session of withSession({ database: config.database })) {
      const dt = new DateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234), undefined, 'Europe/Berlin')

      await expect(session.run(`RETURN $dt`, { dt })).rejects.toEqual(new Error(
        'DateTime objects without "timeZoneOffsetSeconds" property ' +
                'are prone to bugs related to ambiguous times. For instance, ' +
                '2022-10-30T2:30:00[Europe/Berlin] could be GMT+1 or GMT+2.'
      ))
    }
  })

  it.each([
    ['CARTESIAN Point 2D', 'point({x: 2.3, y: 4.5})', new Point(int(7203), 2.3, 4.5)],
    ['CARTESIAN Point 3D', 'point({x: 2.3, y: 4.5, z:7.5})', new Point(int(9157), 2.3, 4.5, 7.5)],
    ['WGS Point 2D', 'point({longitude: 12.78, latitude: 56.7})', new Point(int(4326), 12.78, 56.7)],
    ['WGS Point 3D', 'point({longitude: 12.78, latitude: 56.7, height: 120.57})', new Point(int(4979), 12.78, 56.7, 120.57)],
    // Durations examples in Cypher manual
    ['Duration P14DT16H12M', 'duration({days: 14, hours:16, minutes: 12})', new Duration(int(0), int(14), int(58320), int(0))], 
    ['Duration P5M1DT12H', 'duration({months: 5, days: 1.5})', new Duration(int(5), int(1), int(43200), int(0))], 
    ['Duration P22DT19H51M49.5S', 'duration({months: 0.75})', new Duration(int(0), int(22), int(71509), int(500000000))], 
    ['Duration P17DT12H ', 'duration({weeks: 2.5})', new Duration(int(0), int(17), int(43200), int(0))],
    ['Duration PT1M31.123456789S', 'duration({minutes: 1.5, seconds: 1, milliseconds: 123, microseconds: 456, nanoseconds: 789})', new Duration(int(0), int(0), int(91), int(123456789))],
    ['Duration PT1M31.123456789S', 'duration({minutes: 1.5, seconds: 1, nanoseconds: 123456789})', new Duration(int(0), int(0), int(91), int(123456789))],
    // datetime
    ['Datetime "2020-01-01', 'datetime("2020-01-01")', new DateTime(int(2020), int(1), int(1), int(0), int(0), int(0), int(0), int(0))] 
  ])('should be able to echo "%s" (%s)', async (_, statement, expectedOutput) => {
    for await (const session of withSession({ database: config.database })) {
      const { records: [first] } = await session.run(`RETURN ${statement} as output`)
      expect(first.get('output')).toEqual(expectedOutput) 
    }
  })

  it('should be able to return ResultSummary.counters', async () => {
    for await (const session of withSession({ database: config.database })) {
      const { summary: { counters} } = await session.run(
        'CREATE (n: Person { name: "This person"})-[:WORKS_WITH]->(:Person { name: "Other person" }) ' +
        'RETURN n')

      expect(counters.containsUpdates()).toEqual(true)
      expect(counters.containsSystemUpdates()).toEqual(false)
      expect(counters.updates()).toEqual({
        nodesCreated: 2,
        nodesDeleted: 0,
        relationshipsCreated: 1,
        relationshipsDeleted: 0,
        propertiesSet: 2,
        labelsAdded: 2,
        labelsRemoved: 0,
        indexesAdded: 0,
        indexesRemoved: 0,
        constraintsAdded: 0,
        constraintsRemoved: 0
      })
      expect(counters.systemUpdates()).toEqual(0)
    }
  })

  it('should be able to return ResultSummary.plan', async () => {
    for await (const session of withSession({ database: config.database })) {
      const { summary} = await session.run('PROFILE RETURN 1')

      expect(summary.plan).not.toBe(false)
      
      const plan: Plan = summary.plan as Plan
      expect(plan.identifiers).toEqual(['`1`'])
      expect(plan.operatorType).toEqual('ProduceResults@neo4j')
      expect(plan.arguments).toMatchObject({
        "GlobalMemory": int(312),
        "planner-impl": "IDP",
        "Memory": int(0),
        "runtime": "PIPELINED",
        "runtime-impl": "PIPELINED",
        "DbHits": int(0),
        "batch-size": int(128),
        "Details": "`1`",
        "PipelineInfo": "Fused in Pipeline 0",
        "Id": int(0),
        "EstimatedRows": 1.0,
        "planner": "COST",
        "Rows": int(1)
      })

      expect(plan.children.length).toBe(1)
      
      const [child] = plan.children
      expect(child.identifiers).toEqual(['`1`'])
      expect(child.operatorType).toEqual('Projection@neo4j')
      expect(child.arguments).toEqual({
        "Details": "$autoint_0 AS `1`",
        "PipelineInfo": "Fused in Pipeline 0",
        "Time": int(0),
        "Id": int(1),
        "PageCacheMisses": int(0),
        "EstimatedRows": 1.0,
        "DbHits": int(0),
        "Rows": int(1),
        "PageCacheHits": int(0)
      })

      expect(child.children.length).toBe(0)
    }
  })

  it('should be able to return ResultSummary.profile',async () => {
    for await (const session of withSession({ database: config.database })) {
      const { summary} = await session.run('PROFILE RETURN 1')

      expect(summary.profile).not.toBe(false)
      
      const profile: ProfiledPlan = summary.profile as ProfiledPlan
      expect(profile.dbHits).toEqual(0)
      expect(profile.identifiers).toEqual(['`1`'])
      expect(profile.operatorType).toEqual('ProduceResults@neo4j')
      expect(profile.pageCacheHitRatio).toEqual(0.0)
      expect(profile.pageCacheHits).toEqual(0)
      expect(profile.pageCacheMisses).toEqual(0)
      expect(profile.rows).toEqual(1)
      expect(profile.time).toEqual(0)
      expect(profile.arguments).toMatchObject({
        "GlobalMemory": int(312),
        "planner-impl": "IDP",
        "Memory": int(0),
        "runtime": "PIPELINED",
        "runtime-impl": "PIPELINED",
        "DbHits": int(0),
        "batch-size": int(128),
        "Details": "`1`",
        "PipelineInfo": "Fused in Pipeline 0",
        "Id": int(0),
        "EstimatedRows": 1.0,
        "planner": "COST",
        "Rows": int(1)
      })

      expect(profile.children.length).toEqual(1)

      const [child] = profile.children
      expect(child.dbHits).toEqual(0)
      expect(child.identifiers).toEqual(['`1`'])
      expect(child.operatorType).toEqual('Projection@neo4j')
      expect(child.pageCacheHitRatio).toEqual(0.0)
      expect(child.pageCacheHits).toEqual(0)
      expect(child.pageCacheMisses).toEqual(0)
      expect(child.rows).toEqual(1)
      expect(child.time).toEqual(0)
      expect(child.arguments).toEqual({
        "Details": "$autoint_0 AS `1`",
        "PipelineInfo": "Fused in Pipeline 0",
        "Time": int(0),
        "Id": int(1),
        "PageCacheMisses": int(0),
        "EstimatedRows": 1.0,
        "DbHits": int(0),
        "Rows": int(1),
        "PageCacheHits": int(0)
      })

      expect(child.children.length).toEqual(0)
    }
  })

  it('should be able to receive bookmarks', async () => {
    for await (const session of withSession({ database: config.database })) {
      expect(session.lastBookmarks()).toEqual([])

      await session.run('RETURN 1')

      expect(session.lastBookmarks()).toHaveLength(1)
      expect(typeof session.lastBookmarks()[0]).toBe('string')
      const [previousBookmark] = session.lastBookmarks()

      await session.run('CREATE (n:Person { name: $name }) RETURN n', { name: 'My Mom'})

      expect(session.lastBookmarks()).toHaveLength(1)
      expect(typeof session.lastBookmarks()[0]).toBe('string')
      expect(session.lastBookmarks()[0]).not.toEqual(previousBookmark)
    }
  })

  it('should be able to return notifications', async () => {
    for await (const session of withSession({ database: config.database })) {
      const { summary} = await session.run('MATCH (a: NonExistentLabel) USING INDEX a:NonExistentLabel(id) WHERE a.id = 1 RETURN a')

      expect(summary.notifications.length).toBe(3)

      expect(summary.notifications[0].title).toEqual('The provided label is not in the database.')
      expect(summary.notifications[0].code).toEqual('Neo.ClientNotification.Statement.UnknownLabelWarning')
      expect(summary.notifications[0].description).toEqual('One of the labels in your query is not available in the database, '+
            'make sure you didn\'t misspell it or that the label is available when you run this statement in your application ' + 
            '(the missing label name is: NonExistentLabel)')
      expect(summary.notifications[0].severityLevel).toEqual('WARNING')
      expect(summary.notifications[0].rawCategory).toEqual('UNRECOGNIZED')
      expect(summary.notifications[0].position).toEqual({ line: 1, offset: 10, column: 11 })

      expect(summary.notifications[1].title).toEqual('The provided property key is not in the database')
      expect(summary.notifications[1].code).toEqual('Neo.ClientNotification.Statement.UnknownPropertyKeyWarning')
      expect(summary.notifications[1].description).toEqual('One of the property names in your query is not available in ' + 
            'the database, make sure you didn\'t misspell it or that the label is available when you run this statement in ' + 
            'your application (the missing property name is: id)')
      expect(summary.notifications[1].severityLevel).toEqual('WARNING')
      expect(summary.notifications[1].rawCategory).toEqual('UNRECOGNIZED')
      expect(summary.notifications[1].position).toEqual({ line: 1, offset: 71, column: 72 })

      expect(summary.notifications[2].title).toEqual('The request (directly or indirectly) referred to an index that does not exist.')
      expect(summary.notifications[2].code).toEqual('Neo.ClientNotification.Schema.HintedIndexNotFound')
      expect(summary.notifications[2].description).toEqual('The hinted index does not exist, please check the schema ' +
            '(index is: INDEX FOR (`a`:`NonExistentLabel`) ON (`a`.`id`))')
      expect(summary.notifications[2].severityLevel).toEqual('WARNING')
      expect(summary.notifications[2].rawCategory).toEqual('HINT')
      expect(summary.notifications[2].position).toEqual({ })
    }
  })

  it('should be able to set access mode', async () => {
    for await (const session of withSession({ database: config.database, defaultAccessMode: 'READ' })) {
      const error = await session.run('CREATE (:Person {name: $name })', { name: 'Gregory Irons'}).summary().catch(e => e)
      
      expect(error).toBeInstanceOf(Neo4jError)
      expect(error.code).toEqual('Neo.ClientError.Statement.AccessMode')
      expect(typeof error.message).toEqual('string')
      expect(error.message.trim()).not.toEqual('')
    }
  })

  it('should be able to set tx timeout', async () => {
    for await (const session of withSession({ database: config.database })) {
      await expect(session.run('CREATE (:Person {name: $name })', { name: 'Gregory Irons'}, { timeout: 123 }).summary()).resolves.not.toBeNull()
    }
  })

  it('should be able to handle password rotation', async () => {
    let password = config.password + 'wrong'
    wrapper = neo4j.wrapper(`http://${config.hostname}:${config.httpPort}`,
      neo4j.authTokenManagers.basic({ tokenProvider: async () => {
          try {
            return neo4j.auth.basic(config.username, password)
          } finally {
            password = config.password
          }
        }
      })
    )

    for await (const session of withSession({ database: config.database })) {
      const error = await session.run('CREATE (:Person {name: $name })', { name: 'Gregory Irons'}).summary().catch(e => e)
      
      expect(error).toBeInstanceOf(Neo4jError)
      expect(error.retriable).toEqual(true)
      expect(error.code).toEqual('Neo.ClientError.Security.Unauthorized')
      expect(typeof error.message).toEqual('string')
      expect(error.message.trim()).not.toEqual('')

      await session.run('CREATE (:Person {name: $name })', { name: 'Gregory Irons'}).summary()
    }
  })

  function withSession (sessionConfig: WrapperSessionConfig) {
    if (wrapper == null) {
      throw new TypeError('Something wrong with test setup: no wrapper defined.')
    }
    
    return _withSession(wrapper, sessionConfig)
  }

  function v<T, K = T>(value: T, mapper: (value: T)=> K = (v) => v as unknown as K): [T, K] {
    return [value, mapper(value)]
  }
}))
