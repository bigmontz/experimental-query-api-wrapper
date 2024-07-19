
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
import neo4j, { Date, DateTime, Duration, LocalDateTime, LocalTime, Plan, Point, ProfiledPlan, Time, Wrapper, WrapperSession, WrapperSessionConfig, int } from '../../src'

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

describe('minimum requirement', () => {
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

  it('should verifyConnectivity', async () => {
    await expect(wrapper.verifyConnectivity({ database: config.database })).resolves.toBeDefined()
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
    // the following types is getting bad request
    // need to double check format
    // ['WGS Point 2D', v(new Point(int(4326), 1.2, 3.4))],
    // ['CARTESIAN Point 2D', v(new Point(int(7203), 1.2, 3.4))],
    // ['WGS Point 3D', v(new Point(int(4979), 1.2, 3.4, 5.6))],
    // ['CARTESIAN Point 3D', v(new Point(int(9157), 1.2, 3.4, 5.6))],

    // Temporal Types
    ['Duration', v(new Duration(int(1), int(2), int(30), int(3000)))],
    ['LocalTime', v(new LocalTime(int(1), int(2), int(20), int(234)))],
    ['Time', v(new Time(int(1), int(20), int(23), int(234), int(7200)))],
    ['Date', v(new Date(int(1999), int(6), int(12)))],
    ['LocalDateTime', v(new LocalDateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234)))],
    ['DateTime', v(new DateTime(int(1999), int(6), int(12), int(1), int(2), int(20), int(234), int(7200), 'Europe/Berlin'))],
    
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

  it.each([
    ['CARTESIAN Point 2D', 'point({x: 2.3, y: 4.5})', new Point(int(7203), 2.3, 4.5)],
    ['CARTESIAN Point 3D', 'point({x: 2.3, y: 4.5, z:7.5})', new Point(int(9157), 2.3, 4.5, 7.5)],
    ['WGS Point 2D', 'point({longitude: 12.78, latitude: 56.7})', new Point(int(4326), 12.78, 56.7)],
    ['WGS Point 3D', 'point({longitude: 12.78, latitude: 56.7, height: 120.57})', new Point(int(4979), 12.78, 56.7, 120.57)]
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
      expect(plan.arguments).toEqual({
        "GlobalMemory": int(312),
        "planner-impl": "IDP",
        "Memory": int(0),
        "string-representation": "Planner COST\n\nRuntime PIPELINED\n\nRuntime version 5.21\n\nBatch size 128\n\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n| Operator        | Id | Details           | Estimated Rows | Rows | DB Hits | Memory (Bytes) | Page Cache Hits/Misses | Time (ms) | Pipeline            |\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n| +ProduceResults |  0 | `1`               |              1 |    1 |       0 |              0 |                        |           |                     |\n| |               +----+-------------------+----------------+------+---------+----------------+                        |           |                     |\n| +Projection     |  1 | $autoint_0 AS `1` |              1 |    1 |       0 |                |                    0/0 |     0.000 | Fused in Pipeline 0 |\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n\nTotal database accesses: 0, total allocated memory: 312\n",
        "runtime": "PIPELINED",
        "runtime-impl": "PIPELINED",
        "DbHits": int(0),
        "batch-size": int(128),
        "Details": "`1`",
        "planner-version": "5.21",
        "PipelineInfo": "Fused in Pipeline 0",
        "runtime-version": "5.21",
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
      expect(profile.arguments).toEqual({
        "GlobalMemory": int(312),
        "planner-impl": "IDP",
        "Memory": int(0),
        "string-representation": "Planner COST\n\nRuntime PIPELINED\n\nRuntime version 5.21\n\nBatch size 128\n\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n| Operator        | Id | Details           | Estimated Rows | Rows | DB Hits | Memory (Bytes) | Page Cache Hits/Misses | Time (ms) | Pipeline            |\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n| +ProduceResults |  0 | `1`               |              1 |    1 |       0 |              0 |                        |           |                     |\n| |               +----+-------------------+----------------+------+---------+----------------+                        |           |                     |\n| +Projection     |  1 | $autoint_0 AS `1` |              1 |    1 |       0 |                |                    0/0 |     0.000 | Fused in Pipeline 0 |\n+-----------------+----+-------------------+----------------+------+---------+----------------+------------------------+-----------+---------------------+\n\nTotal database accesses: 0, total allocated memory: 312\n",
        "runtime": "PIPELINED",
        "runtime-impl": "PIPELINED",
        "DbHits": int(0),
        "batch-size": int(128),
        "Details": "`1`",
        "planner-version": "5.21",
        "PipelineInfo": "Fused in Pipeline 0",
        "runtime-version": "5.21",
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

  /**
   * Emulates a try-with-resource by using iterators
   * 
   * @example
   * for await (const session of withSession({ database: 'neo4j })) {
   *    // work with my session
   * }
   * // session is closed
   * 
   * @param config The session config
   */
  async function* withSession (config: WrapperSessionConfig): AsyncGenerator<WrapperSession> {
    const session = wrapper.session(config)
    try {
      yield session
    } finally {
      await session.close()
    }
  }

  function v<T, K = T>(value: T, mapper: (value: T)=> K = (v) => v as unknown as K): [T, K] {
    return [value, mapper(value)]
  }
})
