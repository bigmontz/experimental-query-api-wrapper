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

import { newError, Node, Relationship, int, error, types, Integer, Time, Date, LocalTime, Point, DateTime, LocalDateTime, Duration, isInt, isPoint, isDuration, isLocalTime, isTime, isDate, isLocalDateTime, isDateTime, isRelationship, isPath, isNode, isPathSegment, Path, PathSegment, internal, isUnboundRelationship } from "neo4j-driver-core"
import { RunQueryConfig } from "neo4j-driver-core/types/connection"

export type RawQueryValueTypes = 'Null' | 'Boolean' | 'Integer' | 'Float' | 'String' |
    'Time' | 'Date' | 'LocalTime' | 'ZonedDateTime' | 'OffsetDateTime' | 'LocalDateTime' |
    'Duration' | 'Point' | 'Base64' | 'Map' | 'List' | 'Node' | 'Relationship' |
    'Path'

export type NodeShape = { _element_id: string, _labels: string[], _properties?: Record<string, RawQueryValue> }
export type RelationshipShape = { _element_id: string, _start_node_element_id: string, _end_node_element_id: string, _type: string, _properties?: Record<string, RawQueryValue> }
export type PathShape = (RawQueryRelationship | RawQueryNode)[]
export type RawQueryValueDef<T extends RawQueryValueTypes, V extends unknown> = { $type: T, _value: V }

export type RawQueryNull = RawQueryValueDef<'Null', null>
export type RawQueryBoolean = RawQueryValueDef<'Boolean', boolean>
export type RawQueryInteger = RawQueryValueDef<'Integer', string>
export type RawQueryFloat = RawQueryValueDef<'Float', string>
export type RawQueryString = RawQueryValueDef<'String', string>
export type RawQueryTime = RawQueryValueDef<'Time', string>
export type RawQueryDate = RawQueryValueDef<'Date', string>
export type RawQueryLocalTime = RawQueryValueDef<'LocalTime', string>
export type RawQueryZonedDateTime = RawQueryValueDef<'ZonedDateTime', string>
export type RawQueryOffsetDateTime = RawQueryValueDef<'OffsetDateTime', string>
export type RawQueryLocalDateTime = RawQueryValueDef<'LocalDateTime', string>
export type RawQueryDuration = RawQueryValueDef<'Duration', string>
export type RawQueryPoint = RawQueryValueDef<'Point', string>
export type RawQueryBinary = RawQueryValueDef<'Base64', string>
export interface RawQueryMap extends RawQueryValueDef<'Map', Record<string, RawQueryValue>> { }
export interface RawQueryList extends RawQueryValueDef<'List', RawQueryValue[]> { }
export type RawQueryNode = RawQueryValueDef<'Node', NodeShape>
export type RawQueryRelationship = RawQueryValueDef<'Relationship', RelationshipShape>
export type RawQueryPath = RawQueryValueDef<'Path', PathShape>


export type RawQueryValue = RawQueryNull | RawQueryBoolean | RawQueryInteger | RawQueryFloat |
    RawQueryString | RawQueryTime | RawQueryDate | RawQueryLocalTime | RawQueryZonedDateTime |
    RawQueryOffsetDateTime | RawQueryLocalDateTime | RawQueryDuration | RawQueryPoint |
    RawQueryBinary | RawQueryMap | RawQueryList | RawQueryNode | RawQueryRelationship |
    RawQueryPath

export type Counters = {
    containsUpdates: boolean
    nodesCreated: number
    nodesDeleted: number
    propertiesSet: number
    relationshipsCreated: number
    relationshipsDeleted: number
    labelsAdded: number
    labelsRemoved: number
    indexesAdded: number
    indexesRemoved: number
    constraintsAdded: number
    constraintsRemoved: number
    containsSystemUpdates: boolean
    systemUpdates: number
}

export type ProfiledQueryPlan = {
    dbHits: number
    records: number
    hasPageCacheStats: boolean
    pageCacheHits: number
    pageCacheMisses: number
    pageCacheHitRatio: number
    time: number
    operatorType: string
    arguments: Record<string, RawQueryValue>
    identifiers: string[]
    children: ProfiledQueryPlan[]
}

export type NotificationShape = {
    code: string
    title: string
    description: string
    position: {
        offset: number
        line: number
        column: number
    } | {}
    severity: string
    category: string
}

export type RawQueryData = {
    fields: string[]
    values: RawQueryValue[][]
}

