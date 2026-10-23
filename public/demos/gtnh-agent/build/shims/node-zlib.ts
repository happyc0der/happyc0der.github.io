// node:zlib for the browser demo. Only the live client and the knowledge loader decompress
// anything; a mock cycle never does, so every call throws. Written for this demo.
const refuse = (what: string): never => {
  throw new Error(`${what} is not available in the browser demo`);
};
export const gunzipSync = (): never => refuse('gunzipSync');
export const gzipSync = (): never => refuse('gzipSync');
export const inflateSync = (): never => refuse('inflateSync');
export default { gunzipSync, gzipSync, inflateSync };
