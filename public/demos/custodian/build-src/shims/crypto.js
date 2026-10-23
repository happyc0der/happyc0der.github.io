// Browser stand-in for node:crypto. packages/shared/src/ids.ts only needs randomBytes().
export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
