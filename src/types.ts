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
import { Driver, Session, SessionConfig, Config, ServerInfo, types } from "neo4j-driver-core"

type Disposable = { [Symbol.asyncDispose] (): Promise<void> }
type VerifyConnectivity = { 
  verifyConnectivity(config: { database: string | undefined; } | undefined): Promise<ServerInfo>
}

type VerifyAuthentication = {
  verifyAuthentication(config: { auth?: types.AuthToken | undefined; database: string; }): Promise<boolean>
}

type HttpUrl = `http://${string}` | `https://${string}`
type WrapperSession = Pick<Session, 'run' | 'beginTransaction' | 'lastBookmarks' | 'close' > & Disposable 
type WrapperSessionConfig = Pick<SessionConfig, 'bookmarks' | 'impersonatedUser' | 'bookmarkManager' | 'defaultAccessMode' | 'auth'> & {
  database: string
}
type Wrapper = Pick<Driver, 'close' | 'supportsMultiDb'| 'supportsSessionAuth' | 'supportsUserImpersonation'> & Disposable & VerifyConnectivity & VerifyAuthentication & {
  session(config: WrapperSessionConfig): WrapperSession
} 

type WrapperConfig = Pick<Config, 'encrypted' | 'useBigInt' | 'disableLosslessIntegers' | 'maxConnectionPoolSize' | 'connectionAcquisitionTimeout'> & {
  httpSessionAffinityHeader?: string
}

export type {
  HttpUrl,
  WrapperSession,
  WrapperSessionConfig,
  Wrapper,
  WrapperConfig
}