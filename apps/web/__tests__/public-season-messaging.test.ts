/**
 * 2C-2J-6C-3 — Public 2026 season messaging + portfolio season URL.
 * Updated assertions for 2C-2J-6D-3 compact status strip (still truthful).
 * Source/static checks only (no provider / DB).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_PORTFOLIO_SEASON,
  resolvePortfolioSeasonParam,
} from '@/lib/labs/portfolio-season';

describe('resolvePortfolioSeasonParam', () => {
  it('accepts valid positive integer season query values', () => {
    expect(resolvePortfolioSeasonParam('2025')).toBe(2025);
    expect(resolvePortfolioSeasonParam('2026')).toBe(2026);
    expect(resolvePortfolioSeasonParam(' 2025 ')).toBe(2025);
  });

  it('falls back safely for missing or invalid values', () => {
    expect(resolvePortfolioSeasonParam(null)).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam(undefined)).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('')).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('abc')).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('0')).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('-1')).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('2025.5')).toBe(DEFAULT_PORTFOLIO_SEASON);
    expect(resolvePortfolioSeasonParam('2025abc')).toBe(DEFAULT_PORTFOLIO_SEASON);
  });

  it('honors an explicit fallback', () => {
    expect(resolvePortfolioSeasonParam(null, 2026)).toBe(2026);
    expect(resolvePortfolioSeasonParam('nope', 2024)).toBe(2024);
  });
});

describe('homepage 2026 season messaging', () => {
  const home = fs.readFileSync(
    path.join(__dirname, '../app/page.tsx'),
    'utf8'
  );

  it('removes stale 2025/offseason banner copy', () => {
    expect(home).not.toContain('Season Update (Dec 22, 2025)');
    expect(home).not.toContain('will be back for the 2026 season');
    expect(home).not.toContain('https://gridiron-edge-v1.vercel.app/labs/portfolio');
    expect(home).not.toContain('Offseason plan:');
  });

  it('shows compact 2026 Season Live strip with Core V1 / Hybrid hold messaging', () => {
    expect(home).toContain('2026 Season Live');
    expect(home).toContain('Core V1 production spread');
    expect(home).toContain('Hybrid V2 held');
  });

  it('keeps a separate 2025 results link targeting season=2025', () => {
    expect(home).toContain('2025 results');
    expect(home).toContain('href="/labs/portfolio?season=2025"');
    expect(home).toContain('Historical simulations/records, not future guarantees');
  });
});

describe('portfolio what-ifs season URL wiring', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '../app/labs/portfolio/page.tsx'),
    'utf8'
  );

  it('initializes season from the resolved query param on first render', () => {
    expect(page).toContain('useSearchParams');
    expect(page).toMatch(
      /useState<number>\(\(\)\s*=>[\s\S]*?resolvePortfolioSeasonParam\(searchParams\.get\('season'\)\)/
    );
    expect(page).not.toMatch(
      /useState<number>\(\s*DEFAULT_PORTFOLIO_SEASON\s*\)/
    );
  });

  it('syncs season on URL changes without redundant updates', () => {
    expect(page).toContain(
      "const nextSeason = resolvePortfolioSeasonParam(searchParams.get('season'));"
    );
    expect(page).toContain(
      'setSeason((current) => (current === nextSeason ? current : nextSeason))'
    );
    expect(page).toContain('/api/labs/portfolio-whatifs?season=${season}');
  });

  it('keeps an editable Season input', () => {
    expect(page).toContain('type="number"');
    expect(page).toContain('setSeason(parseInt(e.target.value, 10))');
  });
});
