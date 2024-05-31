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
import neo4j from '@neo4j-labs/experimental-query-api-wrapper'

const wrapper = neo4j.wrapper('http://localhost:7474', neo4j.auth.basic('neo4j', 'password'), {
    logging: neo4j.logging.console('debug'),
    useBigInt: true,
})

await wrapper.verifyConnectivity({ database: 'neo4j'})

const session = wrapper.session({ database: 'neo4j', defaultAccessMode: 'READ' })

try {
    const { records, summary } = await session.run('MATCH (people:Person)-[relatedTo]-(:Movie {title: "Cloud Atlas"}) RETURN people.name, Type(relatedTo), relatedTo')
    console.log('Summary', summary)

    for (const record of records) {
        console.log('Record', record)
    }

} finally {
    await session.close()
    await wrapper.close()
}
