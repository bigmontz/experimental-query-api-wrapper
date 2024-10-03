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
import {
  auth,
  BookmarkManager,
  bookmarkManager,
  BookmarkManagerConfig,
  authTokenManagers,
  AuthTokenManager,
  AuthTokenManagers,
  staticAuthTokenManager,
  AuthTokenAndExpiration,
  Connection,
  ConnectionProvider,
  Date,
  DateTime,
  Driver,
  Duration,
  error,
  inSafeRange,
  int,
  Integer,
  internal,
  isDate,
  isDateTime,
  isDuration,
  isInt,
  isLocalDateTime,
  isLocalTime,
  isNode,
  isPath,
  isPathSegment,
  isPoint,
  isRelationship,
  isRetriableError,
  isTime,
  isUnboundRelationship,
  LocalDateTime,
  LocalTime,
  Neo4jError,
  Node,
  Notification,
  notificationCategory,
  NotificationCategory,
  NotificationPosition,
  notificationSeverityLevel,
  NotificationSeverityLevel,
  Path,
  PathSegment,
  Plan,
  Point,
  ProfiledPlan,
  QueryConfig,
  QueryResult,
  QueryStatistics,
  Record,
  RecordShape,
  Relationship,
  Result,
  ResultObserver,
  ResultSummary,
  ResultTransformer,
  resultTransformers,
  ServerInfo,
  Session,
  SessionConfig,
  Time,
  toNumber,
  toString,
  types as coreTypes,
  UnboundRelationship,
  driver as coreDriver,
  Transaction,
  TransactionConfig,
  TransactionPromise,
  ManagedTransaction
} from 'neo4j-driver-core'

import { logging } from './logging'

import { HttpUrl, Wrapper, WrapperSession, WrapperConfig, WrapperSessionConfig } from './types'
import { WrapperImpl } from './wrapper.impl'
import { HttpConnectionProvider } from './http-connection'


const {
  util: { ENCRYPTION_ON, assertString },
  serverAddress: { ServerAddress },
  urlUtil,
} = internal

type AuthToken = coreTypes.AuthToken
type Config = coreTypes.Config
type InternalConfig = coreTypes.InternalConfig
type TrustStrategy = coreTypes.TrustStrategy
type EncryptionLevel = coreTypes.EncryptionLevel
type SessionMode = coreTypes.SessionMode
type Logger = internal.logger.Logger
type ConfiguredCustomResolver = internal.resolver.ConfiguredCustomResolver
const { READ, WRITE } = coreDriver

function isAuthTokenManager (value: unknown): value is AuthTokenManager {
  if (typeof value === 'object' &&
    value != null &&
    'getToken' in value &&
    'handleSecurityException' in value) {
    const manager = value as AuthTokenManager

    return typeof manager.getToken === 'function' &&
      typeof manager.handleSecurityException === 'function'
  }

  return false
}

function createAuthManager (authTokenOrProvider: AuthToken | AuthTokenManager): AuthTokenManager {
  if (isAuthTokenManager(authTokenOrProvider)) {
    return authTokenOrProvider
  }

  let authToken: AuthToken = authTokenOrProvider
  // Sanitize authority token. Nicer error from server when a scheme is set.
  authToken = authToken ?? {}
  authToken.scheme = authToken.scheme ?? 'none'
  return staticAuthTokenManager({ authToken })
}

function wrapper (
  url: HttpUrl | string,
  authToken: AuthToken | AuthTokenManager,
  config: Config = {}
): Wrapper {
  assertString(url, 'Http URL')
  const parsedUrl = urlUtil.parseDatabaseUrl(url)

  // enabling set boltAgent
  const _config = config as unknown as InternalConfig

  // Determine encryption/trust options from the URL.
  let routing = false
  let encrypted = false
  let trust: TrustStrategy | undefined
  let http = false
  switch (parsedUrl.scheme) {
    case 'http':
    case 'https':
      http = true
      break
    default:
      throw new Error(`Unknown scheme: ${parsedUrl.scheme ?? 'null'}`)
  }

  // Encryption enabled on URL, propagate trust to the config.
  if (encrypted) {
    // Check for configuration conflict between URL and config.
    if ('encrypted' in _config || 'trust' in _config) {
      throw new Error(
        'Encryption/trust can only be configured either through URL or config, not both'
      )
    }
    _config.encrypted = ENCRYPTION_ON
    _config.trust = trust
  }

  const authTokenManager = createAuthManager(authToken)


  const address = ServerAddress.fromUrl(parsedUrl.hostAndPort)

  const meta = {
    address,
    typename: 'HTTP',
    routing
  }

  const driver = new Driver(meta, _config, createConnectionProviderFunction())

  return new WrapperImpl(driver)

  function createConnectionProviderFunction (): (id: number, config: Config, log: Logger, hostNameResolver: ConfiguredCustomResolver) => ConnectionProvider {
      return (
        id: number,
        config: InternalConfig,
        log: Logger,
        hostNameResolver: ConfiguredCustomResolver
      ): ConnectionProvider => new HttpConnectionProvider({
        id,
        config,
        log,
        hostNameResolver,
        authTokenManager,
        scheme: parsedUrl.scheme as unknown as 'http' | 'https',
        address,
        userAgent: config.userAgent,
        boltAgent: config.boltAgent,
        routingContext: parsedUrl.query
      })
    
  }
}


