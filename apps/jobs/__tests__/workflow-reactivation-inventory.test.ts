/**
 * Phase 2C-2J-6D-2 — static workflow reactivation inventory checks.
 * No providers, no DB, no network.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as os from 'os';

const ROOT = path.resolve(__dirname, '../../..');
const CLASSIFICATIONS = path.join(
  ROOT,
  'docs/data/2026-workflow-classifications.json'
);
const MATRIX = path.join(ROOT, 'docs/2026-workflow-reactivation-matrix.md');
const WF_DIR = path.join(ROOT, '.github/workflows');
const INVENTORY_SCRIPT = path.join(ROOT, 'scripts/inventory-workflows-2026.py');

const ALLOWED = new Set([
  'COMPLETED_LEAVE_OFF',
  'MANUAL_SAFE',
  'MANUAL_REVIEW_REQUIRED',
  'REPAIR_BEFORE_USE',
  'REPLACE',
  'FUTURE_AFTER_GAMES',
  'BLOCKED',
  'CI_ONLY',
]);

const EXPECTED_SCHEDULED = [
  'cfbd-rankings-sync.yml',
  'nightly-ingest.yml',
  'roster-churn-cfbd.yml',
  'sgo-team-stats.yml',
  'stats-season-cfbd.yml',
  'talent-commits-sync.yml',
  'v3-totals-nightly.yml',
].sort();

const ABSENT_WORKFLOWS = [
  'cfbd-scores-sync.yml',
  'grade-bets.yml',
  'one-time-week1-odds-core-preview-2026-08-29.yml',
  'ingest-2026-schedules.yml',
];

function runPythonSnippet(snippet: string): unknown {
  const tmp = path.join(
    os.tmpdir(),
    `wf-inv-snippet-${Date.now()}-${Math.random().toString(16).slice(2)}.py`
  );
  const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("inv", r"${INVENTORY_SCRIPT.replace(/\\/g, '\\\\')}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
${snippet}
`;
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    const result = spawnSync('python', [tmp], { encoding: 'utf8', cwd: ROOT });
    expect(result.status).toBe(0);
    expect(result.stderr || '').toBe('');
    return JSON.parse(result.stdout.trim() || 'null');
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

describe('2C-2J-6D-2 workflow reactivation inventory', () => {
  const raw = JSON.parse(fs.readFileSync(CLASSIFICATIONS, 'utf8'));
  const workflowFiles = fs
    .readdirSync(WF_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  it('inventories every workflow file exactly once (49)', () => {
    expect(raw.phase).toBe('2C-2J-6D-2');
    expect(raw.inventoryDate).toBe('2026-08-30');
    expect(raw.mainSha).toBe('2e8c167a15c9f5fc5dc4ea9683b18ae6258aecfc');
    expect(raw.workflows).toHaveLength(workflowFiles.length);
    expect(raw.workflows).toHaveLength(49);
    const classified = raw.workflows.map((w: { file: string }) => w.file).sort();
    expect(classified).toEqual(workflowFiles);
  });

  it('uses only allowed classifications; no schedule reactivation recommended', () => {
    const counts: Record<string, number> = {};
    for (const w of raw.workflows) {
      expect(ALLOWED.has(w.classification)).toBe(true);
      expect(w.scheduleReactivationRecommended).toBe(false);
      counts[w.classification] = (counts[w.classification] || 0) + 1;
    }
    expect(counts).toEqual({
      COMPLETED_LEAVE_OFF: 17,
      MANUAL_SAFE: 12,
      MANUAL_REVIEW_REQUIRED: 6,
      REPAIR_BEFORE_USE: 8,
      REPLACE: 4,
      BLOCKED: 1,
      CI_ONLY: 1,
    });
    expect(counts.FUTURE_AFTER_GAMES || 0).toBe(0);
  });

  it('marks high-risk legacy paths REPLACE or BLOCKED; canonical manuals MANUAL_SAFE', () => {
    const byFile = Object.fromEntries(
      raw.workflows.map((w: { file: string; classification: string }) => [
        w.file,
        w.classification,
      ])
    );
    expect(byFile['nightly-ingest.yml']).toBe('REPLACE');
    expect(byFile['ratings-v1.yml']).toBe('REPLACE');
    expect(byFile['ratings-v2.yml']).toBe('REPLACE');
    expect(byFile['sync-weekly-bets.yml']).toBe('REPLACE');
    expect(byFile['v3-totals-nightly.yml']).toBe('BLOCKED');
    expect(byFile['stats-cfbd.yml']).toBe('REPAIR_BEFORE_USE');
    expect(byFile['cfbd-feature-ingest.yml']).toBe('REPAIR_BEFORE_USE');
    expect(byFile['write-core-v1-lifecycle-ratings.yml']).toBe('MANUAL_SAFE');
    expect(byFile['write-core-v1-weekly-card-2026.yml']).toBe('MANUAL_SAFE');
    expect(byFile['write-live-odds-2026.yml']).toBe('MANUAL_SAFE');
    expect(byFile['cfbd-scores-2026-manual.yml']).toBe('MANUAL_SAFE');
    expect(byFile['grade-bets-2026-manual.yml']).toBe('MANUAL_SAFE');
    expect(byFile['cfbd-team-game-stats-2026-manual.yml']).toBe('MANUAL_SAFE');
    expect(byFile['write-cfbd-schedules-2026-manual.yml']).toBe('MANUAL_SAFE');
    expect(byFile['ingest-2026-schedules.yml']).toBeUndefined();
    expect(byFile['audit-2026-marketline-consumer-readiness.yml']).toBe(
      'MANUAL_SAFE'
    );
    expect(byFile['cfbd-scores-sync.yml']).toBeUndefined();
    expect(byFile['grade-bets.yml']).toBeUndefined();
  });

  it('static inventory script reports 49 workflows and 8 scheduled', () => {
    const result = spawnSync('python', [INVENTORY_SCRIPT], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(result.status).toBe(0);
    const inv = JSON.parse(result.stdout);
    expect(inv.count).toBe(49);
    expect(inv.scheduled_count).toBe(7);
    const scheduled = inv.workflows
      .filter((w: { has_active_schedule_yaml: boolean }) => w.has_active_schedule_yaml)
      .map((w: { file: string }) => w.file)
      .sort();
    expect(scheduled).toEqual(EXPECTED_SCHEDULED);
    for (const absent of ABSENT_WORKFLOWS) {
      expect(scheduled).not.toContain(absent);
      expect(workflowFiles).not.toContain(absent);
    }
    expect(scheduled).not.toContain('cfbd-scores-2026-manual.yml');
    expect(scheduled).not.toContain('grade-bets-2026-manual.yml');
    expect(scheduled).not.toContain('cfbd-team-game-stats-2026-manual.yml');
    expect(scheduled).not.toContain('stats-cfbd.yml');
    expect(scheduled).not.toContain('stats-advanced-cfbd.yml');

    const statsCfbd = inv.workflows.find(
      (w: { file: string }) => w.file === 'stats-cfbd.yml'
    );
    expect(statsCfbd.triggers).toEqual(['workflow_dispatch']);
    expect(statsCfbd.crons).toEqual([]);
    expect(statsCfbd.has_active_schedule_yaml).toBe(false);

    for (const file of [
      'cfbd-scores-2026-manual.yml',
      'grade-bets-2026-manual.yml',
      'cfbd-team-game-stats-2026-manual.yml',
      'write-cfbd-schedules-2026-manual.yml',
    ]) {
      const row = inv.workflows.find((w: { file: string }) => w.file === file);
      expect(row).toBeTruthy();
      expect(row.triggers).toEqual(['workflow_dispatch']);
      expect(row.crons).toEqual([]);
      expect(row.has_active_schedule_yaml).toBe(false);
    }
  });

  it('commented schedule/cron does not count as active schedule', () => {
    const sample = `
on:
  # schedule:
  #   - cron: '0 2 * * *'
  workflow_dispatch:
`;
    const out = runPythonSnippet(`
text = ${JSON.stringify(sample)}
triggers, crons = mod.extract_triggers(text)
print(json.dumps({"triggers": triggers, "crons": crons}))
`);
    expect(out).toEqual({ triggers: ['workflow_dispatch'], crons: [] });
  });

  it('direct_inputs_in_run distinguishes env-safe vs run-unsafe input interpolation', () => {
    const safe = `
jobs:
  x:
    steps:
      - name: ok
        env:
          INPUT_WEEK: \${{ inputs.week }}
        run: |
          echo "$INPUT_WEEK"
`;
    const unsafe = `
jobs:
  x:
    steps:
      - name: bad
        run: |
          echo "\${{ inputs.week }}"
`;
    const out = runPythonSnippet(`
safe = ${JSON.stringify(safe)}
unsafe = ${JSON.stringify(unsafe)}
print(json.dumps({
  "safe": mod.has_direct_inputs_in_run(safe),
  "unsafe": mod.has_direct_inputs_in_run(unsafe),
}))
`);
    expect(out).toEqual({ safe: false, unsafe: true });
  });

  it('hardened lifecycle workflow is not flagged for direct inputs in run', () => {
    const result = spawnSync('python', [INVENTORY_SCRIPT], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(result.status).toBe(0);
    const inv = JSON.parse(result.stdout);
    const lifecycle = inv.workflows.find(
      (w: { file: string }) => w.file === 'write-core-v1-lifecycle-ratings.yml'
    );
    expect(lifecycle).toBeTruthy();
    expect(lifecycle.direct_inputs_in_run).toBe(false);
  });

  it('matrix doc records 6D-2 posture, proven manuals, TeamGameStat path, and schedule hold', () => {
    const md = fs.readFileSync(MATRIX, 'utf8');
    expect(md).toContain('2C-2J-6D-2');
    expect(md).toContain('2026-08-30');
    expect(md).toContain('| Workflow files inventoried | **49** |');
    expect(md).toContain('| YAML files with active `schedule:` triggers | **8** |');
    expect(md).toContain('`scheduleReactivationRecommended=true` | **0**');
    expect(md).toContain('cfbd-scores-2026-manual.yml');
    expect(md).toContain('grade-bets-2026-manual.yml');
    expect(md).toContain('cfbd-team-game-stats-2026-manual.yml');
    expect(md).not.toMatch(/\| cfbd-scores-sync\.yml \|/);
    expect(md).not.toMatch(/\| grade-bets\.yml \|/);
    expect(md).not.toMatch(/\| ingest-2026-schedules\.yml \|/);
    expect(md).toContain('write-cfbd-schedules-2026-manual.yml');
    expect(md).toContain('recurring schedule');
    expect(md).toContain('NOT AUTHORIZED');
    expect(md).toContain('historical Actions run records');
    expect(md).toContain('Game finals → TeamGameStat ingest → Core V1 lifecycle');
    expect(md).toContain('Weeks 1–2');
    expect(md).toContain('After completed Week 3');
    expect(md).toContain(
      '| stats-cfbd.yml | Stats CFBD | dispatch | REPAIR_BEFORE_USE | N | N |'
    );
    expect(md).toContain(
      'stats-cfbd.yml` has a **commented-out** historical schedule only'
    );
  });

  it('Hybrid and Core formula sources unchanged', () => {
    const hybrid = fs.readFileSync(
      path.join(ROOT, 'apps/web/lib/core-v2-spread.ts'),
      'utf8'
    );
    expect(hybrid).toMatch(/V1_WEIGHT\s*=\s*0\.7/);
    expect(hybrid).toMatch(/V2_WEIGHT\s*=\s*0\.3/);
    expect(hybrid).toMatch(/V2_SCALE\s*=\s*9\.0/);
    expect(hybrid).toMatch(/HFA\s*=\s*2\.5/);
  });
});