export type RawQuerySuccessResponse = {
    data: RawQueryData
    counters: Counters
    bookmarks: string[]
    profiledQueryPlan?: ProfiledQueryPlan
    notifications?: NotificationShape[]
    [str: string]: unknown
}

export type RawQueryError = {
    code: string,
    message: string
    error?: string
}


export type RawQueryFailuresResponse = {
    errors: RawQueryError[]
}

export type RawQueryResponse = RawQuerySuccessResponse | RawQueryFailuresResponse

const NEO4J_QUERY_CONTENT_TYPE = 'application/vnd.neo4j.query'

export class QueryResponseCodec {

    static of(
        config: types.InternalConfig,
        contentType: string,
        response: RawQueryResponse): QueryResponseCodec {

        if (isSuccess(response)) {
            if (contentType === NEO4J_QUERY_CONTENT_TYPE) {
                return new QuerySuccessResponseCodec(config, response)
            }
            return new QueryFailureResponseCodec(newError(
                `Wrong content-type. Expected "${NEO4J_QUERY_CONTENT_TYPE}", but got "${contentType}".`,
                error.PROTOCOL_ERROR
            ))
        }

        return new QueryFailureResponseCodec(response.errors?.length > 0 ?
            newError(
                response.errors[0].message,
                // TODO: REMOVE THE ?? AND .ERROR WHEN SERVER IS FIXED
                response.errors[0].code ?? response.errors[0].error
            ) :
            newError('Server replied an empty error response', error.PROTOCOL_ERROR))
    }

    get error(): Error | undefined {
        throw new Error('Not implemented')
    }

    get keys(): string[] {
        throw new Error('Not implemented')
    }

    get meta(): Record<string, unknown> {
        throw new Error('Not implemented')
    }

    *stream(): Generator<any[]> {
        throw new Error('Not implemented')
    }
}

class QuerySuccessResponseCodec extends QueryResponseCodec {

    constructor(
        private _config: types.InternalConfig,
        private readonly _response: RawQuerySuccessResponse) {
        super()
    }

    get error(): Error | undefined {
        return undefined
    }

    get keys(): string[] {
        return this._response.data.fields
    }

    *stream(): Generator<any[]> {
        while (this._response.data.values.length > 0) {
            const value =  this._response.data.values.shift()
            if (value != null) {
                yield value.map(this._decodeValue.bind(this))
            }
        } 
        return
    }

    get meta(): Record<string, unknown> {
        return {
            bookmark: this._response.bookmarks,
            stats: this._decodeStats(this._response.counters),
            profile: this._response.profiledQueryPlan != null ?
                this._decodeProfile(this._response.profiledQueryPlan) : null,
            notifications: this._response.notifications
        }
    }

