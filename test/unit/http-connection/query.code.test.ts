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

import { auth, types, internal, int, Date, Time, LocalTime, DateTime, LocalDateTime, Point, Duration, Node, Relationship, UnboundRelationship, Path, PathSegment } from "neo4j-driver-core";
import { QueryRequestCodec, QueryRequestCodecConfig } from "../../../src/http-connection/query.codec";

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
            ['Map', v({ a: 'b', c: ['d'] }, { $type: 'Map', _value: { a: { $type: 'String', _value: 'b' }, c: { $type: 'List', _value: [{ $type: 'String', _value: 'd' }] } } })],
            ['Date', v(new Date(1988, 8, 23), { $type: 'Date', _value: '1988-08-23' })],
            ['Time', v(new Time(12, 50, 35, 556000000, 3600), { $type: 'Time', _value: '12:50:35.556000000+01:00' })],
            ['LocalTime', v(new LocalTime(12, 50, 35, 556000000), { $type: 'LocalTime', _value: '12:50:35.556000000' })],
            ['OffsetDateTime', v(new DateTime(1988, 8, 23, 12, 50, 35, 556000000, -3600), { $type: 'OffsetDateTime', _value: '1988-08-23T12:50:35.556000000-01:00' })],
            // TODO: FIX
            // ['ZonedDateTime', v(new DateTime(1988, 8, 23, 12, 50, 35, 556000000, undefined, 'Antarctica/Troll'), { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000Z[Antarctica/Troll]' })],
            ['ZonedAndOffsetDateTime', v(new DateTime(1988, 8, 23, 12, 50, 35, 556000000, 3600, 'Antarctica/Troll'), { $type: 'ZonedDateTime', _value: '1988-08-23T12:50:35.556000000+01:00[Antarctica/Troll]' })],
            ['LocalDateTime', v(new LocalDateTime(2001, 5, 3, 13, 45, 0, 3404004), { $type: 'LocalDateTime', _value: '2001-05-03T13:45:00.003404004' })],
            ['Duration', v(new Duration(0, 14, 16, 0), { $type: 'Duration', _value: 'P0M14DT16S' })],
            ['WGS Point 2D', v(new Point(int(4326), 1.2, 3.4), { '$type': 'Point', _value: 'SRID=4326;POINT (1.2 3.4)'})],
            ['CARTESIAN Point 2D', v(new Point(int(7203), 1.2, 3.4), { '$type': 'Point', _value: 'SRID=7203;POINT (1.2 3.4)'})],
            ['WGS Point 3D', v(new Point(int(4979), 1.2, 3.4, 5.6), { '$type': 'Point', _value: 'SRID=4979;POINT Z (1.2 3.4 5.6)'})],
            ['CARTESIAN Point 3D', v(new Point(int(9157), 1.2, 3.4, 5.6), { '$type': 'Point', _value: 'SRID=9157;POINT Z (1.2 3.4 5.6)'})],
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

        it.each([
            ['Node', new Node(234, [], {})],
            ['Relationship', new Relationship(2, 1, 4, '1', {}) ],
            ['UnboundRelationship', new UnboundRelationship(1, 'a', {})],
            ['Path', new Path(new Node(1, [], {}), new Node(1, [], {}), [])],
            ['PathSegment', new PathSegment(new Node(1, [], {}), new Relationship(2, 1, 4, '1', {}), new Node(1, [], {}))],
        ])('should not handle graph types as parameters (%s)', (_, param) => {
            const codec = subject({
                parameters: {
                    param
                }
            })

            expect(() => codec.body ).toThrow('Graph types can not be ingested to the server')

        })

    })



    function subject(params?: Partial<{
        auth: types.AuthToken,
        query: string,
        parameters: Record<string, unknown>,
        config: QueryRequestCodecConfig
    }>) {
        return new QueryRequestCodec(
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