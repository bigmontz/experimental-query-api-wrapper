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

import * as exported from "../../../src/http-connection"
import { ConnectionProvider } from "neo4j-driver-core"

describe('export', () => {
    it('should export only HttpConnectionProvider, assignable to ConnectionProvider', () => {
        expect(exported).toEqual({
            HttpConnectionProvider: expect.any(Function)
        })

        const provider: exported.HttpConnectionProvider = null as unknown as exported.HttpConnectionProvider

        const assigned: ConnectionProvider = provider

        expect(assigned).toBe(null)
    })
})