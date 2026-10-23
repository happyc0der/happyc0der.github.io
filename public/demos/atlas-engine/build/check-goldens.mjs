// SPDX-License-Identifier: GPL-3.0-or-later
// Run the three golden scenarios from a built atlas.mjs under Node and compare them with the
// values the repositories record.   node check-goldens.mjs <dir containing atlas.mjs>
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '..');
const { default: createAtlas } = await import(pathToFileURL(path.join(dir, 'atlas.mjs')).href);
const A = await createAtlas();
const u64 = () => new BigUint64Array(A.HEAPU8.buffer, A._web_u64(), 32);
const text = () => new TextDecoder().decode(A.HEAPU8.subarray(A._web_text(), A._web_text() + A._web_text_len()));
const hex = (v) => '0x' + v.toString(16).toUpperCase().padStart(16, '0');

A._web_build_info();
console.log(text());
let failed = 0;
const row = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? 'match   ' : 'MISMATCH'} ${name.padEnd(28)} got ${hex(got)} want ${hex(want)}`);
};

if (A._golden_sim() !== 0) throw new Error(text());
let o = u64();
row('engine final_state', o[0], o[2]);
row('engine all_ticks', o[1], o[3]);

if (A._golden_lab() !== 0) throw new Error(text());
o = u64();
row('lab initial', o[0], o[3]);
row('lab final_state', o[1], o[4]);
row('lab all_ticks', o[2], o[5]);

if (A._golden_opera() !== 0) throw new Error(text());
o = u64();
row('opera initial', o[0], o[3]);
row('opera final_state', o[1], o[4]);
row('opera all_ticks', o[2], o[5]);
const [fen, want] = text().split('\n');
const fenOk = fen === want && o[6] === 1n && o[7] === 1n;
if (!fenOk) failed++;
console.log(`${fenOk ? 'match   ' : 'MISMATCH'} opera final FEN, white mates   ${fen}`);

process.exit(failed ? 1 : 0);