/**
 * Object containing constructors for all neo4j types.
 */
const types = {
  Node,
  Relationship,
  UnboundRelationship,
  PathSegment,
  Path,
  Result,
  ResultSummary,
  Record,
  Point,
  Date,
  DateTime,
  Duration,
  LocalDateTime,
  LocalTime,
  Time,
  Integer
}

/**
 * Object containing string constants representing session access modes.
 */
const session = {
  READ,
  WRITE
}

/**
 * Object containing functions to work with {@link Integer} objects.
 */
const integer = {
  toNumber,
  toString,
  inSafeRange
}

/**
 * Object containing functions to work with spatial types, like {@link Point}.
 */
const spatial = {
  isPoint
}

/**
 * Object containing functions to work with temporal types, like {@link Time} or {@link Duration}.
 */
const temporal = {
  isDuration,
  isLocalTime,
  isTime,
  isDate,
  isLocalDateTime,
  isDateTime
}

/**
 * Object containing functions to work with graph types, like {@link Node} or {@link Relationship}.
 */
const graph = {
  isNode,
  isPath,
  isPathSegment,
  isRelationship,
  isUnboundRelationship
}

const forExport = {
  authTokenManagers,
  int,
  isInt,
  isPoint,
  isDuration,
  isLocalTime,
  isTime,
  isDate,
  isLocalDateTime,
  isDateTime,
  isNode,
  isPath,
  isPathSegment,
  isRelationship,
  isUnboundRelationship,
  integer,
  Neo4jError,
  isRetriableError,
  auth,
  logging,
  types,
  session,
  error,
  graph,
  spatial,
  temporal,
  Driver,
  Result,
  Record,
  ResultSummary,
  Transaction,
  TransactionPromise,
  ManagedTransaction,
  Node,
  Relationship,
  UnboundRelationship,
  PathSegment,
  Path,
  Integer,
  Plan,
  ProfiledPlan,
  QueryStatistics,
  Notification,
  ServerInfo,
  Session,
  Point,
  Duration,
  LocalTime,
  Time,
  Date,
  LocalDateTime,
  DateTime,
  ConnectionProvider,
  Connection,
  bookmarkManager,
  resultTransformers,
  notificationCategory,
  notificationSeverityLevel,
  wrapper
}

export {
  authTokenManagers,
  int,
  isInt,
  isPoint,
  isDuration,
  isLocalTime,
  isTime,
  isDate,
  isLocalDateTime,
  isDateTime,
  isNode,
  isPath,
  isPathSegment,
  isRelationship,
  isUnboundRelationship,
  integer,
  Neo4jError,
  isRetriableError,
  auth,
  logging,
  types,
  session,
  error,
  graph,
  spatial,
  temporal,
  Driver,
  Result,
  Record,
  ResultSummary,
  Node,
  Relationship,
  UnboundRelationship,
  PathSegment,
  Path,
  Integer,
  Plan,
  ProfiledPlan,
  QueryStatistics,
  Notification,
  ServerInfo,
  Session,
  Transaction,
  TransactionPromise,
  ManagedTransaction,
  Point,
  Duration,
  LocalTime,
  Time,
  Date,
  LocalDateTime,
  DateTime,
  ConnectionProvider,
  Connection,
  bookmarkManager,
  resultTransformers,
  notificationCategory,
  notificationSeverityLevel,
  wrapper
}

export type {
  QueryResult,
  AuthToken,
  AuthTokenManager,
  AuthTokenManagers,
  AuthTokenAndExpiration,
  Config,
  EncryptionLevel,
  TrustStrategy,
  SessionMode,
  ResultObserver,
  NotificationPosition,
  BookmarkManager,
  BookmarkManagerConfig,
  SessionConfig,
  QueryConfig,
  RecordShape,
  ResultTransformer,
  TransactionConfig,
  NotificationCategory,
  NotificationSeverityLevel,
  Logger,
  HttpUrl,
  Wrapper,
  WrapperConfig,
  WrapperSession,
  WrapperSessionConfig
}

export default forExport