    private _decodeStats(counters: Counters): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(counters)
                .map(([key, value]) => [key, typeof value === 'number' ? this._normalizeInteger(int(value)) : value])
        )
    }

    private _decodeProfile(queryPlan: ProfiledQueryPlan): Record<string, unknown> {
        return Object.fromEntries(
            Object.entries(queryPlan)
                .map(([key, value]) => {
                    let actualKey: string = key
                    let actualValue: unknown = value
                    switch (key) {
                        case 'children':
                            actualValue = (value as ProfiledQueryPlan[]).map(this._decodeProfile.bind(this))
                            break
                        case 'arguments':
                            actualKey = 'args'
                            actualValue = Object.fromEntries(Object.entries(value as {})
                                .map(([k, v]) => [k, this._decodeValue(v as RawQueryValue)]))
                            break
                        case 'records':
                            actualKey = 'rows'
                            break
                        default:
                            break
                    }
                    return [actualKey, actualValue]
                })
        )
    }


    private _decodeValue(value: RawQueryValue): unknown {
        switch (value.$type) {
            case "Null":
                return null
            case "Boolean":
                return value._value
            case "Integer":
                return this._decodeInteger(value._value as string)
            case "Float":
                return this._decodeFloat(value._value as string)
            case "String":
                return value._value
            case "Time":
                return this._decodeTime(value._value as string)
            case "Date":
                return this._decodeDate(value._value as string)
            case "LocalTime":
                return this._decodeLocalTime(value._value as string)
            case "ZonedDateTime":
                return this._decodeZonedDateTime(value._value as string)
            case "OffsetDateTime":
                return this._decodeOffsetDateTime(value._value as string)
            case "LocalDateTime":
                return this._decodeLocalDateTime(value._value as string)
            case "Duration":
                return this._decodeDuration(value._value as string)
            case "Point":
                return this._decodePoint(value._value as string)
            case "Base64":
                return this._decodeBase64(value._value as string)
            case "Map":
                return this._decodeMap(value._value as Record<string, RawQueryValue>)
            case "List":
                return this._decodeList(value._value as RawQueryValue[])
            case "Node":
                return this._decodeNode(value._value as NodeShape)
            case "Relationship":
                return this._decodeRelationship(value._value as RelationshipShape)
            case "Path":
                return this._decodePath(value._value as PathShape)
            default:
                // @ts-expect-error It should never happen
                throw newError(`Unknown type: ${value.$type}`, error.PROTOCOL_ERROR)
        }
    }

    _decodeInteger(value: string): Integer | number | bigint {
        if (this._config.useBigInt === true) {
            return BigInt(value)
        } else {
            const integer = int(value)
            if (this._config.disableLosslessIntegers === true) {
                return integer.toNumber()
            }
            return integer
        }
    }

    _decodeFloat(value: string): number {
        return parseFloat(value)
    }

    _decodeTime(value: string): Time<Integer | bigint | number> | LocalTime<Integer | bigint | number> {
        // 12:50:35.556+01:00
        const [hourStr, minuteString, secondNanosecondAndOffsetString, offsetMinuteString] = value.split(':')
        const [secondStr, nanosecondAndOffsetString] = secondNanosecondAndOffsetString.split('.')

        // @ts-expect-error
        const [nanosecondString, offsetHourString, isPositive]: [string, string, boolean] = nanosecondAndOffsetString.indexOf('+') >= 0 ?
            [...nanosecondAndOffsetString.split('+'), true] : (
                nanosecondAndOffsetString.indexOf('-') >= 0 ?
                    [...nanosecondAndOffsetString.split('-'), false] : (
                        nanosecondAndOffsetString.indexOf('Z') >= 0 ?
                            [nanosecondAndOffsetString.slice(0, nanosecondAndOffsetString.length - 1), undefined, true] :
                            [nanosecondAndOffsetString.slice(0, nanosecondAndOffsetString.length - 1), '0', true]
                    )

            )


        let nanosecond = int(nanosecondString.padEnd(9, '0'))

        if (offsetHourString != null) {
            const timeZoneOffsetInSeconds = int(offsetHourString).multiply(60).add(int(offsetMinuteString)).multiply(60).multiply(isPositive ? 1 : -1)

            return new Time(
                this._decodeInteger(hourStr),
                this._decodeInteger(minuteString),
                this._decodeInteger(secondStr),
                this._normalizeInteger(nanosecond),
                this._normalizeInteger(timeZoneOffsetInSeconds))
        }

        return new LocalTime(
            this._decodeInteger(hourStr),
            this._decodeInteger(minuteString),
            this._decodeInteger(secondStr),
            this._normalizeInteger(nanosecond),
        )


    }

    _decodeDate(value: string): Date<Integer | bigint | number> {
        // (+|-)2015-03-26
        // first might be signal or first digit on date
        const first = value[0]
        const [yearStr, monthStr, dayStr] = value.substring(1).split('-')
        return new Date(
            this._decodeInteger(first.concat(yearStr)),
            this._decodeInteger(monthStr),
            this._decodeInteger(dayStr)
        )
    }

    _decodeLocalTime(value: string): LocalTime<Integer | bigint | number> {
        // 12:50:35.556
        const [hourStr, minuteString, secondNanosecondAndOffsetString] = value.split(':')
        const [secondStr, nanosecondString] = secondNanosecondAndOffsetString.split('.')
        const nanosecond = int(nanosecondString.padEnd(9, '0'))

        return new LocalTime(
            this._decodeInteger(hourStr),
            this._decodeInteger(minuteString),
            this._decodeInteger(secondStr),
            this._normalizeInteger(nanosecond))
    }

    _decodeZonedDateTime(value: string): DateTime<Integer | bigint | number> {
        // 2015-11-21T21:40:32.142Z[Antarctica/Troll]
        const [dateTimeStr, timeZoneIdEndWithAngleBrackets] = value.split('[')
        const timeZoneId = timeZoneIdEndWithAngleBrackets.slice(0, timeZoneIdEndWithAngleBrackets.length - 1)
        const dateTime = this._decodeOffsetDateTime(dateTimeStr)

        return new DateTime(
            dateTime.year,
            dateTime.month,
            dateTime.day,
            dateTime.hour,
            dateTime.minute,
            dateTime.second,
            dateTime.nanosecond,
            isDateTime(dateTime) ? dateTime.timeZoneOffsetSeconds : undefined,
            timeZoneId
        )
    }

    _decodeOffsetDateTime(value: string): DateTime<Integer | bigint | number> | LocalDateTime<Integer | bigint | number>{
        // 2015-06-24T12:50:35.556+01:00
        const [dateStr, timeStr] = value.split('T')
        const date = this._decodeDate(dateStr)
        const time = this._decodeTime(timeStr)
        if (isTime(time)) {
            return new DateTime(
                date.year,
                date.month,
                date.day,
                time.hour,
                time.minute,
                time.second,
                time.nanosecond,
                time.timeZoneOffsetSeconds 
            )
        }

        return new LocalDateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
            time.second,
            time.nanosecond
        )
    }

    _decodeLocalDateTime(value: string): LocalDateTime<Integer | bigint | number> {
        // 2015-06-24T12:50:35.556
        const [dateStr, timeStr] = value.split('T')
        const date = this._decodeDate(dateStr)
        const time = this._decodeLocalTime(timeStr)
        return new LocalDateTime(
            date.year,
            date.month,
            date.day,
            time.hour,
            time.minute,
            time.second,
            time.nanosecond
        )
    }

    _decodeDuration(value: string): Duration<Integer | bigint | number> {
        // P14DT16H12M
        // Duration is PnW

        const durationStringWithP = value.slice(1, value.length)

        if (durationStringWithP.endsWith('W')) {
            const weeksString = durationStringWithP.slice(0, durationStringWithP.length - 1)
            const weeks = this._decodeInteger(weeksString)
            throw newError('Duration in weeks is not supported yet', error.PROTOCOL_ERROR)
        }

        let month = '0'
        let day = '0'
        let second = '0'
        let nanosecond = '0'
        let hour = '0'
        let currentNumber = ''
        let timePart = false

        for (const ch of durationStringWithP) {
            if (ch >= '0' && ch <= '9' || ch === '.' || ch === ',') {
                currentNumber = currentNumber + ch
            } else {
                switch (ch) {
                    case 'M':
                        if (timePart) {
                            throw newError(`Duration is not well formatted. Unexpected Duration component ${ch} in time part`, error.PROTOCOL_ERROR)
                        }
                        month = currentNumber
                        break;
                    case 'D':
                        if (timePart) {
                            throw newError(`Duration is not well formatted. Unexpected Duration component ${ch} in time part`, error.PROTOCOL_ERROR)
                        }
                        day = currentNumber
                        break
                    case 'S':
                        if (!timePart) {
                            throw newError(`Duration is not well formatted. Unexpected Duration component ${ch} in date part`, error.PROTOCOL_ERROR)
                        }
                        const nanosecondSeparator = currentNumber.includes(',') ? ',' : '.';
                        [second, nanosecond] = currentNumber.split(nanosecondSeparator)
                        break
                    case 'H':
                        if (!timePart) {
                            if (!timePart) {
                                throw newError(`Duration is not well formatted. Unexpected Duration component ${ch} in date part`, error.PROTOCOL_ERROR)
                            }
                        }
                        hour = currentNumber
                        break
                    case 'T':
                        timePart = true
                        break
                    default:
                        throw newError(`Duration is not well formatted. Unexpected Duration component ${ch}`, error.PROTOCOL_ERROR)
                }
                currentNumber = ''
            }
        }

        const secondsInt = int(hour).multiply(3600).add(second)
        const nanosecondString = nanosecond ?? '0'
        return new Duration(
            this._decodeInteger(month),
            this._decodeInteger(day),
            this._normalizeInteger(secondsInt),
            this._decodeInteger(nanosecondString.padEnd(9, '0'))
        )
    }

    _decodeMap(value: Record<string, RawQueryValue>): Record<string, unknown> {
        const result: Record<string, unknown> = {}
        for (const k of Object.keys(value)) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                result[k] = this._decodeValue(value[k])
            }
        }
        return result
    }

    _decodePoint(value: string): Point<Integer | bigint | number> {
        const createProtocolError = (): Point => internal.objectUtil.createBrokenObject(newError(
            `Wrong point format. RawValue: ${value}`,
            error.PROTOCOL_ERROR
        ), new Point<Integer | bigint | number>(0, 0, 0))


        const splittedOnSeparator = value.split(';')
        if (splittedOnSeparator.length !== 2 || !splittedOnSeparator[0].startsWith('SRID=') ||
            !(splittedOnSeparator[1].startsWith('POINT (') || splittedOnSeparator[1].startsWith('POINT Z ('))) {
            return createProtocolError()
        }

        const [_, sridString] = splittedOnSeparator[0].split('=')
        const srid = this._normalizeInteger(int(sridString))

        const [__, coordinatesString] = splittedOnSeparator[1].split('(')
        const [x, y, z] = coordinatesString.substring(0, coordinatesString.length - 1).split(" ").filter(c => c != null).map(parseFloat)

        return new Point(
            srid,
            x,
            y,
            z
        )
    }

    _decodeBase64(value: string): Uint8Array {
        const binaryString: string = atob(value)
        // @ts-expect-error See https://developer.mozilla.org/en-US/docs/Glossary/Base64
        return Uint8Array.from(binaryString, (b) => b.codePointAt(0))
    }

    _decodeList(value: RawQueryValue[]): unknown[] {
        return value.map(v => this._decodeValue(v))
    }

    _decodeNode(value: NodeShape): Node<bigint | number | Integer> {
        return new Node(
            // @ts-expect-error identity doesn't return
            undefined,
            value._labels,
            this._decodeMap(value._properties ?? {}),
            value._element_id
        )
    }

    _decodeRelationship(value: RelationshipShape): Relationship<bigint | number | Integer> {
        return new Relationship(
            // @ts-expect-error identity doesn't return
            undefined,
            undefined,
            undefined,
            value._type,
            this._decodeMap(value._properties ?? {}),
            value._element_id,
            value._start_node_element_id,
            value._end_node_element_id
        )
    }

    _decodePath(value: PathShape): Path<bigint | number | Integer> {
        const decoded = value.map(v => this._decodeValue(v))
        type SegmentAccumulator = [] | [Node] | [Node, Relationship]
        type Accumulator = { acc: SegmentAccumulator, segments: PathSegment[] }

        return new Path(
            decoded[0] as Node,
            decoded[decoded.length - 1] as Node,
            // @ts-expect-error
            decoded.reduce((previous: Accumulator, current: Node | Relationship): Accumulator => {
                if (previous.acc.length === 2) {
                    return {
                        acc: [current as Node], segments: [...previous.segments,
                        new PathSegment(previous.acc[0], previous.acc[1], current as Node)]
                    }
                }
                return { ...previous, acc: [...previous.acc, current] as SegmentAccumulator }
            }, { acc: [], segments: [] }).segments
        )
    }

    _normalizeInteger(integer: Integer): Integer | number | bigint {
        if (this._config.useBigInt === true) {
            return integer.toBigInt()
        } else if (this._config.disableLosslessIntegers === true) {
            return integer.toNumber()
        }
        return integer
    }
}

