// node:util for the browser demo: parseArgs belongs to the CLI, which the demo does not run.
export function parseArgs(): never {
  throw new Error('the CLI does not run in the browser demo');
}
export default { parseArgs };
