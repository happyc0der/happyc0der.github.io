// Browser stand-in for node:fs/promises. FileStore(':memory:') never touches the disk,
// so these only throw if that assumption breaks.
const unavailable = (name) => () => {
  throw new Error(`node:fs/promises ${name} is not available in the browser demo`);
};
export const readFile = unavailable('readFile');
export const writeFile = unavailable('writeFile');
export const mkdir = unavailable('mkdir');
export const rename = unavailable('rename');
export const readdir = unavailable('readdir');
