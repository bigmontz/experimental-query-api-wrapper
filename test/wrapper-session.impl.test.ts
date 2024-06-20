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
import WrapperSessionImpl from "../src/wrapper-session.impl"
import { Result, Session } from "neo4j-driver-core"


export type Query = string | String | {
    text: string;
    parameters?: any;
};

describe('WrapperSessionImpl', () => {

    describe('.run()', () => {
        it.each([
            ['RETURN 1', undefined, undefined],
            ['RETURN $n', { n: 2 }, undefined],
            [{ text: 'RETURN 3'}, undefined, undefined],
            [{ text: 'RETURN $n', parameters: { n: 3}}, undefined, undefined],
            [{ text: 'RETURN $n', parameters: { n: 3}}, { n: 4 }, undefined],
            ['RETURN 1', undefined, { timeout: 123, metadata: { a: 5 } }],
            ['RETURN $n', { n: 2 }, { timeout: 123, metadata: { a: 5 } }],
            [{ text: 'RETURN 3'}, undefined, { timeout: 123, metadata: { a: 5 } }],
            [{ text: 'RETURN $n', parameters: { n: 3}}, undefined, { timeout: 123, metadata: { a: 5 } }],
            [{ text: 'RETURN $n', parameters: { n: 3}}, { n: 4 }, { timeout: 123, metadata: { a: 5 } }],
        ])('should redirect params to the underline Session.run()', async (query: Query, params: any, txConfig: any) => {
             const {mockedSession, spyOnRun} = mockDriverSession()
             const wrapperSession = new WrapperSessionImpl(mockedSession)
             const expectedResult = resultFromResolvedObserver(mockCompletedObserver())
             spyOnRun.mockReturnValueOnce(expectedResult)

             const result = wrapperSession.run(query, params, txConfig)

             expect(result).toBe(expectedResult)
             expect(spyOnRun).toHaveBeenCalledWith(query, params, txConfig)
        })
    })

    describe('.lastBookmarks()', () => {
        it('should redirect to the underline Session.lastBookmarks()', () => {
            const { mockedSession, spyOnLastBookmarks} = mockDriverSession()
            const wrapperSession = new WrapperSessionImpl(mockedSession)
            const expectedBookmarks = ['abc']
            spyOnLastBookmarks.mockReturnValueOnce(expectedBookmarks)

            const lastBookmarks = wrapperSession.lastBookmarks()

            expect(lastBookmarks).toBe(expectedBookmarks)
            expect(spyOnLastBookmarks).toHaveBeenCalledWith()
        })
    })

    describe('.close()', () => {
        it('should redirect to the underline Session.close()', () => {
            const { mockedSession, spyOnClose } = mockDriverSession()
            const wrapperSession = new WrapperSessionImpl(mockedSession)
            const expectedPromise = Promise.resolve()
            spyOnClose.mockReturnValue(expectedPromise)

            const promise = wrapperSession.close()

            expect(promise).toBe(expectedPromise)
            expect(spyOnClose).toHaveBeenCalledWith()
        })
    })

    describe('[Symbol.asyncDispose]()', () => {
        it('should redirect to the underline Session.close()', () => {
            const { mockedSession, spyOnClose } = mockDriverSession()
            const wrapperSession = new WrapperSessionImpl(mockedSession)
            const expectedPromise = Promise.resolve()
            spyOnClose.mockReturnValue(expectedPromise)

            const promise = wrapperSession[Symbol.asyncDispose]()

            expect(promise).toBe(expectedPromise)
            expect(spyOnClose).toHaveBeenCalledWith()
        })
    })
})

function mockDriverSession () {
    // @ts-expect-error
    const mockedSession = new Session({})
    const spyOnRun = jest.spyOn(mockedSession, 'run')
    const spyOnLastBookmarks = jest.spyOn(mockedSession, 'lastBookmarks')
    const spyOnClose = jest.spyOn(mockedSession, 'close')
    return { mockedSession, spyOnRun, spyOnLastBookmarks, spyOnClose};
}

function resultFromResolvedObserver (observer: any, query: string = 'query'): Result {
    return new Result(Promise.resolve(observer), query)
}

function mockCompletedObserver (meta: object = {}) {
    return {
        cancel() {

        },
        markCompleted() {
            
        },
        onError(_error: Error) {

            
        },
        pause() {
            
        },
        prepareToHandleSingleResponse() {
            
        },
        subscribe(observer: any) {
            if (observer.onCompleted) {
                observer.onCompleted(meta)
            }
        },
        resume() {
            
        },
        onCompleted(meta: Object) {
            
        },
        onNext(rawRecord: any[]) {
            
        }
     }
}  