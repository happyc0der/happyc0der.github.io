// The slice of the better-sqlite3 API that gtnh-agent's repositories use, over sql.js
// (SQLite compiled to WebAssembly), so the repo's own migrations and SQL run unchanged in the
// browser. Written for this demo; not part of the gtnh-agent repo.
//
// Covered: new Database(path), exec, pragma, prepare(sql).run/get/all with positional or
// named (@name, :name, $name) parameters, transaction(fn) with savepoints when nested, close.
// Like better-sqlite3, binding anything but a number, string, bigint, Uint8Array or null throws.

/* eslint-disable @typescript-eslint/no-explicit-any */
type SqlJs = any;
type SqlJsDatabase = any;
type SqlJsStatement = any;

let sqlJs: SqlJs | null = null;

/** Hands the initialised sql.js module to the shim; call once before opening a database. */
export function useSqlJs(module: SqlJs): void {
  sqlJs = module;
}

type Params = unknown[];

function bindable(v: unknown): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  throw new TypeError(
    `SQLite3 can only bind numbers, strings, bigints, buffers, and null (got ${typeof v})`,
  );
}

function isNamed(args: Params): args is [Record<string, unknown>] {
  const a = args[0];
  return (
    args.length === 1 &&
    a !== null &&
    typeof a === 'object' &&
    !Array.isArray(a) &&
    !(a instanceof Uint8Array)
  );
}

/** better-sqlite3's arguments as sql.js bind values. */
function toBind(args: Params): unknown[] | Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (isNamed(args)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args[0])) {
      if (v === undefined) continue; // better-sqlite3 reports a missing parameter; so does SQLite below.
      const b = bindable(v);
      out[`@${k}`] = b;
      out[`:${k}`] = b;
      out[`$${k}`] = b;
    }
    return out;
  }
  return args.flat().map(bindable);
}

class Statement {
  readonly #db: Database;
  readonly #sql: string;
  constructor(db: Database, sql: string) {
    this.#db = db;
    this.#sql = sql;
  }

  run(...args: Params): { changes: number; lastInsertRowid: number } {
    const stmt = this.#db.statement(this.#sql);
    try {
      const b = toBind(args);
      if (b !== undefined) stmt.bind(b);
      while (stmt.step()) {
        /* drain */
      }
    } finally {
      stmt.reset();
    }
    return this.#db.lastChange();
  }

  get(...args: Params): Record<string, unknown> | undefined {
    const stmt = this.#db.statement(this.#sql);
    try {
      const b = toBind(args);
      if (b !== undefined) stmt.bind(b);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.reset();
    }
  }

  all(...args: Params): Array<Record<string, unknown>> {
    const stmt = this.#db.statement(this.#sql);
    const rows: Array<Record<string, unknown>> = [];
    try {
      const b = toBind(args);
      if (b !== undefined) stmt.bind(b);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.reset();
    }
    return rows;
  }
}

export default class Database {
  readonly #db: SqlJsDatabase;
  readonly #cache = new Map<string, SqlJsStatement>();
  #depth = 0;
  #savepoints = 0;
  open = true;

  constructor(path: string) {
    if (sqlJs === null) throw new Error('sql.js is not initialised (call useSqlJs first)');
    if (path !== ':memory:') throw new Error(`only in-memory databases in the browser (asked for ${path})`);
    this.#db = new sqlJs.Database();
  }

  /** A cached sql.js statement for `sql` (better-sqlite3 statements are reusable too). */
  statement(sql: string): SqlJsStatement {
    let s = this.#cache.get(sql);
    if (s === undefined) {
      s = this.#db.prepare(sql);
      this.#cache.set(sql, s);
    }
    return s;
  }

  lastChange(): { changes: number; lastInsertRowid: number } {
    const changes = this.#db.getRowsModified() as number;
    const s = this.statement('SELECT last_insert_rowid() AS id');
    try {
      s.step();
      return { changes, lastInsertRowid: Number(s.getAsObject().id) };
    } finally {
      s.reset();
    }
  }

  prepare(sql: string): Statement {
    // Prepare now so that SQL errors surface here, as with better-sqlite3.
    this.statement(sql);
    return new Statement(this, sql);
  }

  exec(sql: string): this {
    this.#db.exec(sql);
    return this;
  }

  pragma(source: string): unknown[] {
    const res = this.#db.exec(`PRAGMA ${source}`) as Array<{ columns: string[]; values: unknown[][] }>;
    return res.flatMap((r) =>
      r.values.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))),
    );
  }

  get inTransaction(): boolean {
    return this.#depth > 0;
  }

  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A): R => {
      if (this.#depth === 0) {
        this.#db.exec('BEGIN');
        this.#depth++;
        try {
          const r = fn(...args);
          this.#db.exec('COMMIT');
          return r;
        } catch (e) {
          this.#db.exec('ROLLBACK');
          throw e;
        } finally {
          this.#depth--;
        }
      }
      const name = `sp_${++this.#savepoints}`;
      this.#db.exec(`SAVEPOINT ${name}`);
      this.#depth++;
      try {
        const r = fn(...args);
        this.#db.exec(`RELEASE ${name}`);
        return r;
      } catch (e) {
        this.#db.exec(`ROLLBACK TO ${name}`);
        this.#db.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        this.#depth--;
      }
    };
  }

  close(): void {
    for (const s of this.#cache.values()) s.free();
    this.#cache.clear();
    this.#db.close();
    this.open = false;
  }
}
