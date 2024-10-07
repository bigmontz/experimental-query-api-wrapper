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

import Pipe from "../../../../src/http-connection/lang/pipe"

describe('Pipe', () => {
    describe('when newly created', () => {
        it.each(successWorkFixture())('should execute work %s', async (_, func) => {
            const pipe = new Pipe()
            const work = jest.fn(func)

            await expect(pipe.attach(work)).resolves.toBe(undefined)

            expect(work).toHaveBeenCalled()
        })

        it.each(failedWorkFixture())('should report failure on the work %s', async (_, workFactory) => {
            const expectedError = new Error('My fun error')
            const pipe = new Pipe()
            const work = jest.fn(workFactory(expectedError))

            await expect(pipe.attach(work)).rejects.toBe(expectedError)
        })
    })

    describe.each(successWorkFixture())('when success execute previous work %s', (_, previousWorkFunc) => {
        it.each(successWorkFixture())('should execute work %s', async (_, func) => {
            const pipe = new Pipe()
            const work = jest.fn(func)
            await expect(pipe.attach(previousWorkFunc)).resolves.toBe(undefined)

            await expect(pipe.attach(work)).resolves.toBe(undefined)

            expect(work).toHaveBeenCalled()
        })

        it.each(failedWorkFixture())('should report failure on the work %s', async (_, workFactory) => {
            const expectedError = new Error('My fun error')
            const pipe = new Pipe()
            const work = jest.fn(workFactory(expectedError))
            await expect(pipe.attach(previousWorkFunc)).resolves.toBe(undefined)

            await expect(pipe.attach(work)).rejects.toBe(expectedError)
        })
    })

    describe.each(failedWorkFixture())('when failed execute previous work %s', (_, previousWorkFunc) => {
        it.each(successWorkFixture())('should not execute work %s and fail', async (_, func) => {
            const expectedFailure = new Error('I am the expected failure')
            const pipe = new Pipe()
            const work = jest.fn(func)
            await expect(pipe.attach(previousWorkFunc(expectedFailure))).rejects.toBe(expectedFailure)

            await expect(pipe.attach(work)).rejects.toBe(expectedFailure)

            expect(work).not.toHaveBeenCalled()
        })

        it.each(failedWorkFixture())('should report failure on the work %s', async (_, workFactory) => {
            const expectedFailure = new Error('I am the expected failure')
            const notExpected = new Error('I am an error that should not happen')
            const pipe = new Pipe()
            const work = jest.fn(workFactory(notExpected))
            await expect(pipe.attach(previousWorkFunc(expectedFailure))).rejects.toBe(expectedFailure)

            await expect(pipe.attach(work)).rejects.toBe(expectedFailure)

            expect(work).not.toHaveBeenCalled()
        })

        describe('and previous worker consumer catch failure', () => {
            it.each(successWorkFixture())('should not execute work %s and fail', async (_, func) => {
                const expectedFailure = new Error('I am the expected failure')
                const pipe = new Pipe()
                const work = jest.fn(func)
                await expect(pipe.attach(previousWorkFunc(expectedFailure)).catch(() => {})).resolves.toBe(undefined)
    
                await expect(pipe.attach(work)).rejects.toBe(expectedFailure)
    
                expect(work).not.toHaveBeenCalled()
            })

            it.each(failedWorkFixture())('should report failure on the work %s', async (_, workFactory) => {
                const expectedFailure = new Error('I am the expected failure')
                const notExpected = new Error('I am an error that should not happen')
                const pipe = new Pipe()
                const work = jest.fn(workFactory(notExpected))
                await expect(pipe.attach(previousWorkFunc(expectedFailure)).catch(() => {})).resolves.toBe(undefined)
    
                await expect(pipe.attach(work)).rejects.toBe(expectedFailure)
    
                expect(work).not.toHaveBeenCalled()
            })
        })

        describe('but chain is recovery', () => {
            it.each(successWorkFixture())('should execute work %s', async (_, func) => {
                const failure = new Error('I am a failure, but dont bother')
                const pipe = new Pipe()
                const work = jest.fn(func)
                const failedWork = pipe.attach(previousWorkFunc(failure))

                pipe.recover()
                
                await expect(pipe.attach(work)).resolves.toBe(undefined)

                await expect(failedWork).rejects.toBe(failure)
                expect(work).toHaveBeenCalled()
            })

            it.each(failedWorkFixture())('should report failure on the work %s', async (_, workFactory) => {
                const failure = new Error('I am a failure, but dont bother')
                const expectedError = new Error('My fun error')
                const pipe = new Pipe()
                const work = jest.fn(workFactory(expectedError))
                const failedWork = pipe.attach(previousWorkFunc(failure))

                pipe.recover()
    
                await expect(pipe.attach(work)).rejects.toBe(expectedError)

                await expect(failedWork).rejects.toBe(failure)
            })
        })
    })

    function successWorkFixture (): [string, () => Promise<void> | void][] {
        return [
            ['async', async () => {}],
            ['sync', () => {}]
        ]
    }

    function failedWorkFixture (): [string, (error: Error) => () => Promise<void> | void][] {
        return [
            ['async', (error) => async () => { throw error }],
            ['sync', (error) => () => { throw error }]
        ]
    }
})