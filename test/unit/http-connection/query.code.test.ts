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

import neo4j, { auth, types, internal, int, Date, Time, LocalTime, DateTime, LocalDateTime, Point, Duration, Node, Relationship, UnboundRelationship, Path, PathSegment } from "neo4j-driver-core";
import { QueryRequestCodec, QueryRequestCodecConfig, QueryResponseCodec, RawQueryResponse, RawQueryValue } from "../../../src/http-connection/query.codec";

describe('QueryRequestCodec', () => {
    const DEFAULT_AUTH = auth.basic('neo4j', 'password')
    const DEFAULT_QUERY = 'RETURN 1'

    describe('.contentType', () => {
        it('should return "application/vnd.neo4j.query"', () => {
            const codec = subject()

            expect(codec.contentType).toBe('application/vnd.neo4j.query')
        })
    })

    describe('.accept', () => {
        it('should return "application/vnd.neo4j.query, application/json"', () => {
            const codec = subject()

            expect(codec.accept).toBe('application/vnd.neo4j.query, application/json')
        })
    })

    describe('.authorization', () => {
        it.each([
            ['Basic', auth.basic('myuser', 'mypassword'), 'Basic bXl1c2VyOm15cGFzc3dvcmQ='],
            ['Bearer', auth.bearer('mytoken'), 'Bearer bXl0b2tlbg=='],
            ['Custom Basic', auth.custom('myuser', 'mypassword', '', 'basic'), 'Basic bXl1c2VyOm15cGFzc3dvcmQ='],
            ['Custom Bearer', auth.custom('', 'mytoken', '', 'bearer'), 'Bearer bXl0b2tlbg=='],
        ])('should handle %s', (_, auth, expected) => {
            const codec = subject({ auth })

            expect(codec.authorization).toEqual(expected)
        })

        it.each([
            ['Kerberos', auth.kerberos('ticket')],
            ['None', auth.none()],
            ['MyCustom', auth.custom('principal', 'credentials', 'realm', 'mycustom')],
        ])('should fail on %s', (_, auth) => {
            const codec = subject({ auth })

            expect(() => codec.authorization).toThrow(`Authorization scheme "${auth.scheme}" is not supported.`)
        })
    })

    describe('.body', () => {
        const DEFAULT_BODY = {
            statement: DEFAULT_QUERY,
            includeCounters: true
        }

        it('should handle plain query', () => {
            const codec = subject({ query: 'RETURN "A" AS b' })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                statement: 'RETURN "A" AS b'
            })
        })

        it.each([
            ['single bookmark as string', v('abc', ['abc'])],
            ['empty', v([], () => undefined)],
            ['single in a array', v(['abc'])],
            ['multiples', v(['abc', 'cbd'])],
        ])('should handle bookmark %s', (_, [bookmarks, expectedBookmarks]) => {
            const codec = subject({
                config: {
                    bookmarks: new internal.bookmarks.Bookmarks(bookmarks),
                    txConfig: internal.txConfig.TxConfig.empty()
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                bookmarks: expectedBookmarks
            })
        })

        it('should handle tx timeout', () => {
            const codec = subject({
                config: {
                    txConfig: new internal.txConfig.TxConfig({
                        timeout: int(1234)
                    }),
                    bookmarks: internal.bookmarks.Bookmarks.empty()
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                maxExecutionTime: 1234
            })
        })

        it('should handle impersonatedUser', () => {
            const codec = subject({
                config: {
                    impersonatedUser: 'max',
                    txConfig: internal.txConfig.TxConfig.empty(),
                    bookmarks: internal.bookmarks.Bookmarks.empty()
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                impersonatedUser: 'max'
            })
        })

        it.each([
            ['READ'],
            ['WRITE']
        ])('should handle config mode %s', (mode: any) => {
            const codec = subject({
                config: {
                    mode,
                    txConfig: internal.txConfig.TxConfig.empty(),
                    bookmarks: internal.bookmarks.Bookmarks.empty()
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                accessMode: mode
            })
        })

        it.each([
            ['Null', v(null, { $type: 'Null', _value: null })],
            ['Boolean', v(true, { $type: 'Boolean', _value: true })],
            ['Integer', v(int(123), { $type: 'Integer', _value: '123' })],
            ['BigInt', v(-1234n, { $type: 'Integer', _value: '-1234' })],
            ['Float', v(-1234, { $type: 'Float', _value: '-1234' })],
            ['String', v('Hello, Greg!', { $type: 'String', _value: 'Hello, Greg!' })],
            ['ByteArray', v(new Uint8Array([0x60, 0x60, 0xB0, 0x17]), { $type: 'Base64', _value: 'YGCwFw==' })],
            ['List', v(['A', 12n], { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] })],
            ['Iterable', v(new Set(['A', 12n]), { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] })],
            ['Map', v({ a: 'b', c: ['d'] }, { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } })],
            ['Date', v(new Date(1988, 8, 23), { $type: 'Date', _value: '1988-08-23' })],
            ['Time', v(new Time(12, 50, 35, 556000000, 3600), { $type: 'Time', _value: '12:50:35.556000000+01:00' })],
            ['LocalTime', v(new LocalTime(12, 50, 35, 556000000), { $type: 'LocalTime', _value: '12:50:35.556000000' })],
            ['OffsetDateTime', v(new DateTime(1988, 8, 23, 12, 50, 35, 556000000, -3600), { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' })],
            ['ZonedAndOffsetDateTime', v(new DateTime(1988, 8, 23, 12, 50, 35, 556000000, 3600, 'Antarctica/Troll'), { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' })],
            ['LocalDateTime', v(new LocalDateTime(2001, 5, 3, 13, 45, 0, 3404004), { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' })],
            ['Duration', v(new Duration(0, 14, 16, 0), { $type: 'Duration', _value: 'P0M14DT16S' })],
            ['WGS Point 2D', v(new Point(int(4326), 1.2, 3.4), { '$type': 'Point', _value: 'SRID=4326;POINT (1.2 3.4)' })],
            ['CARTESIAN Point 2D', v(new Point(int(7203), 1.2, 3.4), { '$type': 'Point', _value: 'SRID=7203;POINT (1.2 3.4)' })],
            ['WGS Point 3D', v(new Point(int(4979), 1.2, 3.4, 5.6), { '$type': 'Point', _value: 'SRID=4979;POINT Z (1.2 3.4 5.6)' })],
            ['CARTESIAN Point 3D', v(new Point(int(9157), 1.2, 3.4, 5.6), { '$type': 'Point', _value: 'SRID=9157;POINT Z (1.2 3.4 5.6)' })],
        ])('should handle parameters of type %s', (_, [param, expected]) => {
            const codec = subject({
                parameters: {
                    param
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY,
                parameters: {
                    param: expected
                }
            })
        })

        it('should support DateTime without offset', () => {
            const param = new DateTime(2024, 3, 31, 2, 30, 0, 0, undefined, 'Europe/Stockholm')
            const codec = subject({
                parameters: {
                    param
                }
            })

            expect(() => codec.body).toThrow('DateTime objects without "timeZoneOffsetSeconds" property ' +
                'are prone to bugs related to ambiguous times. For instance, ' +
                '2022-10-30T2:30:00[Europe/Berlin] could be GMT+1 or GMT+2.')
        })

        it.each([
            ['Node', new Node(234, [], {})],
            ['Relationship', new Relationship(2, 1, 4, '1', {})],
            ['UnboundRelationship', new UnboundRelationship(1, 'a', {})],
            ['Path', new Path(new Node(1, [], {}), new Node(1, [], {}), [])],
            ['PathSegment', new PathSegment(new Node(1, [], {}), new Relationship(2, 1, 4, '1', {}), new Node(1, [], {}))],
        ])('should not handle graph types as parameters (%s)', (_, param) => {
            const codec = subject({
                parameters: {
                    param
                }
            })

            expect(() => codec.body).toThrow('Graph types can not be ingested to the server')
        })

    })



    function subject(params?: Partial<{
        auth: types.AuthToken,
        query: string,
        parameters: Record<string, unknown>,
        config: QueryRequestCodecConfig
    }>) {
        return QueryRequestCodec.of(
            params?.auth ?? DEFAULT_AUTH,
            params?.query ?? DEFAULT_QUERY,
            params?.parameters,
            params?.config
        )
    }

    function v<T, K = T>(value: T, expected?: K | (() => K)): [T, K] {
        if (expected === undefined) {
            expected = value as unknown as K
        } else if (typeof expected === 'function') {
            expected = (expected as unknown as Function)() as K
        }
        return [value, expected]
    }
})

describe('QueryResponseCodec', () => {
    const DEFAULT_CONFIG = {}
    const DEFAULT_CONTENT_TYPE = 'application/vnd.neo4j.query'
    const DEFAULT_RAW_RESPONSE: RawQueryResponse = {
        "data": {
            "fields": [
                "1"
            ],
            "values": [
                [
                    {
                        "$type": "Integer",
                        "_value": "1"
                    }
                ]
            ]
        },
        "counters": {
            "containsUpdates": false,
            "nodesCreated": 0,
            "nodesDeleted": 0,
            "propertiesSet": 0,
            "relationshipsCreated": 0,
            "relationshipsDeleted": 0,
            "labelsAdded": 0,
            "labelsRemoved": 0,
            "indexesAdded": 0,
            "indexesRemoved": 0,
            "constraintsAdded": 0,
            "constraintsRemoved": 0,
            "containsSystemUpdates": false,
            "systemUpdates": 0
        },
        "bookmarks": [
            "FB:kcwQUln6E/U2SUyIXRY1rTIt8wKQ"
        ]
    }

    describe('.error', () => {
        it('should handle success', () => {
            const codec = subject()

            expect(codec.error).toBe(undefined)
        })

        it('should handle failures', () => {
            const codec = subject({
                rawQueryResponse: {
                    errors: [{
                        message: 'Something wrong is mighty right',
                        code: 'Neo.ClientError.Made.Up'
                    }]
                }
            })

            expect(codec.error).toBeDefined()
            expect(codec.error?.message).toEqual('Something wrong is mighty right')
            // @ts-expect-error
            expect(codec.error?.code).toEqual('Neo.ClientError.Made.Up')

        })

        it('should handle empty error list', () => {
            const codec = subject({
                rawQueryResponse: {
                    errors: []
                }
            })

            expect(codec.error).toBeDefined()
            expect(codec.error?.message).toEqual('Server replied an empty error response')
            // @ts-expect-error
            expect(codec.error?.code).toEqual('ProtocolError')
        })

        it('should consider wrong content type as ProtocolError', () => {
            const codec = subject({
                contentType: 'application/json'
            })

            expect(codec.error).toBeDefined()
            expect(codec.error?.message).toEqual('Wrong content-type. Expected "application/vnd.neo4j.query", but got "application/json".')
            // @ts-expect-error
            expect(codec.error?.code).toEqual('ProtocolError')
        })
    })

    describe('.keys', () => {
        it.each([
            [[]],
            [['key']],
            [['key', 'key2']],
        ])('should handle keys = %s', (keys: string[]) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    data: {
                        ...DEFAULT_RAW_RESPONSE.data,
                        fields: keys
                    }
                }
            })

            expect(codec.keys).toBe(keys)
        })

        it.each(
            errorConditionsFixture()
        )('should handle %s failures', (_: string, param: SubjectParams) => {
            const codec = subject(param)

            expect(() => codec.keys).toThrow(codec.error)
        })
    })

    describe('.meta', () => {
        it.each([
            [undefined],
            [[]],
            [['FB:kcwQUln6E/U2SUyIXRY1rTIt8wKQ']],
            [['FB:kcwQUln6E/U2SUyIXRY1rTIt8wKQ', 'FB:kcwQUln6E/U2SUyIXRY1rTIt9w1Q']]
        ])('should handle bookmarks = %s', (bookmarks) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    bookmarks: bookmarks as []
                }
            })

            expect(codec.meta.bookmark).toEqual(bookmarks)
        })

        it.each([
            // using custom integer
            ...useCustomIntegerConfigFixture().flatMap(config => [
                [{}, {}, config],
                [{ containsUpdates: true }, { containsUpdates: true }, config],
                [{
                    containsUpdates: true,
                    nodesCreated: 12,
                    nodesDeleted: 45,
                    propertiesSet: -1,
                    relationshipsCreated: 234,
                    relationshipsDeleted: 2,
                    labelsAdded: 5,
                    labelsRemoved: 2,
                    indexesAdded: 312334,
                    indexesRemoved: 1,
                    constraintsAdded: 2198392,
                    constraintsRemoved: 3232,
                    containsSystemUpdates: false,
                    systemUpdates: 13232
                }, {
                    containsUpdates: true,
                    nodesCreated: int(12),
                    nodesDeleted: int(45),
                    propertiesSet: int(-1),
                    relationshipsCreated: int(234),
                    relationshipsDeleted: int(2),
                    labelsAdded: int(5),
                    labelsRemoved: int(2),
                    indexesAdded: int(312334),
                    indexesRemoved: int(1),
                    constraintsAdded: int(2198392),
                    constraintsRemoved: int(3232),
                    containsSystemUpdates: false,
                    systemUpdates: int(13232)
                }, config],
                [{
                    madeUpStuff: 123,
                    nodesDeleted: "234"
                },
                {
                    madeUpStuff: int(123),
                    nodesDeleted: "234"
                }, config]
            ]),

            // disabling lossless integers
            ...useLossyIntegerConfigFixture().flatMap(config => [
                [{}, {}, { disableLosslessIntegers: true }],
                [{ containsUpdates: true }, { containsUpdates: true }, config],
                [{
                    containsUpdates: true,
                    nodesCreated: 12,
                    nodesDeleted: 45,
                    propertiesSet: -1,
                    relationshipsCreated: 234,
                    relationshipsDeleted: 2,
                    labelsAdded: 5,
                    labelsRemoved: 2,
                    indexesAdded: 312334,
                    indexesRemoved: 1,
                    constraintsAdded: 2198392,
                    constraintsRemoved: 3232,
                    containsSystemUpdates: false,
                    systemUpdates: 13232
                }, {
                    containsUpdates: true,
                    nodesCreated: 12,
                    nodesDeleted: 45,
                    propertiesSet: -1,
                    relationshipsCreated: 234,
                    relationshipsDeleted: 2,
                    labelsAdded: 5,
                    labelsRemoved: 2,
                    indexesAdded: 312334,
                    indexesRemoved: 1,
                    constraintsAdded: 2198392,
                    constraintsRemoved: 3232,
                    containsSystemUpdates: false,
                    systemUpdates: 13232
                }, config],
                [{
                    madeUpStuff: 123,
                    nodesDeleted: "234"
                },
                {
                    madeUpStuff: 123,
                    nodesDeleted: "234"
                }, config]
            ]),

            // use bigint
            ...useBigIntConfigFixture()
                .flatMap(config => [[{}, {}, config],
                [{ containsUpdates: true }, { containsUpdates: true }, config],
                [{
                    containsUpdates: true,
                    nodesCreated: 12,
                    nodesDeleted: 45,
                    propertiesSet: -1,
                    relationshipsCreated: 234,
                    relationshipsDeleted: 2,
                    labelsAdded: 5,
                    labelsRemoved: 2,
                    indexesAdded: 312334,
                    indexesRemoved: 1,
                    constraintsAdded: 2198392,
                    constraintsRemoved: 3232,
                    containsSystemUpdates: false,
                    systemUpdates: 13232
                }, {
                    containsUpdates: true,
                    nodesCreated: 12n,
                    nodesDeleted: 45n,
                    propertiesSet: -1n,
                    relationshipsCreated: 234n,
                    relationshipsDeleted: 2n,
                    labelsAdded: 5n,
                    labelsRemoved: 2n,
                    indexesAdded: 312334n,
                    indexesRemoved: 1n,
                    constraintsAdded: 2198392n,
                    constraintsRemoved: 3232n,
                    containsSystemUpdates: false,
                    systemUpdates: 13232n
                }, config],
                [{
                    madeUpStuff: 123n,
                    nodesDeleted: "234"
                },
                {
                    madeUpStuff: 123n,
                    nodesDeleted: "234"
                }, config]])
            ,
        ])('should handle stats (%o)', (counters: any, expected: any, config?: Partial<types.InternalConfig>) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    counters
                },
                config
            })

            expect(codec.meta.stats).toEqual(expected)
        })

        it.each([
            ...[
                ...useCustomIntegerConfigFixture(),
                ...useBigIntConfigFixture(),
                ...useLossyIntegerConfigFixture()
            ].flatMap(config => [
                [undefined, null, config],
                [null, null, config],
                [{
                    dbHits: 123,
                    records: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b'],
                }, {
                    dbHits: 123,
                    rows: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b']
                }, config],
                ...useChildrenFixture().map(({ children, expectedChildren }) => [{
                    dbHits: 123,
                    records: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b'],
                    children: children
                }, {
                    dbHits: 123,
                    rows: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b'],
                    children: expectedChildren
                }, config])

            ])
        ])('should handle profile (%o)', (profiledQueryPlan: any, expected: any, config?: Partial<types.InternalConfig>) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    profiledQueryPlan
                },
                config
            })

            expect(codec.meta.profile).toEqual(expected)
        })

        it.each([
            ...[
                ...useCustomIntegerConfigFixture().map(config => ({ toInt: int, config })),
                ...useLossyIntegerConfigFixture().map(config => ({ toInt: (v: any) => int(v).toInt(), config })),
                ...useBigIntConfigFixture().map(config => ({ toInt: (v: any) => int(v).toBigInt(), config })),
            ].flatMap(({ toInt, config }) => [
                ...[null, undefined, 'a'].map(_value => [`Null (value=${_value})`, { $type: 'Null', _value }, null, config]),
                ...[false, true].map(_value => [`Boolean (value=${_value})`, { $type: 'Boolean', _value }, _value, config]),
                ...["123", "-123456", "1937465"].map(_value => [`Integer (value=${_value})`, { $type: 'Integer', _value }, toInt(_value), config]),
                ...["123", "-123456.56", "1937465.24"].map(_value => [`Float (value=${_value})`, { $type: 'Float', _value }, parseFloat(_value), config]),
                ...["123", "Max", "", "Novela"].map(_value => [`String (value=${_value})`, { $type: 'String', _value }, _value, config]),
                ...[
                    ['12:14:59.00102-3:00', new Time(toInt(12), toInt(14), toInt(59), toInt(1020000), toInt(-10800))],
                    ['00:12:01.0+0:15', new Time(toInt(0), toInt(12), toInt(1), toInt(0), toInt(900))]
                ].map(([_value, expected]) => [`Time (value=${_value})`, { $type: 'Time', _value }, expected, config]),
                ...[
                    ['2010-06-15', new Date(toInt(2010), toInt(6), toInt(15))],
                    ['-1986-01-12', new Date(toInt(-1986), toInt(1), toInt(12))],
                    ['+0001-01-12', new Date(toInt(1), toInt(1), toInt(12))]
                ].map(([_value, expected]) => [`Date (value=${_value})`, { $type: 'Date', _value }, expected, config]),
                ...[
                    ['2001-05-03T13:45:00.003404004', new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004))],
                    ['-1987-01-05T10:15:20.0', new LocalDateTime(toInt(-1987), toInt(1), toInt(5), toInt(10), toInt(15), toInt(20), toInt(0))],
                    ['+0001-01-05T10:15:20.0', new LocalDateTime(toInt(1), toInt(1), toInt(5), toInt(10), toInt(15), toInt(20), toInt(0))]
                ].map(([_value, expected]) => [`LocalDateTime (value=${_value})`, { $type: 'LocalDateTime', _value }, expected, config]),
                ...[
                    ['1988-08-23T12:50:35.556000000Z[Antarctica/Troll]', new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll')],
                    ['-1988-08-23T12:50:35.556000000+02:00[Europe/Berlin]', new DateTime(toInt(-1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(7200), 'Europe/Berlin')],
                    ['+1986-08-23T12:50:35.556000000-03:00[America/Sao_Paulo]', new DateTime(toInt(1986), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-10800), 'America/Sao_Paulo')]
                ].map(([_value, expected]) => [`ZonedDateTime (value=${_value})`, { $type: 'ZonedDateTime', _value }, expected, config]),
                ...[
                    ['1988-08-23T12:50:35.556000000+02:00', new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(7200))],
                    ['-1988-08-23T12:50:35.556000000+02:00', new DateTime(toInt(-1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(7200))],
                    ['+1986-08-23T12:50:35.556000000-03:00', new DateTime(toInt(1986), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-10800))]
                ].map(([_value, expected]) => [`OffsetDateTime (value=${_value})`, { $type: 'OffsetDateTime', _value }, expected, config]),
                ...[
                    ['1988-08-23T12:50:35.556000000', new LocalDateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000))],
                    ['-1988-08-23T12:50:35.556000000', new LocalDateTime(toInt(-1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000))],
                    ['+1986-08-23T12:50:35.556000000', new LocalDateTime(toInt(1986), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000))]
                ].map(([_value, expected]) => [`LocalDateTime (value=${_value})`, { $type: 'LocalDateTime', _value }, expected, config]),
                ...[
                    ['P10W', new Duration(toInt(0), toInt(70), toInt(0), toInt(0))],
                    ['P10M', new Duration(toInt(10), toInt(0), toInt(0), toInt(0))],
                    ['P15D', new Duration(toInt(0), toInt(15), toInt(0), toInt(0))],
                    ['P10M15D', new Duration(toInt(10), toInt(15), toInt(0), toInt(0))],
                    ['P10M2W15D', new Duration(toInt(10), toInt(2 * 7 + 15), toInt(0), toInt(0))],
                    ['P10M15DT3H', new Duration(toInt(10), toInt(15), toInt(3 * 3600), toInt(0))],
                    ['P10M15DT2H3S', new Duration(toInt(10), toInt(15), toInt(2 * 3600 + 3), toInt(0))],
                    ['P10M15DT5H0.000003S', new Duration(toInt(10), toInt(15), toInt(5 * 3600), toInt(3000))],
                    ['P10M15DT1H20.000003S', new Duration(toInt(10), toInt(15), toInt(3600 + 20), toInt(3000))],
                    ['P10M15DT8H20,000003S', new Duration(toInt(10), toInt(15), toInt(8 * 3600 + 20), toInt(3000))],
                    ['PT15H20,000003S', new Duration(toInt(0), toInt(0), toInt(15 * 3600 + 20), toInt(3000))],
                    ['PT20H0.000003S', new Duration(toInt(0), toInt(0), toInt(20 * 3600), toInt(3000))],
                    ['P10M15DT5H16M0.000003S', new Duration(toInt(10), toInt(15), toInt(5 * 3600 + 16 * 60), toInt(3000))],
                    ['P10M15DT1H5M20.000003S', new Duration(toInt(10), toInt(15), toInt(3600 + 5 * 60 + 20), toInt(3000))],
                    ['P10M5W15DT1H5M20.000003S', new Duration(toInt(10), toInt(5 * 7 + 15), toInt(3600 + 5 * 60 + 20), toInt(3000))],
                    ['P10M15DT3S', new Duration(toInt(10), toInt(15), toInt(3), toInt(0))],
                    ['P10M15DT0.000003S', new Duration(toInt(10), toInt(15), toInt(0), toInt(3000))],
                    ['P10M15DT20.000003S', new Duration(toInt(10), toInt(15), toInt(20), toInt(3000))],
                    ['P10M15DT20,000003S', new Duration(toInt(10), toInt(15), toInt(20), toInt(3000))],
                    ['PT20,000003S', new Duration(toInt(0), toInt(0), toInt(20), toInt(3000))],
                    ['PT0.000003S', new Duration(toInt(0), toInt(0), toInt(0), toInt(3000))],
                    ['PT1S', new Duration(toInt(0), toInt(0), toInt(1), toInt(0))],
                ].map(([_value, expected]) => [`Duration (value=${_value})`, { $type: 'Duration', _value }, expected, config]),
                ...[
                    ['SRID=4326;POINT (-1.2 3.4)', new Point(toInt(4326), -1.2, 3.4)],
                    ['SRID=7203;POINT (1.2 -3.4)', new Point(toInt(7203), 1.2, -3.4)],
                    ['SRID=4979;POINT Z (123.2 3.4 -35.624)', new Point(toInt(4979), 123.2, 3.4, -35.624)],
                    ['SRID=9157;POINT Z (23.20 03.41 -35.06)', new Point(toInt(9157), 23.2, 3.41, -35.06)],
                ].map(([_value, expected]) => [`Point (value=${_value})`, { $type: 'Point', _value }, expected, config]),
                ...[
                    ['VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIDEzIGxhenkgZG9ncy4=', new Uint8Array([
                        0x54, 0x68, 0x65, 0x20, 0x71, 0x75, 0x69, 0x63, 0x6b, 0x20, 0x62, 0x72, 0x6f,
                        0x77, 0x6e, 0x20, 0x66, 0x6f, 0x78, 0x20, 0x6a, 0x75, 0x6d, 0x70, 0x73, 0x20,
                        0x6f, 0x76, 0x65, 0x72, 0x20, 0x31, 0x33, 0x20, 0x6c, 0x61, 0x7a, 0x79, 0x20,
                        0x64, 0x6f, 0x67, 0x73, 0x2e])],
                    ['FRIDAY==', new Uint8Array([0x15, 0x12, 0x03, 0x01])],
                    ['AA==', new Uint8Array([0x00])],
                    ['', new Uint8Array([])],
                ].map(([_value, expected]) => [`Base64 (value=${_value})`, { $type: 'Base64', _value }, expected, config]),
                ...[
                    [{}, {}],
                    [{
                        none: { $type: 'Null', _value: null },
                        bool: { $type: 'Boolean', _value: false },
                        integer: { $type: 'Integer', _value: '123' },
                        float: { $type: 'Float', _value: '-1234' },
                        string: { $type: 'String', _value: 'Hello, Greg!' },
                        base64: { $type: 'Base64', _value: 'YGCwFw==' },
                        list: { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                        map: { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                        date: { $type: 'Date', _value: '1988-08-23' },
                        time: { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                        localTime: { $type: 'LocalTime', _value: '12:50:35.556000000' },
                        offsetDateTime: { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                        zonedDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                        zonedAndOffsetDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                        localDateTime: { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                        duration: { $type: 'Duration', _value: 'P0M14DT16S' }
                    }, {
                        none: null,
                        bool: false,
                        integer: toInt('123'),
                        float: -1234,
                        string: 'Hello, Greg!',
                        base64: new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                        list: ['A', toInt('12')],
                        map: { a: 'b', c: ['d'] },
                        date: new Date(toInt(1988), toInt(8), toInt(23)),
                        time: new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                        localTime: new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                        offsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                        zonedDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                        zonedAndOffsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                        localDateTime: new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                        duration: new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                    }],
                ].map(([_value, expected]) => [`Map (value=${_value})`, { $type: 'Map', _value }, expected, config]),
                ...[
                    [[], []],
                    [[
                        { $type: 'Null', _value: null },
                        { $type: 'Boolean', _value: false },
                        { $type: 'Integer', _value: '123' },
                        { $type: 'Float', _value: '-1234' },
                        { $type: 'String', _value: 'Hello, Greg!' },
                        { $type: 'Base64', _value: 'YGCwFw==' },
                        { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                        { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                        { $type: 'Date', _value: '1988-08-23' },
                        { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                        { $type: 'LocalTime', _value: '12:50:35.556000000' },
                        { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                        { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                        { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                        { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                        { $type: 'Duration', _value: 'P0M14DT16S' }
                    ], [
                        null,
                        false,
                        toInt('123'),
                        -1234,
                        'Hello, Greg!',
                        new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                        ['A', toInt('12')],
                        { a: 'b', c: ['d'] },
                        new Date(toInt(1988), toInt(8), toInt(23)),
                        new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                        new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                        new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                        new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                        new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                        new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                        new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                    ]],
                ].map(([_value, expected]) => [`List (value=${_value})`, { $type: 'List', _value }, expected, config]),
                ...[
                    [
                        {
                            _element_id: 'the element id',
                            _labels: [],
                            _properties: {}
                        },
                        new Node(undefined as any, [], {}, 'the element id')
                    ], [
                        {
                            _element_id: 'the element id',
                            _labels: ['abcd', 'xvo'],
                            _properties: {}
                        },
                        new Node(undefined as any, ['abcd', 'xvo'], {}, 'the element id')
                    ],
                    [
                        {
                            _element_id: 'the element id',
                            _labels: ['abcd', 'xvo'],
                            _properties: {
                                none: { $type: 'Null', _value: null },
                                bool: { $type: 'Boolean', _value: false },
                                integer: { $type: 'Integer', _value: '123' },
                                float: { $type: 'Float', _value: '-1234' },
                                string: { $type: 'String', _value: 'Hello, Greg!' },
                                base64: { $type: 'Base64', _value: 'YGCwFw==' },
                                list: { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                                map: { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                                date: { $type: 'Date', _value: '1988-08-23' },
                                time: { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                                localTime: { $type: 'LocalTime', _value: '12:50:35.556000000' },
                                offsetDateTime: { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                                zonedDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                                zonedAndOffsetDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                                localDateTime: { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                                duration: { $type: 'Duration', _value: 'P0M14DT16S' }
                            }
                        },
                        new Node(undefined as any, ['abcd', 'xvo'], {
                            none: null,
                            bool: false,
                            integer: toInt('123'),
                            float: -1234,
                            string: 'Hello, Greg!',
                            base64: new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                            list: ['A', toInt('12')],
                            map: { a: 'b', c: ['d'] },
                            date: new Date(toInt(1988), toInt(8), toInt(23)),
                            time: new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                            localTime: new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                            offsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                            zonedDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                            zonedAndOffsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                            localDateTime: new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                            duration: new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                        }, 'the element id')
                    ],
                ].map(([_value, expected]) => [`Node (value=${_value})`, { $type: 'Node', _value }, expected, config]),
                ...[
                    [
                        {
                            _element_id: 'the element id',
                            _start_node_element_id: 'the start node element id',
                            _end_node_element_id: 'the end node element id',
                            _type: 'mitt type',
                        },
                        new Relationship(undefined as any, undefined as any, undefined as any,
                            'mitt type', {}, 'the element id', 'the start node element id',
                            'the end node element id')
                    ], [
                        {
                            _element_id: 'the element id',
                            _start_node_element_id: 'the start node element id',
                            _end_node_element_id: 'the end node element id',
                            _type: 'mitt type',
                            _properties: {}
                        },
                        new Relationship(undefined as any, undefined as any, undefined as any,
                            'mitt type', {}, 'the element id', 'the start node element id',
                            'the end node element id')
                    ],
                    [
                        {
                            _element_id: 'the element id',
                            _start_node_element_id: 'the start node element id',
                            _end_node_element_id: 'the end node element id',
                            _type: 'mitt type',
                            _properties: {
                                none: { $type: 'Null', _value: null },
                                bool: { $type: 'Boolean', _value: false },
                                integer: { $type: 'Integer', _value: '123' },
                                float: { $type: 'Float', _value: '-1234' },
                                string: { $type: 'String', _value: 'Hello, Greg!' },
                                base64: { $type: 'Base64', _value: 'YGCwFw==' },
                                list: { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                                map: { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                                date: { $type: 'Date', _value: '1988-08-23' },
                                time: { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                                localTime: { $type: 'LocalTime', _value: '12:50:35.556000000' },
                                offsetDateTime: { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                                zonedDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                                zonedAndOffsetDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                                localDateTime: { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                                duration: { $type: 'Duration', _value: 'P0M14DT16S' }
                            }
                        },
                        new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type', {
                            none: null,
                            bool: false,
                            integer: toInt('123'),
                            float: -1234,
                            string: 'Hello, Greg!',
                            base64: new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                            list: ['A', toInt('12')],
                            map: { a: 'b', c: ['d'] },
                            date: new Date(toInt(1988), toInt(8), toInt(23)),
                            time: new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                            localTime: new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                            offsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                            zonedDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                            zonedAndOffsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                            localDateTime: new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                            duration: new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                        }, 'the element id', 'the start node element id', 'the end node element id')
                    ],
                ].map(([_value, expected]) => [`Relationship (value=${_value})`, { $type: 'Relationship', _value }, expected, config]),
                ...[
                    [
                        [

                            {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node 1 element id',
                                    _labels: ['abcd', 'xvo'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '123' },
                                    }
                                }
                            }, {
                                $type: 'Relationship',
                                _value: {
                                    _element_id: 'rel 1 element id',
                                    _start_node_element_id: 'node 1 element id',
                                    _end_node_element_id: 'node n element id',
                                    _type: 'mitt type',
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '1' },
                                    }
                                }
                            }, {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node n element id',
                                    _labels: ['yeap'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '212' },
                                    }
                                }
                            },
                        ],
                        new Path(
                            new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                            new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id'),
                            [new PathSegment(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                    { integer: toInt(1) }, 'rel 1 element id', 'node 1 element id', 'node n element id'),
                                new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id')
                            )]
                        )
                    ],
                    [
                        [

                            {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node 1 element id',
                                    _labels: ['abcd', 'xvo'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '123' },
                                    }
                                }
                            }, {
                                $type: 'Relationship',
                                _value: {
                                    _element_id: 'rel 1 element id',
                                    _start_node_element_id: 'node 1 element id',
                                    _end_node_element_id: 'node 2 element id',
                                    _type: 'mitt type',
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '1' },
                                    }
                                }
                            }, {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node 2 element id',
                                    _labels: ['abcd', 'xvo'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '123' },
                                    }
                                }
                            }, {
                                $type: 'Relationship',
                                _value: {
                                    _element_id: 'rel 2 element id',
                                    _start_node_element_id: 'node 2 element id',
                                    _end_node_element_id: 'node 3 element id',
                                    _type: 'mitt type',
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '1' },
                                    }
                                }
                            }, {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node 3 element id',
                                    _labels: ['abcd', 'xvo'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '123' },
                                    }
                                }
                            }, {
                                $type: 'Relationship',
                                _value: {
                                    _element_id: 'rel 3 element id',
                                    _start_node_element_id: 'node 3 element id',
                                    _end_node_element_id: 'node n element id',
                                    _type: 'mitt type',
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '1' },
                                    }
                                }
                            }, {
                                $type: 'Node',
                                _value: {
                                    _element_id: 'node n element id',
                                    _labels: ['yeap'],
                                    _properties: {
                                        integer: { $type: 'Integer', _value: '212' },
                                    }
                                }
                            },
                        ],
                        new Path(
                            new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                            new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id'),
                            [new PathSegment(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                    { integer: toInt(1) }, 'rel 1 element id', 'node 1 element id', 'node 2 element id'),
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 2 element id')
                            ),
                            new PathSegment(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 2 element id'),
                                new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                    { integer: toInt(1) }, 'rel 2 element id', 'node 2 element id', 'node 3 element id'),
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 3 element id')
                            ),
                            new PathSegment(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 3 element id'),
                                new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                    { integer: toInt(1) }, 'rel 3 element id', 'node 3 element id', 'node n element id'),
                                new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id')
                            )]
                        )
                    ]
                ].map(([_value, expected]) => [`Path (value=${_value})`, { $type: 'Path', _value }, expected, config]),
            ])
        ])('should handle profile arguments from type %s', (_: string, argument: any, expected: any, config?: Partial<types.InternalConfig>) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    profiledQueryPlan: {
                        dbHits: 123,
                        records: 223,
                        hasPageCacheStats: false,
                        pageCacheHits: 2345,
                        pageCacheMisses: 328278,
                        pageCacheHitRatio: 32233,
                        time: 1234,
                        operatorType: 'write',
                        identifiers: ['a', 'b'],
                        arguments: {
                            'my arg': argument
                        },
                        children: [{
                            dbHits: 123,
                            records: 223,
                            hasPageCacheStats: false,
                            pageCacheHits: 2345,
                            pageCacheMisses: 328278,
                            pageCacheHitRatio: 32233,
                            time: 1234,
                            operatorType: 'write',
                            identifiers: ['a', 'b'],
                            arguments: {
                                'the other arg': argument
                            },
                            children: []
                        }]
                    }
                },
                config
            })

            //@ts-expect-error
            expect(codec.meta.profile.args).toEqual({
                'my arg': expected
            })

            //@ts-expect-error
            expect(codec.meta.profile.children[0].args).toEqual({
                'the other arg': expected
            })
        })

        it.each(
            errorConditionsFixture()
        )('should handle %s failures', (_: string, param: SubjectParams) => {
            const codec = subject(param)

            expect(() => codec.meta).toThrow(codec.error)
        })
    })

    describe('.stream()', () => {
        it.each([
            ...[
                ...useCustomIntegerConfigFixture().map(config => ({ toInt: int, config })),
                ...useLossyIntegerConfigFixture().map(config => ({ toInt: (v: any) => int(v).toInt(), config })),
                ...useBigIntConfigFixture().map(config => ({ toInt: (v: any) => int(v).toBigInt(), config })),
            ].flatMap(({ toInt, config }) => [
                ['Empty', [], [], config],
                ['one line and one value', [[{ $type: 'String', _value: 'the string' }]], [['the string']], config],
                ['multi line and one value', [
                    [{ $type: 'Null', _value: null }],
                    [{ $type: 'Boolean', _value: false }],
                    [{ $type: 'Integer', _value: '123' }],
                    [{ $type: 'Float', _value: '-1234' }],
                    [{ $type: 'String', _value: 'Hello, Greg!' }],
                    [{ $type: 'Base64', _value: 'YGCwFw==' }],
                    [{ $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] }],
                    [{ $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } }],
                    [{ $type: 'Date', _value: '1988-08-23' }],
                    [{ $type: 'Time', _value: '12:50:35.556000000+01:00' }],
                    [{ $type: 'LocalTime', _value: '12:50:35.556000000' }],
                    [{ $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' }],
                    [{ $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' }],
                    [{ $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' }],
                    [{ $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' }],
                    [{ $type: 'Duration', _value: 'P0M14DT16S' }]
                ], [
                        [null],
                        [false],
                        [toInt('123')],
                        [-1234],
                        ['Hello, Greg!'],
                        [new Uint8Array([0x60, 0x60, 0xB0, 0x17])],
                        [['A', toInt('12')]],
                        [{ a: 'b', c: ['d'] }],
                        [new Date(toInt(1988), toInt(8), toInt(23))],
                        [new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600))],
                        [new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000))],
                        [new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600))],
                        [new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll')],
                        [new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll')],
                        [new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004))],
                        [new Duration(toInt(0), toInt(14), toInt(16), toInt(0))]
                    ], config],
                ['one line and multiple values', [
                    [{ $type: 'Null', _value: null },
                    { $type: 'Boolean', _value: false },
                    { $type: 'Integer', _value: '123' },
                    { $type: 'Float', _value: '-1234' },
                    { $type: 'String', _value: 'Hello, Greg!' },
                    { $type: 'Base64', _value: 'YGCwFw==' },
                    { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                    { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                    { $type: 'Date', _value: '1988-08-23' },
                    { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                    { $type: 'LocalTime', _value: '12:50:35.556000000' },
                    { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                    { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                    { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                    { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                    { $type: 'Duration', _value: 'P0M14DT16S' }]
                ], [
                        [null,
                            false,
                            toInt('123'),
                            -1234,
                            'Hello, Greg!',
                            new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                            ['A', toInt('12')],
                            { a: 'b', c: ['d'] },
                            new Date(toInt(1988), toInt(8), toInt(23)),
                            new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                            new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                            new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                            new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                            new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                            new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                            new Duration(toInt(0), toInt(14), toInt(16), toInt(0))]
                    ], config],
                    ...[
                        [
                            {
                                _element_id: 'the element id',
                                _labels: [],
                                _properties: {}
                            },
                            new Node(undefined as any, [], {}, 'the element id')
                        ], [
                            {
                                _element_id: 'the element id',
                                _labels: ['abcd', 'xvo'],
                                _properties: {}
                            },
                            new Node(undefined as any, ['abcd', 'xvo'], {}, 'the element id')
                        ],
                        [
                            {
                                _element_id: 'the element id',
                                _labels: ['abcd', 'xvo'],
                                _properties: {
                                    none: { $type: 'Null', _value: null },
                                    bool: { $type: 'Boolean', _value: false },
                                    integer: { $type: 'Integer', _value: '123' },
                                    float: { $type: 'Float', _value: '-1234' },
                                    string: { $type: 'String', _value: 'Hello, Greg!' },
                                    base64: { $type: 'Base64', _value: 'YGCwFw==' },
                                    list: { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                                    map: { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                                    date: { $type: 'Date', _value: '1988-08-23' },
                                    time: { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                                    localTime: { $type: 'LocalTime', _value: '12:50:35.556000000' },
                                    offsetDateTime: { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                                    zonedDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                                    zonedAndOffsetDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                                    localDateTime: { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                                    duration: { $type: 'Duration', _value: 'P0M14DT16S' }
                                }
                            },
                            new Node(undefined as any, ['abcd', 'xvo'], {
                                none: null,
                                bool: false,
                                integer: toInt('123'),
                                float: -1234,
                                string: 'Hello, Greg!',
                                base64: new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                                list: ['A', toInt('12')],
                                map: { a: 'b', c: ['d'] },
                                date: new Date(toInt(1988), toInt(8), toInt(23)),
                                time: new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                                localTime: new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                                offsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                                zonedDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                                zonedAndOffsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                                localDateTime: new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                                duration: new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                            }, 'the element id')
                        ],
                    ].map(([_value, expected]) => [`Node (value=${_value})`, [[{ $type: 'Node', _value }]], [[expected]], config]),
                    ...[
                        [
                            {
                                _element_id: 'the element id',
                                _start_node_element_id: 'the start node element id',
                                _end_node_element_id: 'the end node element id',
                                _type: 'mitt type',
                            },
                            new Relationship(undefined as any, undefined as any, undefined as any,
                                'mitt type', {}, 'the element id', 'the start node element id',
                                'the end node element id')
                        ], [
                            {
                                _element_id: 'the element id',
                                _start_node_element_id: 'the start node element id',
                                _end_node_element_id: 'the end node element id',
                                _type: 'mitt type',
                                _properties: {}
                            },
                            new Relationship(undefined as any, undefined as any, undefined as any,
                                'mitt type', {}, 'the element id', 'the start node element id',
                                'the end node element id')
                        ],
                        [
                            {
                                _element_id: 'the element id',
                                _start_node_element_id: 'the start node element id',
                                _end_node_element_id: 'the end node element id',
                                _type: 'mitt type',
                                _properties: {
                                    none: { $type: 'Null', _value: null },
                                    bool: { $type: 'Boolean', _value: false },
                                    integer: { $type: 'Integer', _value: '123' },
                                    float: { $type: 'Float', _value: '-1234' },
                                    string: { $type: 'String', _value: 'Hello, Greg!' },
                                    base64: { $type: 'Base64', _value: 'YGCwFw==' },
                                    list: { $type: 'List', _value: [{ $type: 'String', _value: 'A' }, { $type: 'Integer', _value: '12' }] },
                                    map: { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } },
                                    date: { $type: 'Date', _value: '1988-08-23' },
                                    time: { $type: 'Time', _value: '12:50:35.556000000+01:00' },
                                    localTime: { $type: 'LocalTime', _value: '12:50:35.556000000' },
                                    offsetDateTime: { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' },
                                    zonedDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' },
                                    zonedAndOffsetDateTime: { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' },
                                    localDateTime: { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' },
                                    duration: { $type: 'Duration', _value: 'P0M14DT16S' }
                                }
                            },
                            new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type', {
                                none: null,
                                bool: false,
                                integer: toInt('123'),
                                float: -1234,
                                string: 'Hello, Greg!',
                                base64: new Uint8Array([0x60, 0x60, 0xB0, 0x17]),
                                list: ['A', toInt('12')],
                                map: { a: 'b', c: ['d'] },
                                date: new Date(toInt(1988), toInt(8), toInt(23)),
                                time: new Time(toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600)),
                                localTime: new LocalTime(toInt(12), toInt(50), toInt(35), toInt(556000000)),
                                offsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(-3600)),
                                zonedDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), undefined, 'Antarctica/Troll'),
                                zonedAndOffsetDateTime: new DateTime(toInt(1988), toInt(8), toInt(23), toInt(12), toInt(50), toInt(35), toInt(556000000), toInt(3600), 'Antarctica/Troll'),
                                localDateTime: new LocalDateTime(toInt(2001), toInt(5), toInt(3), toInt(13), toInt(45), toInt(0), toInt(3404004)),
                                duration: new Duration(toInt(0), toInt(14), toInt(16), toInt(0))
                            }, 'the element id', 'the start node element id', 'the end node element id')
                        ],
                    ].map(([_value, expected]) => [`Relationship (value=${_value})`, [[{ $type: 'Relationship', _value }]], [[expected]], config]),
                    ...[
                        [
                            [
    
                                {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node 1 element id',
                                        _labels: ['abcd', 'xvo'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '123' },
                                        }
                                    }
                                }, {
                                    $type: 'Relationship',
                                    _value: {
                                        _element_id: 'rel 1 element id',
                                        _start_node_element_id: 'node 1 element id',
                                        _end_node_element_id: 'node n element id',
                                        _type: 'mitt type',
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '1' },
                                        }
                                    }
                                }, {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node n element id',
                                        _labels: ['yeap'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '212' },
                                        }
                                    }
                                },
                            ],
                            new Path(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id'),
                                [new PathSegment(
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                    new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                        { integer: toInt(1) }, 'rel 1 element id', 'node 1 element id', 'node n element id'),
                                    new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id')
                                )]
                            )
                        ],
                        [
                            [
    
                                {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node 1 element id',
                                        _labels: ['abcd', 'xvo'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '123' },
                                        }
                                    }
                                }, {
                                    $type: 'Relationship',
                                    _value: {
                                        _element_id: 'rel 1 element id',
                                        _start_node_element_id: 'node 1 element id',
                                        _end_node_element_id: 'node 2 element id',
                                        _type: 'mitt type',
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '1' },
                                        }
                                    }
                                }, {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node 2 element id',
                                        _labels: ['abcd', 'xvo'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '123' },
                                        }
                                    }
                                }, {
                                    $type: 'Relationship',
                                    _value: {
                                        _element_id: 'rel 2 element id',
                                        _start_node_element_id: 'node 2 element id',
                                        _end_node_element_id: 'node 3 element id',
                                        _type: 'mitt type',
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '1' },
                                        }
                                    }
                                }, {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node 3 element id',
                                        _labels: ['abcd', 'xvo'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '123' },
                                        }
                                    }
                                }, {
                                    $type: 'Relationship',
                                    _value: {
                                        _element_id: 'rel 3 element id',
                                        _start_node_element_id: 'node 3 element id',
                                        _end_node_element_id: 'node n element id',
                                        _type: 'mitt type',
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '1' },
                                        }
                                    }
                                }, {
                                    $type: 'Node',
                                    _value: {
                                        _element_id: 'node n element id',
                                        _labels: ['yeap'],
                                        _properties: {
                                            integer: { $type: 'Integer', _value: '212' },
                                        }
                                    }
                                },
                            ],
                            new Path(
                                new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id'),
                                [new PathSegment(
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 1 element id'),
                                    new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                        { integer: toInt(1) }, 'rel 1 element id', 'node 1 element id', 'node 2 element id'),
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 2 element id')
                                ),
                                new PathSegment(
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 2 element id'),
                                    new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                        { integer: toInt(1) }, 'rel 2 element id', 'node 2 element id', 'node 3 element id'),
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 3 element id')
                                ),
                                new PathSegment(
                                    new Node(undefined as any, ['abcd', 'xvo'], { integer: toInt(123) }, 'node 3 element id'),
                                    new Relationship(undefined as any, undefined as any, undefined as any, 'mitt type',
                                        { integer: toInt(1) }, 'rel 3 element id', 'node 3 element id', 'node n element id'),
                                    new Node(undefined as any, ['yeap'], { integer: toInt(212) }, 'node n element id')
                                )]
                            )
                        ]
                    ].map(([_value, expected]) => [`Path (value=${_value})`, [[{ $type: 'Path', _value }]], [[expected]], config]),
            ])
        ])('should handle %s values', (_: string, values: any, expected: any, config?: Partial<types.InternalConfig>) => {
            const codec = subject({
                rawQueryResponse: {
                    ...DEFAULT_RAW_RESPONSE,
                    data: {
                        ...DEFAULT_RAW_RESPONSE.data,
                        values
                    }
                },
                config
            })

            expect([...codec.stream()]).toEqual(expected)
            // the stream should be consumed,
            // no data should come after
            expect([...codec.stream()]).toEqual([])
        })

        it.each(
            errorConditionsFixture()
        )('should handle %s failures', (_: string, param: SubjectParams) => {
            const codec = subject(param)

            expect(() => codec.stream()).toThrow(codec.error)
        })
    })

    type SubjectParams = Partial<{
        config: types.InternalConfig,
        contentType: string,
        rawQueryResponse: RawQueryResponse
    }>

    function subject(param?: SubjectParams) {
        return QueryResponseCodec.of(
            { ...DEFAULT_CONFIG, ...param?.config },
            param?.contentType ?? DEFAULT_CONTENT_TYPE,
            param?.rawQueryResponse ?? DEFAULT_RAW_RESPONSE
        )
    }

    function useCustomIntegerConfigFixture(): (Partial<types.InternalConfig> | undefined)[] {
        return [undefined, {}, { disableLosslessIntegers: false }]
    }

    function useLossyIntegerConfigFixture() {
        return [{ disableLosslessIntegers: true }, { useBigInt: false, disableLosslessIntegers: true }];
    }

    function useBigIntConfigFixture() {
        return [{ useBigInt: true }, { useBigInt: true, disableLosslessIntegers: true }, { useBigInt: true, disableLosslessIntegers: false }];
    }

    function useChildrenFixture() {
        return [
            { children: [], expectedChildren: [] },
            {
                children: [{
                    dbHits: 123,
                    records: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a'],
                }], expectedChildren: [{
                    dbHits: 123,
                    rows: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a']
                }]
            },
            {
                children: [{
                    dbHits: 123,
                    records: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a'],
                },
                {
                    dbHits: 123,
                    records: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b'],
                }], expectedChildren: [{
                    dbHits: 123,
                    rows: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a']
                }, {
                    dbHits: 123,
                    rows: 223,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 32233,
                    time: 1234,
                    operatorType: 'write',
                    identifiers: ['a', 'b']
                }]
            },
            {
                children: [{
                    dbHits: 123,
                    records: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a'],
                    children: [{
                        dbHits: 123,
                        records: 223,
                        hasPageCacheStats: false,
                        pageCacheHits: 2345,
                        pageCacheMisses: 328278,
                        pageCacheHitRatio: 32233,
                        time: 1234,
                        operatorType: 'write',
                        identifiers: ['a', 'b'],
                    }]
                }], expectedChildren: [{
                    dbHits: 123,
                    rows: 101818,
                    hasPageCacheStats: false,
                    pageCacheHits: 2345,
                    pageCacheMisses: 328278,
                    pageCacheHitRatio: 233,
                    time: 1234,
                    operatorType: 'read',
                    identifiers: ['a'],
                    children: [{
                        dbHits: 123,
                        rows: 223,
                        hasPageCacheStats: false,
                        pageCacheHits: 2345,
                        pageCacheMisses: 328278,
                        pageCacheHitRatio: 32233,
                        time: 1234,
                        operatorType: 'write',
                        identifiers: ['a', 'b']
                    }]
                }]
            }
        ]
    }

    function errorConditionsFixture(): [string, SubjectParams][] {
        return [
            ['response returned', {
                rawQueryResponse: {
                    errors: [{
                        message: 'Something wrong is mighty right',
                        code: 'Neo.ClientError.Made.Up'
                    }]
                }
            }],
            ['empty list', {
                rawQueryResponse: {
                    errors: []
                }
            }],
            ['content type', {
                contentType: 'application/json'
            }]
        ]
    }
})
