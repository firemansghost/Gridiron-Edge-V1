/**
 * 2C-2J-6C-3 — Public 2026 season messaging + portfolio season URL.
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

  it('shows 2026 Season Live callout with Core V1 / Hybrid hold messaging', () => {
    expect(home).toContain('2026 Season Live');
    expect(home).toContain('Core V1 is currently');
    expect(home).toContain('Hybrid V2 remains held');
    expect(home).toContain('latest market data loaded for');
  });

  it('keeps a separate 2025 results link targeting season=2025', () => {
    expect(home).toContain('2025 Results');
    expect(home).toContain('href="/labs/portfolio?season=2025"');
    expect(home).toContain('View 2025 Results');
    expect(home).toContain('simulations/records, not guarantees');
  });
});

describe('portfolio what-ifs season URL wiring', () => {
  const page = fs.readFileSync(
    path.join(__dirname, '../app/labs/portfolio/page.tsx'),
    'utf8'
  );

  it('reads season from the URL and fetches season-specific API data', () => {
    expect(page).toContain('useSearchParams');
    expect(page).toContain('resolvePortfolioSeasonParam(searchParams.get(\'season\'))');
    expect(page).toContain('/api/labs/portfolio-whatifs?season=${season}');
    expect(page).toContain('DEFAULT_PORTFOLIO_SEASON');
  });

  it('keeps an editable Season input', () => {
    expect(page).toContain('type="number"');
    expect(page).toContain('setSeason(parseInt(e.target.value, 10))');
  });
});
