// Browser stand-in for node:async_hooks, used by packages/server/src/auth/context.ts.
// There is no async context propagation in a browser, so run() only holds the store for the
// synchronous part of fn. That is enough here: every tool handler reads the caller with
// requireHousehold() as its first, synchronous statement. A read after an await would get
// undefined and the tool would answer with the repo's "not linked" error, so a gap shows.
export class AsyncLocalStorage {
  #store;
  run(store, fn, ...args) {
    const prev = this.#store;
    this.#store = store;
    try {
      return fn(...args);
    } finally {
      this.#store = prev;
    }
  }
  getStore() {
    return this.#store;
  }
}
