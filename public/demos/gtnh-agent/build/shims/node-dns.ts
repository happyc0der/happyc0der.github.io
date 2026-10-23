// node:dns/promises for the browser demo: no lookups (nothing here contacts a host).
export function lookup(): Promise<never> {
  return Promise.reject(new Error('no DNS in the browser demo'));
}
export default { lookup };
