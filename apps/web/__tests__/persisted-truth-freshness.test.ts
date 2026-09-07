/**
 * Persisted operational-truth freshness contract.
 * Static checks only — no providers, DB, or production workflows.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PERSISTED_TRUTH_CACHE_CONTROL,
  persistedTruthFetchInit,
} from '@/lib/persisted-truth-freshness';

const webRoot = path.join(__dirname, '..');

function readRel(rel: string): string {
  return fs.readFileSync(path.join(webRoot, rel), 'utf8');
}

const ROUTES = [
  'app/api/official-card/route.ts',
  'app/api/weeks/archive/route.ts',
  'app/api/bets/summary/route.ts',
  'app/api/bets/season-summary/route.ts',
];

const PAGES = [
  'app/picks/page.tsx',
  'app/weeks/page.tsx',
  'app/weeks/review/page.tsx',
  'app/season-review/page.tsx',
];

describe('persisted-truth freshness helper', () => {
  it('exports an explicit no-store HTTP cache contract', () => {
    expect(PERSISTED_TRUTH_CACHE_CONTROL).toContain('no-store');
    expect(PERSISTED_TRUTH_CACHE_CONTROL).toContain('max-age=0');
    expect(persistedTruthFetchInit.cache).toBe('no-store');
  });

  it('subscribes to focus/visibility without mutating production', () => {
    const helper = readRel('lib/persisted-truth-freshness.ts');
    expect(helper).toContain("window.addEventListener('focus'");
    expect(helper).toContain("document.addEventListener('visibilitychange'");
    expect(helper).toContain('visibilityState === \'visible\'');
    expect(helper).not.toContain('prisma.');
    expect(helper).not.toContain('fetch(');
    expect(helper).not.toMatch(/prisma\.(bet|game)\.(create|update|upsert|delete)/);
  });
});

describe('persisted-truth API routes', () => {
  for (const rel of ROUTES) {
    it(`${rel} stays nodejs/force-dynamic and emits no-store headers`, () => {
      const src = readRel(rel);
      expect(src).toContain("export const runtime = 'nodejs'");
      expect(src).toContain("export const dynamic = 'force-dynamic'");
      expect(src).toContain('persistedTruthResponseHeaders');
      expect(src).toContain('headers: freshness');
      expect(src).toContain('export async function GET');
      expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
      expect(src).not.toContain('prisma.bet.create');
      expect(src).not.toContain('prisma.bet.update');
      expect(src).not.toContain('prisma.game.update');
    });
  }
});

describe('persisted-truth client pages', () => {
  for (const rel of PAGES) {
    it(`${rel} requests fresh data and wires focus/visibility refresh`, () => {
      const src = readRel(rel);
      expect(src).toContain('persistedTruthFetchInit');
      expect(src).toContain('subscribePersistedTruthRefresh');
      expect(src).toContain('Refresh');
      expect(src).not.toContain('/api/admin/grade');
      expect(src).not.toContain('/api/bets/seed');
      expect(src).not.toContain('prisma.bet.create');
      expect(src).not.toContain('prisma.bet.update');
    });
  }

  it('Official Card page keeps explicit no-store fetch to /api/official-card', () => {
    const src = readRel('app/picks/page.tsx');
    expect(src).toContain('/api/official-card');
    expect(src).toMatch(/fetch\([\s\S]*persistedTruthFetchInit/);
  });
});

describe('Current Slate / game-detail cache deferred in this PR', () => {
  it('does not alter expensive slate/game CDN cache policy here', () => {
    const slate = readRel('app/api/weeks/slate/route.ts');
    const game = readRel('app/api/game/[gameId]/route.ts');
    expect(slate).toContain("s-maxage=600");
    expect(game).toContain("s-maxage=600");
    expect(slate).not.toContain('persistedTruthResponseHeaders');
    expect(game).not.toContain('persistedTruthResponseHeaders');
  });
});