class QueryFailureResponseCodec extends QueryResponseCodec {
    constructor(private readonly _error: Error) {
        super()
    }

    get error(): Error | undefined {
        return this._error
    }

    get keys(): string[] {
        throw this._error
    }

    get meta(): Record<string, unknown> {
        throw this._error
    }

    stream(): Generator<any[], any, unknown> {
        throw this._error
    }
}

export type QueryRequestCodecConfig = Pick<RunQueryConfig, 'bookmarks' | 'txConfig' | 'mode' | 'impersonatedUser'>

export class QueryRequestCodec {
    private _body?: Record<string, unknown>

    static of(
        auth: types.AuthToken,
        query: string,
        parameters?: Record<string, unknown> | undefined,
        config?: QueryRequestCodecConfig | undefined
    ): QueryRequestCodec {
        return new QueryRequestCodec(auth, query, parameters, config)
    }

    private constructor(
        private _auth: types.AuthToken,
        private _query: string,
        private _parameters?: Record<string, unknown> | undefined,
        private _config?: QueryRequestCodecConfig | undefined
    ) {

    }



    get contentType(): string {
        return NEO4J_QUERY_CONTENT_TYPE
    }

    get accept(): string {
        return `${NEO4J_QUERY_CONTENT_TYPE}, application/json`
    }

