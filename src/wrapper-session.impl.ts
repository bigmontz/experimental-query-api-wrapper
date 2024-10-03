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
import { RecordShape, TransactionConfig, Result, Session, TransactionPromise } from "neo4j-driver-core";
import { Query } from "neo4j-driver-core/types/types";
import { WrapperSession } from "./types";


export default class WrapperSessionImpl implements WrapperSession {
    constructor(private readonly session: Session) {
        
    }

    [Symbol.asyncDispose](): Promise<void> {
        return this.close()
    }

    run<R extends RecordShape = RecordShape>(query: Query, parameters?: any, transactionConfig?: TransactionConfig | undefined): Result<R> {
        return this.session.run(query, parameters, transactionConfig)
    }

    beginTransaction(transactionConfig?: TransactionConfig | undefined): TransactionPromise {
        return this.session.beginTransaction(transactionConfig)
    }
    
    lastBookmarks(): string[] {
        return this.session.lastBookmarks()
    }

    close(): Promise<void> {
        return this.session.close()
    }
    
}