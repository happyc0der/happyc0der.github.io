// Browser stand-in for node:module. packages/server/src/mcp/server.ts only uses
// createRequire(import.meta.url)('../../package.json') to read its version; the build
// script defines __CUSTODIAN_SERVER_VERSION__ from that same package.json.
export function createRequire() {
  return () => ({ version: __CUSTODIAN_SERVER_VERSION__ });
}
