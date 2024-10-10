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
import { auth, types } from "neo4j-driver-core"
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