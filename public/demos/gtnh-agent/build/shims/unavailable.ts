// Stand-in for Node-only packages the mock path never uses (mineflayer, dotenv).
const unavailable = (): never => {
  throw new Error('not available in the browser demo');
};
export const createBot = unavailable;
export const config = unavailable;
export default { createBot, config };