    get authorization(): string {
        switch (this._auth.scheme) {
            case 'bearer':
                return `Bearer ${btoa(this._auth.credentials)}`
            case 'basic':
                return `Basic ${btoa(`${this._auth.principal}:${this._auth.credentials}`)}`
            default:
                throw new Error(`Authorization scheme "${this._auth.scheme}" is not supported.`)
        }
    }

    get body(): Record<string, unknown> {
        if (this._body != null) {
            return this._body
        }

        this._body = {
            statement: this._query,
            includeCounters: true
        }

        if (this._parameters != null && Object.getOwnPropertyNames(this._parameters).length !== 0) {
            this._body.parameters = this._encodeParameters(this._parameters!)
        }

        if (this._config?.bookmarks != null && !this._config.bookmarks.isEmpty()) {
            this._body.bookmarks = this._config?.bookmarks?.values()
        }

        if (this._config?.txConfig.timeout != null) {
            this._body.maxExecutionTime = this._config?.txConfig.timeout.toInt()
        }

        if (this._config?.impersonatedUser != null) {
            this._body.impersonatedUser = this._config?.impersonatedUser
        }

        if (this._config?.mode) {
            this._body.accessMode = this._config.mode.toUpperCase()
        }

        return this._body
    }

    _encodeParameters(parameters: Record<string, unknown>): Record<string, RawQueryValue> {
        const encodedParams: Record<string, RawQueryValue> = {}
        for (const k of Object.keys(parameters)) {
            if (Object.prototype.hasOwnProperty.call(parameters, k)) {
                encodedParams[k] = this._encodeValue(parameters[k])
            }
        }
        return encodedParams
    }

