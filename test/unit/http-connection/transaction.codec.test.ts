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
import { auth, types, internal, int } from "neo4j-driver-core"
import { 
    BeginTransactionRequestCodec, 
    BeginTransactionRequestCodecConfig,
    CommitTransactionRequestCodec,
    CommitTransactionRequestCodecConfig, 
    RollbackTransactionRequestCodec,
    RollbackTransactionRequestCodecConfig 
} from "../../../src/http-connection/transaction.codec"

const DEFAULT_AUTH = auth.basic('neo4j', 'password')


describe('BeginTransactionRequestCodec', () => { 
    describe('.contentType', () => {
        it('should return "application/json"', () => {
            const codec = subject()

            expect(codec.contentType).toBe('application/json')
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
        const DEFAULT_BODY = {}

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
    })

    function subject(params?: Partial<{
        auth: types.AuthToken,
        query: string,
        parameters: Record<string, unknown>,
        config: BeginTransactionRequestCodecConfig
    }>) {
        return BeginTransactionRequestCodec.of(
            params?.auth ?? DEFAULT_AUTH,
            params?.config
        )
    }
})

describe('CommitTransactionRequestCodec', () => { 
    describe('.contentType', () => {
        it('should return "application/json"', () => {
            const codec = subject()

            expect(codec.contentType).toBe('application/json')
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
        const DEFAULT_BODY = {}

        it('should return default body', () => {
            const codec = subject({
                config: {

                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY
            })
        })
    })

    function subject(params?: Partial<{
        auth: types.AuthToken,
        query: string,
        parameters: Record<string, unknown>,
        config: CommitTransactionRequestCodecConfig
    }>) {
        return CommitTransactionRequestCodec.of(
            params?.auth ?? DEFAULT_AUTH,
            params?.config
        )
    }
})

describe('RollbackTransactionRequestCodec', () => { 
    describe('.contentType', () => {
        it('should return "application/json"', () => {
            const codec = subject()

            expect(codec.contentType).toBe('application/json')
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
        const DEFAULT_BODY = {}

        it('should return default body', () => {
            const codec = subject({
                config: {
                }
            })

            expect(codec.body).toEqual({
                ...DEFAULT_BODY
            })
        })
    })

    function subject(params?: Partial<{
        auth: types.AuthToken,
        query: string,
        parameters: Record<string, unknown>,
        config: RollbackTransactionRequestCodecConfig
    }>) {
        return RollbackTransactionRequestCodec.of(
            params?.auth ?? DEFAULT_AUTH,
            params?.config
        )
    }
})

function v<T, K = T>(value: T, expected?: K | (() => K)): [T, K] {
    if (expected === undefined) {
        expected = value as unknown as K
    } else if (typeof expected === 'function') {
        expected = (expected as unknown as Function)() as K
    }
    return [value, expected]
}