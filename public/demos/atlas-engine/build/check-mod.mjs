// SPDX-License-Identifier: GPL-3.0-or-later
// Replay the native run recorded in atlas-engine docs/reports/M26.md through this demo's mod host
// stand-in, the way atlas-chess src/main.cpp run_local_headless() drives it:
//
//   atlas_chess --headless --mod chess_opponent.wasm --moves e2e4,d1h5,f1c4,h5f7
//   ply 8: e8f7 (the mod)
//   opponent: mod 'chess_opponent.wasm' plays black, 4 move(s) submitted, still running
//
//   node check-mod.mjs <dir containing atlas.mjs, modhost.js and chess_opponent.wasm>
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '..');
const { default: createAtlas } = await import(pathToFileURL(path.join(dir, 'atlas.mjs')).href);
const { ModHostStandIn } = await import(pathToFileURL(path.join(dir, 'modhost.js')).href);
const A = await createAtlas();
const u64 = () => new BigUint64Array(A.HEAPU8.buffer, A._web_u64(), 32);
const sq = (s) => (s.charCodeAt(0) - 97) + 8 * (s.charCodeAt(1) - 49);
const name = (i) => 'abcdefgh'[i & 7] + (1 + (i >> 3));

const script = ['e2e4', 'd1h5', 'f1c4', 'h5f7'];
const log = [];
if (A._chess_new(1, 0) !== 0) throw new Error('chess_new failed');
const host = new ModHostStandIn(A, new Uint8Array(readFileSync(path.join(dir, 'chess_opponent.wasm'))), (level, line) => log.push(line));
await host.start();

let plies = 0;
let submitted = 0;
const lines = [];
for (let ticks = 0; ticks < 200000; ticks++) {
  const board = new Uint8Array(A.HEAPU8.buffer, A._chess_board(), 75);
  if (board[71] !== 0) break;
  let person = null;
  if (board[64] === 0) {             // the mod plays black, so white's turn is the person's
    if (!script.length) break;
    person = script.shift();
  }
  const tick = A._chess_begin_tick();
  host.poll(tick);
  const n = A._chess_end_tick(person ? 1 : 0, person ? sq(person) : 0, person ? sq(person.slice(2)) : 0, 0);
  submitted += Number(u64()[2]);
  const moves = new Uint8Array(A.HEAPU8.buffer, A._chess_moves(), n * 4).slice();
  let personApplied = false;
  for (let i = 0; i < n; i++) {
    plies++;
    const byMod = moves[i * 4 + 3] === 1;
    personApplied ||= !byMod;
    lines.push(`ply ${plies}: ${name(moves[i * 4])}${name(moves[i * 4 + 1])}${byMod ? ' (the mod)' : ''}  [tick ${tick}]`);
  }
  if (person && !personApplied) { lines.push(`move ${person} was declined`); break; }
}
console.log(lines.join('\n'));
console.log(`opponent: plays black, ${submitted} move(s) submitted, ${host.disabled ? 'disabled' : 'still running'}`);
console.log(log.join('\n'));
const ok = lines[lines.length - 1].startsWith('ply 8: e8f7 (the mod)') && submitted === 4 && !host.disabled;
console.log(ok ? 'matches the M26 record: ply 8 e8f7 by the mod, 4 moves submitted' : 'DOES NOT match the M26 record');
process.exit(ok ? 0 : 1);
