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

import Container, { NumberOrString } from "./ container"


export default class Neo4jContainer extends Container {
  constructor (
    private readonly user: string,
    private readonly password: string,
    private readonly version: string,
    private readonly edition: string | undefined,
    readonly disabled: boolean,
    private readonly containerLogs: boolean = false
  ) {
    super(disabled)
  }

  async onStartup (GenericContainer: any, DockerImageName: any, Wait: any): Promise<void> {
    const tag = this.edition != null ? `${this.version}-${this.edition}` : this.version

    let container = new GenericContainer(new DockerImageName(undefined, 'neo4j', tag).toString())
      .withEnv('NEO4J_AUTH', `${this.user}/${this.password}`)

    if (this.edition != null && this.edition.startsWith('enterprise')) {
      container = container.withEnv('NEO4J_ACCEPT_LICENSE_AGREEMENT', 'yes')
    }

    this.container = await container.withExposedPorts(7687, 7474)
      // Enabling Query API
      .withEnv('NEO4J_server_http__enabled__modules', 'TRANSACTIONAL_ENDPOINTS,UNMANAGED_EXTENSIONS,BROWSER,ENTERPRISE_MANAGEMENT_ENDPOINTS,QUERY_API_ENDPOINTS')
      .withWaitStrategy(Wait.forLogMessage(/Started/))
      .start()

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.log('Container started at ' + `${this.container.getHost()}:${this.container.getMappedPort(7687)}`)

    if (this.containerLogs) {
      const stream = await this.container.logs()
      stream
        .on('data', (line: string) => console.log(line))
        .on('err', (line: string) => console.error(line))
        .on('end', () => console.log('Stream closed'))
    }
  }

  getBoltPort (defaultPort: NumberOrString = 7687): NumberOrString {
    return this.getMappedPort(7687, defaultPort)
  }

  getHttpPort (defaultPort: NumberOrString = 7474): NumberOrString {
    return this.getMappedPort(7474, defaultPort)
  }
}
