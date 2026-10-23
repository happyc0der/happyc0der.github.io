// node:fs for the browser demo: there is no file system. Every call is recorded, so the demo's
// self-test can show that a mock cycle never reads a file (in particular, never the GTNH
// knowledge base that src/goals/knowledge.ts loads lazily). Written for this demo.
export const fsAttempts: string[] = [];

const refuse = (what: string, path: unknown): never => {
  fsAttempts.push(`${what} ${String(path)}`);
  throw new Error(`no file system in the browser demo (${what} ${String(path)})`);
};

export function existsSync(path: unknown): boolean {
  fsAttempts.push(`existsSync ${String(path)}`);
  return false;
}
export const readFileSync = (path: unknown): never => refuse('readFileSync', path);
export const writeFileSync = (path: unknown): never => refuse('writeFileSync', path);
export const mkdirSync = (path: unknown): never => refuse('mkdirSync', path);
export const rmSync = (path: unknown): never => refuse('rmSync', path);
export default { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync };
