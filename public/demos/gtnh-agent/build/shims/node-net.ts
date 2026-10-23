// node:net for the browser demo: isIP for the config's address checks, and no sockets (the
// demo never connects to a server). Written for this demo.
const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIPv6(s: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return false;
  try {
    new URL(`http://[${s}]/`);
    return true;
  } catch {
    return false;
  }
}

export function isIP(input: string): 0 | 4 | 6 {
  if (V4.test(input)) return 4;
  if (isIPv6(input)) return 6;
  return 0;
}
export const isIPv4 = (s: string): boolean => isIP(s) === 4;
export function connect(): never {
  throw new Error('no network sockets in the browser demo');
}
export default { isIP, isIPv4, connect };
