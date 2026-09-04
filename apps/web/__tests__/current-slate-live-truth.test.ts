/**
 * Phase 1C — Current Slate live/dynamic truth labeling.
 * Static source checks only (no provider / DB / workflow execution).
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');
const home = fs.readFileSync(path.join(webRoot, 'app/page.tsx'), 'utf8');
const slateTable = fs.readFileSync(path.join(webRoot, 'components/SlateTable.tsx'), 'utf8');
const picks = fs.readFileSync(path.join(webRoot, 'app/picks/page.tsx'), 'utf8');
const nav = fs.readFileSync(path.join(webRoot, 'components/HeaderNav.tsx'), 'utf8');

function gitDiffNames(paths: string[]): string[] {
  const result = spawnSync(
    'git',
    ['diff', '--name-only', 'origin/main', '--', ...paths],
    { encoding: 'utf8', cwd: repoRoot }
  );
  expect(result.status).toBe(0);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('Phase 1C Current Slate live/dynamic labeling', () => {
  it('keeps Current Slate identity and LIVE / DYNAMIC copy', () => {
    expect(home).toContain('Current Slate');
    expect(home).toContain('LIVE / DYNAMIC');
    expect(home).toContain(
      'This page recalculates recommendations from the current model and'
    );
    expect(home).toContain('available market snapshot. Picks and lines here may change.');
    expect(home).toContain('It is not');
    expect(home).toContain('the locked Official Card.');
  });

  it('links to Official Card and keeps live selector/hold wiring', () => {
    expect(home).toContain('href="/picks"');
    expect(home).toContain('View Locked Official Card');
    expect(home).not.toContain('Locked Official Card →');
    // In Phase 1C header area there should only be one homepage Official Card CTA.
    const picksLinks = home.match(/href=\"\/picks\"/g) || [];
    expect(picksLinks).toHaveLength(1);

    // Responsive Phase 1C header behavior (presentation-only):
    // outer header stacks on small screens and switches to a row at lg.
    expect(home).toContain('flex flex-col lg:flex-row');
    // heading and controls groups must be allowed to wrap.
    expect(home).toContain('flex flex-wrap items-center gap-4');
    expect(home).toContain('flex flex-wrap items-center gap-3');

    expect(home).toContain('ProductionModelSelector');
    expect(home).toContain('Model selector changes this live view only');
    expect(home).toContain('Hybrid V2 held');
    expect(home).toContain('resolveHeldProductionModelIds');
    expect(home).toContain('heldModelIds={heldModelIds}');
    expect(home).toContain('2026 Season Live');
    expect(home).toContain('Core V1 production spread');
  });

  it('does not imply Current Slate rows are locked official wagers', () => {
    expect(home).not.toContain('Official Picks');
    expect(home).not.toContain('our bets');
    expect(home).not.toContain('Closing Spread');
    expect(home).not.toContain('Closing Total');
    expect(home).not.toContain('Closing Line');
  });
});

describe('Phase 1C market snapshot labels (presentation only)', () => {
  it('uses Market snapshot wording instead of closing-line headers', () => {
    expect(slateTable).toContain('Current stored market snapshot');
    expect(slateTable).toContain('Model Pick');
    expect(slateTable).toContain('Not a locked Official Card wager');
    expect(slateTable).not.toContain('which team to bet');
    expect(slateTable).not.toContain('Closing Spread');
    expect(slateTable).not.toContain('Closing Total');
    expect(slateTable).not.toContain('Closing Line');
    expect(slateTable).not.toMatch(/>\s*Best\s*</);
  });

  it('does not rename internal market-selection fields', () => {
    expect(slateTable).toContain('closingSpread');
    expect(slateTable).toContain('closingTotal');
  });
});

describe('Phase 1C Official Card remains persisted truth', () => {
  it('keeps /picks as Official Card without live slate', () => {
    expect(nav).toContain('Official Card');
    expect(picks).toContain('Official Card');
    expect(picks).toContain('/api/official-card');
    expect(picks).not.toContain('/api/weeks/slate');
    expect(picks).not.toContain('ProductionModelSelector');
    expect(picks).not.toContain('useProductionModel');
  });

  it('does not change Official Card API/helper', () => {
    expect(
      gitDiffNames([
        'apps/web/lib/official-card.ts',
        'apps/web/app/api/official-card/route.ts',
      ])
    ).toEqual([]);
  });
});

describe('Phase 1C no formula / market-selection drift', () => {
  // Phase 1C itself prohibited workflow changes. Later phases add
  // separately reviewed guarded workflows; workflow safety is covered by
  // those workflow-specific static tests. Phase 1C formula and
  // market-selection protections remain.
  it('does not modify model or market-selection calculation files', () => {
    expect(
      gitDiffNames([
        'apps/web/lib/core-v2-spread.ts',
        'apps/web/lib/core-v1-spread.ts',
        'apps/web/lib/core-v1-weekly-card.ts',
        'apps/web/lib/grading',
        'apps/web/lib/market-line-helpers.ts',
        'apps/web/lib/pick-helpers.ts',
        'apps/web/app/api/weeks/slate/route.ts',
        'apps/jobs/src/odds',
        'apps/jobs/src/ratings',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });
});