    _encodeValue(value: unknown): RawQueryValue {
        if (value === null) {
            return { $type: 'Null', _value: null }
        } else if (value === true || value === false) {
            return { $type: 'Boolean', _value: value }
        } else if (typeof value === 'number') {
            return { $type: 'Float', _value: value.toString() }
        } else if (typeof value === 'string') {
            return { $type: 'String', _value: value }
        } else if (typeof value === 'bigint') {
            return { $type: 'Integer', _value: value.toString() }
        } else if (isInt(value)) {
            return { $type: 'Integer', _value: value.toString() }
        } else if (value instanceof Uint8Array) {
            return { $type: 'Base64', _value: btoa(String.fromCharCode.apply(null, value)) }
        } else if (value instanceof Array) {
            return { $type: 'List', _value: value.map(this._encodeValue.bind(this)) }
        } else if (isIterable(value)) {
            return this._encodeValue(Array.from(value))
        } else if (isPoint(value)) {
            return {
                $type: 'Point', _value: value.z == null ?
                    `SRID=${int(value.srid).toString()};POINT (${value.x} ${value.y})` :
                    `SRID=${int(value.srid).toString()};POINT Z (${value.x} ${value.y} ${value.z})`
            }
        } else if (isDuration(value)) {
            return { $type: 'Duration', _value: value.toString() }
        } else if (isLocalTime(value)) {
            return { $type: 'LocalTime', _value: value.toString() }
        } else if (isTime(value)) {
            return { $type: 'Time', _value: value.toString() }
        } else if (isDate(value)) {
            return { $type: 'Date', _value: value.toString() }
        } else if (isLocalDateTime(value)) {
            return { $type: 'LocalDateTime', _value: value.toString() }
        } else if (isDateTime(value)) {
            if (value.timeZoneOffsetSeconds == null) {
                throw new Error(
                    'DateTime objects without "timeZoneOffsetSeconds" property ' +
                    'are prone to bugs related to ambiguous times. For instance, ' +
                    '2022-10-30T2:30:00[Europe/Berlin] could be GMT+1 or GMT+2.'
                )
            }
            
            if (value.timeZoneId != null) {
                return { $type: 'ZonedDateTime', _value: value.toString() }
            }
            return { $type: 'OffsetDateTime', _value: value.toString() }
        } else if (isRelationship(value) || isNode(value) || isPath(value) || isPathSegment(value) || isUnboundRelationship(value)) {
            throw newError('Graph types can not be ingested to the server', error.PROTOCOL_ERROR)
        } else if (typeof value === 'object') {
            return { $type: "Map", _value: this._encodeParameters(value as Record<string, unknown>) }
        } else {
            throw newError(`Unable to convert parameter to http request. Value: ${value}`, error.PROTOCOL_ERROR)
        }
    }
}

function isIterable<T extends unknown = unknown>(obj: unknown): obj is Iterable<T> {
    if (obj == null) {
        return false
    }
    // @ts-expect-error
    return typeof obj[Symbol.iterator] === 'function'
}

function isSuccess(obj: RawQueryResponse): obj is RawQuerySuccessResponse {
    if (obj.errors != null) {
        return false
    }
    return true
}
