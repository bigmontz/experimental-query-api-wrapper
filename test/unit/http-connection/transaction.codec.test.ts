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
    BeginTransactionResponseCodec,
    CommitTransactionRequestCodec,
    CommitTransactionRequestCodecConfig, 
    CommitTransactionResponseCodec, 
    RawBeginTransactionResponse, 
    RawCommitTransactionResponse, 
    RawRollbackTransactionResponse, 
    RollbackTransactionRequestCodec,
    RollbackTransactionRequestCodecConfig, 
    RollbackTransactionResponseCodec
} from "../../../src/http-connection/transaction.codec"
import { NEO4J_QUERY_CONTENT_TYPE } from "../../../src/http-connection/codec"

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

describe('BeginTransactionResponseCodec', () => {
    const DEFAULT_CONTENT_TYPE = NEO4J_QUERY_CONTENT_TYPE
    const DEFAULT_RAW_RESPONSE = {
        transaction: {
            id: 'abc',
            expires: '2024-10-18T09:11:12Z'
        }
    }

    describe('.id', () => {
        it('should handle success', () => {
            const codec = subject()

            expect(codec.id).toBe(DEFAULT_RAW_RESPONSE.transaction.id)
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

            expect(() => codec.id).toThrow(codec.error)
        })
    })

    describe('.expires', () => {
        it('should handle success', () => {
            const codec = subject()

            expect(codec.expires).toEqual(new Date(DEFAULT_RAW_RESPONSE.transaction.expires))
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

            expect(() => codec.expires).toThrow(codec.error)
        })
    })

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
    })

    type SubjectParams = Partial<{
        config: types.InternalConfig,
        contentType: string,
        rawQueryResponse: RawBeginTransactionResponse
    }>

    function subject(param?: SubjectParams) {
        return BeginTransactionResponseCodec.of(
            { ...param?.config },
            param?.contentType ?? DEFAULT_CONTENT_TYPE,
            param?.rawQueryResponse ?? DEFAULT_RAW_RESPONSE
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

describe('CommitTransactionResponseCodec', () => {
    const DEFAULT_CONTENT_TYPE = NEO4J_QUERY_CONTENT_TYPE
    const DEFAULT_RAW_RESPONSE = {
        bookmarks: ['abc']
    }

    describe('.meta', () => {
        it.each([
            [undefined],
            [[]],
            [['single']],
            [['double', 'ones']]
        ])('should handle success %s', (bookmarks) => {
            const codec = subject({ rawQueryResponse: { bookmarks }})

            expect(codec.meta).toEqual({
                bookmark: bookmarks
            })
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

            expect(() => codec.meta).toThrow(codec.error)
        })
    })

    
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
    })

    type SubjectParams = Partial<{
        config: types.InternalConfig,
        contentType: string,
        rawQueryResponse: RawCommitTransactionResponse
    }>

    function subject(param?: SubjectParams) {
        return CommitTransactionResponseCodec.of(
            { ...param?.config },
            param?.contentType ?? DEFAULT_CONTENT_TYPE,
            param?.rawQueryResponse ?? DEFAULT_RAW_RESPONSE
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

describe('RollbackTransactionResponseCodec', () => {
    const DEFAULT_CONTENT_TYPE = NEO4J_QUERY_CONTENT_TYPE
    const DEFAULT_RAW_RESPONSE = {}

    describe('.meta', () => {
        it('should handle success', () => {
            const codec = subject()

            expect(codec.meta).toEqual({})
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

            expect(() => codec.meta).toThrow(codec.error)
        })
    })

    
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
    })

    type SubjectParams = Partial<{
        config: types.InternalConfig,
        contentType: string,
        rawQueryResponse: RawRollbackTransactionResponse
    }>

    function subject(param?: SubjectParams) {
        return RollbackTransactionResponseCodec.of(
            { ...param?.config },
            param?.contentType ?? DEFAULT_CONTENT_TYPE,
            param?.rawQueryResponse ?? DEFAULT_RAW_RESPONSE
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