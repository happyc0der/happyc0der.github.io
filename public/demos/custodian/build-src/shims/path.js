// Browser stand-in for node:path (FileStore only calls path.dirname when persisting to disk).
const path = {
  dirname() {
    throw new Error('node:path is not available in the browser demo');
  },
  join() {
    throw new Error('node:path is not available in the browser demo');
  },
};
export default path;
