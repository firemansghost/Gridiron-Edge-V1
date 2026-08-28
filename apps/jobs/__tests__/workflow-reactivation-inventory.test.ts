/**
 * Phase 2C-2J-1 — static workflow reactivation inventory checks.
 * No providers, no DB, no network.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

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

describe('2C-2J-1 workflow reactivation inventory', () => {
  const raw = JSON.parse(fs.readFileSync(CLASSIFICATIONS, 'utf8'));
  const workflowFiles = fs
    .readdirSync(WF_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  it('inventories every workflow file exactly once', () => {
    expect(raw.workflows).toHaveLength(workflowFiles.length);
    expect(raw.workflows).toHaveLength(45);
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
      COMPLETED_LEAVE_OFF: 18,
      MANUAL_SAFE: 5,
      MANUAL_REVIEW_REQUIRED: 6,
      REPAIR_BEFORE_USE: 9,
      REPLACE: 4,
      FUTURE_AFTER_GAMES: 1,
      BLOCKED: 1,
      CI_ONLY: 1,
    });
  });

  it('marks high-risk legacy paths REPLACE or BLOCKED', () => {
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
    expect(byFile['cfbd-scores-sync.yml']).toBe('REPAIR_BEFORE_USE');
    expect(byFile['write-core-v1-lifecycle-ratings.yml']).toBe('MANUAL_SAFE');
  });

  it('static inventory script reports 45 workflows and 11 scheduled', () => {
    const result = spawnSync('python', [INVENTORY_SCRIPT], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(result.status).toBe(0);
    const inv = JSON.parse(result.stdout);
    expect(inv.count).toBe(45);
    expect(inv.scheduled_count).toBe(11);
    const scheduled = inv.workflows
      .filter((w: { has_active_schedule_yaml: boolean }) => w.has_active_schedule_yaml)
      .map((w: { file: string }) => w.file)
      .sort();
    expect(scheduled).toEqual(
      [
        'cfbd-rankings-sync.yml',
        'cfbd-scores-sync.yml',
        'grade-bets.yml',
        'nightly-ingest.yml',
        'roster-churn-cfbd.yml',
        'sgo-team-stats.yml',
        'stats-advanced-cfbd.yml',
        'stats-cfbd.yml',
        'stats-season-cfbd.yml',
        'talent-commits-sync.yml',
        'v3-totals-nightly.yml',
      ].sort()
    );
  });

  it('matrix doc records phase posture and Odds not authorized', () => {
    const md = fs.readFileSync(MATRIX, 'utf8');
    expect(md).toContain('2C-2J-1');
    expect(md).toContain('NOT AUTHORIZED');
    expect(md).toContain('ingest-minimal');
    expect(md).toContain('WRITE_2026_WEEK_');
    expect(md).toContain('Core-only guarded weekly-card writer');
    expect(md).toContain('`scheduleReactivationRecommended=true` | **0**');
    expect(md).toContain('This phase does NOT:');
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
