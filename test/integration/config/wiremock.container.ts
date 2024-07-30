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

import Container, { NumberOrString } from "./ container";

export default class WireMockContainer extends Container {

    constructor(
        disabled: boolean,
        private readonly containerLogs: boolean
    ) {
        super(disabled)
    }

    protected async onStartup(GenericContainer: any, DockerImageName: any, Wait: any): Promise<void> {
        const container = new GenericContainer(new DockerImageName(undefined, 'wiremock/wiremock', '3x').toString())
        this.container = await container.withExposedPorts(8080)
            .start()

        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        console.log('Container started at ' + `${this.container.getHost()}:${this.container.getMappedPort(8080)}`)

        if (this.containerLogs) {
            const stream = await this.container.logs()
            stream
              .on('data', (line: string) => console.log(line))
              .on('err', (line: string) => console.error(line))
              .on('end', () => console.log('Stream closed'))
        }
    }

    getHttpPort (defaultPort: NumberOrString = 8080): NumberOrString {
        return this.getMappedPort(8080, defaultPort)
    }

    async loadStubFile(path: string): Promise<string | undefined> {
        if (this.container) {
            const object = this.loadFile(path)
            const request = await fetch(this.getAdminUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(object)
            })

            if (request.status >= 400) {
                throw new Error(request.statusText.concat(await request.text()))
            }

            const result = await request.json() as { uuid: string}
            return result.uuid
        }

        return undefined
    }

    private loadFile (path: string): unknown {
        const stubFile = require(path)
        const processed =  this.processVariables(stubFile)
        // @ts-expect-error
        if (processed?.response && processed?.response?.body && typeof processed?.response?.body !== 'string') {
            // @ts-expect-error
            processed.response.body = JSON.stringify(processed.response.body)
        }
        return processed
    }

    private processVariables (obj: unknown): unknown {
        if (typeof obj === 'string') {
            return obj.replace('{httpPort}', this.getHttpPort().toString())
        } else if (Array.isArray(obj)) {
            return obj.map(v => this.processVariables(v)) 
        } else if (obj != null && typeof obj === 'object') {
            return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, this.processVariables(value)]))
        }
        return obj
    }

    async deleteStub(stubId?: string): Promise<void> {
        if (this.container && stubId) {
            const request = await fetch(this.getAdminUrl().concat('/').concat(stubId), {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (request.status >= 400) {
                throw new Error(request.statusText.concat(await request.text()))
            }
        }

    }

    private getAdminUrl (): string {
        return `http://localhost:${this.getHttpPort().toString()}/__admin/mappings`

    }
}