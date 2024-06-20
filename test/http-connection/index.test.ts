import * as exported from "../../src/http-connection"
import { ConnectionProvider } from "neo4j-driver-core"

describe('export', () => {
    it('should export only HttpConnectionProvider, assignable to ConnectionProvider', () => {
        expect(exported).toEqual({
            HttpConnectionProvider: expect.any(Function)
        })

        const provider: exported.HttpConnectionProvider = null as unknown as exported.HttpConnectionProvider

        const assigned: ConnectionProvider = provider

        expect(assigned).toBe(null)
    })
})