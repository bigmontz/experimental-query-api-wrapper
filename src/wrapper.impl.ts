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
import { Driver, ServerInfo } from "neo4j-driver-core";
import { Wrapper, WrapperSession, WrapperSessionConfig } from "./types";
import WrapperSessionImpl from "./wrapper-session.impl";

export class WrapperImpl implements Wrapper {
    constructor(private readonly driver: Driver) {

    }

    close(): Promise<void> {
        return this.driver.close()
    }
    
    verifyConnectivity(config: { database: string }): Promise<ServerInfo> {
        validateDatabase(config)
        return this.driver.verifyConnectivity(config)
    }

    supportsMultiDb(): Promise<boolean> {
        return this.driver.supportsMultiDb()
    }
    
    [Symbol.asyncDispose](): Promise<void> {
        return this.driver.close()
    }

    session (config: WrapperSessionConfig): WrapperSession {
        validateDatabase(config);

        const session = this.driver.session(config)
        return new WrapperSessionImpl(session)
    }
}

function validateDatabase(config: { database: string }): void {
    if (config.database == null || config.database === '') {
        throw new TypeError(`database must be a non-empty string, but got ${config.database}`)
    }
}
