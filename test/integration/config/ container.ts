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

export type NumberOrString = number | string

export default class Container {

  protected usages: number = 0
  protected container: any | undefined = undefined

  constructor(
    protected readonly disabled: boolean
  ) {

  }

  protected async onStartup(GenericContainer: any, DockerImageName: any, Wait: any): Promise<void> {

  }

  async start (): Promise<void> {
    if (this.disabled) {
      return
    }
    this.usages++
    console.log('Starting container')
    if (this.container != null) {
      console.log('Container already started')
      return
    }

    // Browser does not support testcontainers
    // @ts-expect-error
    const path = global.window != null ? './browser/testcontainer.wrapper' : './node/testcontainer.wrapper'
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GenericContainer, DockerImageName, Wait } = require(path)
    
    await this.onStartup(GenericContainer, DockerImageName, Wait)
  }

  getMappedPort (port: number, defaultPort: NumberOrString): NumberOrString {
    return this.container != null ? this.container.getMappedPort(port) : defaultPort
  }

  async stop (): Promise<void> {
    this.usages--
    if (this.usages <= 0) {
      this.usages = 0
      await this.container?.stop()
      this.container = undefined
    }
  }
}

