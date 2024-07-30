
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

import { Wrapper, WrapperSession, WrapperSessionConfig } from "../../src"

export function when (canRun: (() => boolean )| boolean, fn: jest.EmptyFunction ) {
    if (canRun === true || typeof canRun === 'function' && canRun()) {
        fn()
    } else {
        describe('skipped', () => {
            it('should skip', () => {
                expect(1).toBe(1)
            })
        })
    }
}


/**
   * Emulates a try-with-resource by using iterators
   * 
   * @example
   * for await (const session of withSession(wrapper, { database: 'neo4j })) {
   *    // work with my session
   * }
   * // session is closed
   * 
   * @param config The session config
   */
export async function* withSession (wrapper: Wrapper, config: WrapperSessionConfig): AsyncGenerator<WrapperSession> {
    const session = wrapper.session(config)
    try {
      yield session
    } finally {
      await session.close()
    }
  }