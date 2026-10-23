// node:crypto for the browser demo: randomUUID from the Web Crypto API.
export const randomUUID = (): string => globalThis.crypto.randomUUID();
export default { randomUUID };
