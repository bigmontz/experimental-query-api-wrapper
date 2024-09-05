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

import { ResultStreamObserver, ResultStreamObserverConfig } from "../../../src/http-connection/stream-observers"
import { Record, ResultObserver, internal, newError } from "neo4j-driver-core"

const NO_OP = () => { }
const SERVER_ADDRESS = internal.serverAddress.ServerAddress.fromUrl('address:7687')

describe('ResultStreamObserver', () => {

    describe('records', () => {
        it('should redirects to received records to the subscribers', () => {
            const streamObserver = subject()
            const receivedRecords: Record[] = []
            const resultObserver = observer({
                onNext: record => receivedRecords.push(record)
            })

            streamObserver.subscribe(resultObserver)

            streamObserver.onKeys(['A', 'B', 'C'])
            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            expect(receivedRecords.length).toEqual(3)
            expect(receivedRecords[0].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(receivedRecords[1].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(receivedRecords[2].toObject()).toEqual({ A: 111, B: 222, C: 333 })
        })

        it('should queues received record when no subscriber', () => {
            const streamObserver = subject()

            streamObserver.onKeys(['A', 'B', 'C'])

            streamObserver.onNext([1111, 2222, 3333])
            streamObserver.onNext([111, 222, 333])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([1, 2, 3])

            // @ts-expect-error
            const queuedRecords = streamObserver._queuedRecords

            expect(queuedRecords.length).toEqual(4)
            expect(queuedRecords[0].toObject()).toEqual({ A: 1111, B: 2222, C: 3333 })
            expect(queuedRecords[1].toObject()).toEqual({ A: 111, B: 222, C: 333 })
            expect(queuedRecords[2].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(queuedRecords[3].toObject()).toEqual({ A: 1, B: 2, C: 3 })
        })

        it('should pass queued records to a new subscriber', () => {
            const streamObserver = subject()
            const receivedRecords: Record[] = []
            const resultObserver = observer({
                onNext: record => receivedRecords.push(record)
            })

            streamObserver.onKeys(['A', 'B', 'C'])
            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.subscribe(resultObserver)

            expect(receivedRecords.length).toEqual(3)
            expect(receivedRecords[0].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(receivedRecords[1].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(receivedRecords[2].toObject()).toEqual({ A: 111, B: 222, C: 333 })
        })

        it('should clear buffered after redirects to the observer', () => {
            const streamObserver = subject()
            const receivedRecords: Record[] = []
            const receivedRecords2: Record[] = []
            const resultObserver = observer({
                onNext: record => receivedRecords.push(record)
            })
            const resultObserver2 = observer({
                onNext: record => receivedRecords2.push(record)
            })

            streamObserver.onKeys(['A', 'B', 'C'])
            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.subscribe(resultObserver)

            streamObserver.subscribe(resultObserver2)

            expect(receivedRecords.length).toBe(3)
            expect(receivedRecords2.length).toBe(0)
        })
    })

    describe('metadata', () => {
        it('passes existing metadata to a new subscriber', () => {
            const streamObserver = subject()

            streamObserver.onKeys(['Foo', 'Bar', 'Baz', 'Qux'])
            streamObserver.onCompleted({
                metaDataField1: 'value1',
                metaDataField2: 'value2'
            })

            let receivedMetaData = null
            streamObserver.subscribe(
                observer({
                    onCompleted: metaData => {
                        receivedMetaData = metaData
                    }
                })
            )

            expect(receivedMetaData).toEqual({
                metaDataField1: 'value1',
                metaDataField2: 'value2',
                stream_summary: {
                    have_records_streamed: false,
                    has_keys: true,
                    pulled: true
                },
                server: SERVER_ADDRESS
            })
        })

        it('should be able to handle a single response', done => {
            const streamObserver = subject()
            streamObserver.prepareToHandleSingleResponse()

            streamObserver.subscribe({
                onCompleted: (metadata: any) => {
                    expect(metadata.key).toEqual(42)
                    done()
                }
            })

            streamObserver.onCompleted({ key: 42 })
        })

        it('should mark as completed', done => {
            const streamObserver = subject()
            streamObserver.markCompleted()

            streamObserver.subscribe({
                onCompleted: metadata => {
                    expect(metadata).toEqual({})
                    done()
                }
            })
        })
    })

    describe('errors', () => {
        it('should passes received error the subscriber', () => {
            const streamObserver = subject()
            const error = new Error('Invalid Cypher query')

            let receivedError = null
            const resultObserver = observer({
                onError: error => {
                    receivedError = error
                }
            })

            streamObserver.subscribe(resultObserver)
            streamObserver.onError(error)

            expect(receivedError).toBe(error)
        })

        it('should passes existing error to a new subscriber', () => {
            const streamObserver = subject()
            const error = new Error('Invalid Cypher query')

            streamObserver.onError(error)

            streamObserver.subscribe(
                observer({
                    onError: receivedError => {
                        expect(receivedError).toBe(error)
                    }
                })
            )
        })

        it('invokes subscribed observer only once of error', () => {
            const errors: Error[] = []
            const streamObserver = subject()
            streamObserver.subscribe({
                onError: error => errors.push(error)
            })

            const error1 = new Error('Hello')
            const error2 = new Error('World')

            streamObserver.onError(error1)
            streamObserver.onError(error2)

            expect(errors).toEqual([error1])
        })

    })

    describe('full flow', () => {
        it('should inform all the pre-existing events of a success stream to the subscriber', () => {
            const streamObserver = subject()
            const { received, observer } = capturingObserver()

            streamObserver.onKeys(['A', 'B', 'C'])

            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.onCompleted({ key: 42, has_more: false })

            streamObserver.subscribe(observer)

            expect(received.onNext.length).toEqual(3)
            expect(received.onNext[0].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(received.onNext[1].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(received.onNext[2].toObject()).toEqual({ A: 111, B: 222, C: 333 })
            expect(received.onKeys).toEqual([['A', 'B', 'C']])
            expect(received.onCompleted).toEqual([{
                key: 42,
                has_more: false,
                server: SERVER_ADDRESS,
                stream_summary: {
                    has_keys: true,
                    have_records_streamed: true,
                    pulled: true
                }
            }])
            expect(received.onError).toEqual([])
        })

        it('should inform all the pre-existing events of a success stream to the subscriber in the correct order', () => {
            const streamObserver = subject()
            const { observer, received } = orderCapturingObserver()

            streamObserver.onKeys(['A', 'B', 'C'])

            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.onCompleted({ key: 42, has_more: false })

            streamObserver.subscribe(observer)

            expect(received.length).toEqual(5)
            expect(received[0]).toEqual(['A', 'B', 'C'])
            expect(received[1].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(received[2].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(received[3].toObject()).toEqual({ A: 111, B: 222, C: 333 })
            expect(received[4]).toEqual({
                key: 42,
                has_more: false,
                server: SERVER_ADDRESS,
                stream_summary: {
                    has_keys: true,
                    have_records_streamed: true,
                    pulled: true
                }
            })
        })

        it('should inform all the pre-existing events of an error stream to the subscriber', () => {
            const streamObserver = subject()
            const { received, observer } = capturingObserver()

            streamObserver.onKeys(['A', 'B', 'C'])

            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.onError(newError('something is on the way'))

            streamObserver.subscribe(observer)

            expect(received.onNext.length).toEqual(3)
            expect(received.onNext[0].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(received.onNext[1].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(received.onNext[2].toObject()).toEqual({ A: 111, B: 222, C: 333 })
            expect(received.onKeys).toEqual([['A', 'B', 'C']])
            expect(received.onCompleted).toEqual([])
            expect(received.onError).toEqual([newError('something is on the way')])
        })

        it('should inform all the pre-existing events of an error stream stream to the subscriber in the correct order', () => {
            const streamObserver = subject()
            const { observer, received } = orderCapturingObserver()

            streamObserver.onKeys(['A', 'B', 'C'])

            streamObserver.onNext([1, 2, 3])
            streamObserver.onNext([11, 22, 33])
            streamObserver.onNext([111, 222, 333])

            streamObserver.onError(newError('something is on the way'))

            streamObserver.subscribe(observer)

            expect(received.length).toEqual(5)
            expect(received[0]).toEqual(['A', 'B', 'C'])
            expect(received[1].toObject()).toEqual({ A: 1, B: 2, C: 3 })
            expect(received[2].toObject()).toEqual({ A: 11, B: 22, C: 33 })
            expect(received[3].toObject()).toEqual({ A: 111, B: 222, C: 333 })
            expect(received[4]).toEqual(newError('something is on the way'))
        })
    })

    describe('metadata.stream_summary', () => {
        it('should notify stream pulled, but without keys or record received', async () => {
            const streamObserver = subject()
            const { observer, received } = orderCapturingObserver()
            streamObserver.subscribe(observer)

            streamObserver.onKeys([])

            await new Promise((resolve, reject) => {
                setImmediate(() => {
                    try {
                        streamObserver.onCompleted({ key: 42, has_more: false })
                        resolve(undefined)
                    } catch (e) {
                        reject(e)
                    }
                })
            })

            expect(received[received.length - 1]).toEqual({
                key: 42,
                has_more: false,
                server: SERVER_ADDRESS,
                stream_summary: {
                    has_keys: false,
                    have_records_streamed: false,
                    pulled: true
                }
            })
        })

        it('should notify stream pulled and keys received, but no record received', async () => {
            const streamObserver = subject()
            const { observer, received } = orderCapturingObserver()
            streamObserver.subscribe(observer)

            streamObserver.subscribe(observer)

            streamObserver.onKeys(['A'])

            await new Promise((resolve, reject) => {
                setImmediate(() => {
                    try {
                        streamObserver.onCompleted({ key: 42, has_more: false })
                        resolve(null)
                    } catch (e) {
                        reject(e)
                    }
                })
            })

            expect(received[received.length - 1]).toEqual({
                key: 42,
                has_more: false,
                server: SERVER_ADDRESS,
                stream_summary: {
                    has_keys: true,
                    have_records_streamed: false,
                    pulled: true
                }
            })
        })

        it('should notify stream pulled, keys received and record received', async () => {
            const streamObserver = subject()
            const { observer, received } = orderCapturingObserver()

            streamObserver.subscribe(observer)

            streamObserver.onKeys(['A'])
            streamObserver.onNext([1])

            await new Promise((resolve, reject) => {
                setImmediate(() => {
                    try {
                        streamObserver.onCompleted({ key: 42, has_more: false })
                        resolve(undefined)
                    } catch (e) {
                        reject(e)
                    }
                })
            })

            expect(received[received.length - 1]).toEqual({
                key: 42,
                has_more: false,
                server: SERVER_ADDRESS,
                stream_summary: {
                    has_keys: true,
                    have_records_streamed: true,
                    pulled: true
                }
            })
        })
    })

    function subject(config: Partial<ResultStreamObserverConfig> = {}): ResultStreamObserver {
        return new ResultStreamObserver({
            lowRecordWatermark: 300,
            highRecordWatermark: 700,
            server: SERVER_ADDRESS,
            ...config
        })
    }

    function observer(resultObserver: Partial<ResultObserver>): ResultObserver {
        return {
            onNext: NO_OP,
            onError: NO_OP,
            onCompleted: NO_OP,
            ...resultObserver
        }
    }

    function capturingObserver(): {
        received: {
            onCompleted: any[],
            onError: Error[],
            onNext: Record[],
            onKeys: string[][]
        }, observer: ResultObserver
    } {
        const received = {
            onCompleted: [] as any[],
            onError: [] as Error[],
            onNext: [] as Record[],
            onKeys: [] as string[][]
        }
        const observer = {
            onCompleted: (metadata: any) => received.onCompleted.push(metadata),
            onError: (error: Error) => received.onError.push(error),
            onNext: (record: Record) => received.onNext.push(record),
            onKeys: (keys: string[]) => received.onKeys.push(keys)
        }

        return { received, observer }
    }
})

function orderCapturingObserver(): { received: any[], observer: ResultObserver } {
    const received: any[] = []
    const observer = {
        onCompleted: (metadata: unknown) => received.push(metadata),
        onError: (error: unknown) => received.push(error),
        onNext: (record: unknown) => received.push(record),
        onKeys: (keys: unknown) => received.push(keys)
    }
    return { observer, received }
}
