/**
 * Phase 1A — public-site production write containment.
 * Static source checks only (no provider / DB / workflow execution).
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');
const reviewPage = path.join(webRoot, 'app/weeks/review/page.tsx');
const betsPage = path.join(webRoot, 'app/bets/page.tsx');
const gradeWeekRel = 'app/api/admin/grade-week/route.ts';
const gradeWeek = path.join(webRoot, gradeWeekRel);

const RETIRED_ROUTES = [
  'app/api/admin/grade/route.ts',
  'app/api/admin/sync-week/route.ts',
  'app/api/bets/seed/route.ts',
  'app/api/review/grade-week/route.ts',
  'app/api/bets/grade/route.ts',
  'app/api/bets/import/route.ts',
];

const RETIRED_WRITE_REFS = [
  '/api/bets/seed',
  '/api/admin/grade',
  '/api/admin/sync-week',
  '/api/review/grade-week',
  '/api/bets/grade',
  '/api/bets/import',
  'NEXT_PUBLIC_ENABLE_BETS_SEED',
  'NEXT_PUBLIC_ENABLE_GRADE_UI',
];

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

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      out.push(full);
    }
  }
  return out;
}

function toPosixRel(file: string): string {
  return path.relative(webRoot, file).split(path.sep).join('/');
}

function assertNoRetiredWriteRefs(src: string): void {
  for (const ref of RETIRED_WRITE_REFS) {
    expect(src).not.toContain(ref);
  }
}

describe('Phase 1A Week Review write containment', () => {
  const src = fs.readFileSync(reviewPage, 'utf8');

  it('keeps read-only Week Review controls', () => {
    expect(src).toContain('Week Review');
    expect(src).toContain('Refresh');
    expect(src).toContain('exportCSV');
    expect(src).toContain('/api/bets/summary');
    expect(src).toContain('/api/bets/export');
  });

  it('contains no Insert Demo Bets / Run Grading / Sync Results & Grade', () => {
    expect(src).not.toContain('Insert Demo Bets');
    expect(src).not.toContain('Run Grading');
    expect(src).not.toContain('Sync Results & Grade');
    expect(src).not.toContain('handleSeed');
    expect(src).not.toContain('handleGrade');
    expect(src).not.toContain('handleSyncAndGrade');
  });

  it('does not fetch retired mutation endpoints or public write flags', () => {
    assertNoRetiredWriteRefs(src);
  });
});

describe('Phase 1A Bets ledger write containment', () => {
  const src = fs.readFileSync(betsPage, 'utf8');

  it('keeps read-only ledger behavior', () => {
    expect(src).toContain('Bets Ledger');
    expect(src).toContain('exportCSV');
    expect(src).toContain('/api/bets/list');
    expect(src).toContain('/api/bets/export');
    expect(src).toContain('Show PnL Chart');
  });

  it('contains no demo-seed UI', () => {
    expect(src).not.toContain('Insert Demo Bets');
    expect(src).not.toContain('handleSeed');
    expect(src).not.toContain('add some demo bets');
  });

  it('does not fetch retired mutation endpoints or public write flags', () => {
    assertNoRetiredWriteRefs(src);
  });
});

describe('Phase 1A retired public mutation routes', () => {
  it('deletes the public mutation route files', () => {
    for (const rel of RETIRED_ROUTES) {
      expect(fs.existsSync(path.join(webRoot, rel))).toBe(false);
    }
  });

  it('retains ADMIN_SECRET authorization on grade-week', () => {
    expect(fs.existsSync(gradeWeek)).toBe(true);
    const src = fs.readFileSync(gradeWeek, 'utf8');
    expect(src).toMatch(/ADMIN_SECRET/);
    expect(src).toContain('x-admin-secret');
    expect(src).toMatch(/guarded GitHub Actions/);
    expect(src).toMatch(/canonical 2026 production write/i);
  });

  it('does not expose unauthenticated score/grading/Bet-create API routes', () => {
    const routes = listRouteFiles(path.join(webRoot, 'app/api'));
    const offenders: string[] = [];

    for (const file of routes) {
      const rel = toPosixRel(file);
      const src = fs.readFileSync(file, 'utf8');
      const hasGrade = src.includes('gradeAvailableBets');
      const hasSync = src.includes('syncGamesForWeek');
      const hasBetCreate = src.includes('prisma.bet.create');
      if (!hasGrade && !hasSync && !hasBetCreate) {
        continue;
      }

      const isAuthenticatedGradeWeek =
        rel === gradeWeekRel &&
        /ADMIN_SECRET/.test(src) &&
        src.includes('x-admin-secret');

      if (isAuthenticatedGradeWeek && !hasBetCreate) {
        continue;
      }

      offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});

describe('Phase 1A no workflow or formula drift', () => {
  it('does not modify guarded 2026 GitHub workflow files', () => {
    expect(gitDiffNames(['.github/workflows'])).toEqual([]);
  });

  it('does not modify Core/Hybrid/ratings/Odds/scores/grading calculation code', () => {
    expect(
      gitDiffNames([
        'apps/jobs/lib/grade-bets-2026.ts',
        'apps/jobs/src/ratings',
        'apps/web/lib/core-v2-spread.ts',
        'apps/web/lib/grading',
        'apps/jobs/src/odds',
        'apps/jobs/src/cfbd-game-results.ts',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });
});
