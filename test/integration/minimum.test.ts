
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
import neo4j, { Date, DateTime, Duration, LocalDateTime, LocalTime, Point, Time, Wrapper, int } from '../../src'

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
    const session = wrapper.session({ database: config.database })
    try {
      const { records: [first] } = await session.run('RETURN $input as output',  { input })
      expect(first.get('output')).toEqual(expectedOutput) 
    } finally {
      await session.close()
    }
  })

  function v<T, K = T>(value: T, mapper: (value: T)=> K = (v) => v as unknown as K): [T, K] {
    return [value, mapper(value)]
  }
})
