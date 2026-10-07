// Reuse the unchanged OA-1 feature core; only the artifact row adapter is new.
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
// An explicit ESM data module avoids the jobs package's CommonJS setting.
// Strip types from the original bytes in memory; do not rewrite the core.
const source = await readFile(new URL('../src/research/oa-1-opponent-adjusted-efficiency.ts', import.meta.url), 'utf8');
const compiled = stripTypeScriptTypes(source);
const { computeOa1FeatureRows } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
let input='';
for await (const chunk of process.stdin) input+=chunk;
const rows=JSON.parse(input);
const result=computeOa1FeatureRows(rows);
if(result.badGameFrames || result.blockers.length) throw new Error('bad_game_frames');
process.stdout.write(JSON.stringify(result));
