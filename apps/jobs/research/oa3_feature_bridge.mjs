// Reuse the unchanged OA-1 feature core; only the artifact row adapter is new.
import { computeOa1FeatureRows } from '../src/research/oa-1-opponent-adjusted-efficiency.ts';
let input='';
for await (const chunk of process.stdin) input+=chunk;
const rows=JSON.parse(input);
const result=computeOa1FeatureRows(rows);
if(result.badGameFrames || result.blockers.length) throw new Error('bad_game_frames');
process.stdout.write(JSON.stringify(result));
