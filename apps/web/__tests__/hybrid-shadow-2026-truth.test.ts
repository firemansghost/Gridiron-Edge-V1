/**
 * Phase 4A — Models / Hybrid V2 shadow product truth.
 * Pure helpers + static source/scope guards. No provider / DB / workflow execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  HYBRID_V2_PRODUCTION_HOLD_REASON,
  isHybridV2ProductionAuthorized,
} from '@/lib/config/hybrid-production-activation';
import { calculateHybridSpread, calculateV1Spread } from '@/lib/core-v2-spread';
import { computeEffectiveHfa } from '@/lib/core-v1-spread';
import {
  CORE_V1_EFFECTIVE_PRODUCTION_LABEL,
  HYBRID_LIVE_MUTABLE_SHADOW,
  HYBRID_NOT_OFFICIAL_2026_BET,
  HYBRID_SHADOW_STATUS_LABEL,
  HYBRID_UNAVAILABLE_RATING,
  HYBRID_UNAVAILABLE_UNIT_GRADES,
  SUPER_TIER_A_FROZEN_QUALIFICATION,
  SUPER_TIER_A_SHADOW_STATUS,
  V4_FADE_HISTORICAL_STATUS,
  buildHybridShadowCoverage,
  buildHybridShadowGame,
  buildHybridShadowStatus,
  canonicalMarketSpreadHma,
  canonicalizeLabsMarketSpread,
  classifyHybridShadowCoverage,
  computeProductionCoreV1HmaFromV1Ratings,
  hybridShadowEmptyMessage,
  hybridUnavailableReasons,
  isFiniteRating,
  toSpreadInfo,
  type HybridShadowGameInput,
  type HybridShadowUnitGrades,
} from '@/lib/labs/hybrid-shadow-truth';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');

const ZERO_GRADES: HybridShadowUnitGrades = {
  offRunGrade: 0,
  defRunGrade: 0,
  offPassGrade: 0,
  defPassGrade: 0,
  offExplosiveness: 0,
  defExplosiveness: 0,
};

function baseGame(
  overrides: Partial<HybridShadowGameInput> = {}
): HybridShadowGameInput {
  return {
    gameId: 'g-1',
    date: '2026-08-29T16:00:00.000Z',
    status: 'scheduled',
    awayTeamId: 'away',
    awayTeamName: 'Away',
    homeTeamId: 'home',
    homeTeamName: 'Home',
    awayScore: null,
    homeScore: null,
    neutralSite: false,
    homeRating: 5,
    awayRating: 1,
    homeGrades: ZERO_GRADES,
    awayGrades: ZERO_GRADES,
    market: {
      value: -3.5,
      teamId: 'home',
      book: 'FanDuel',
      timestamp: '2026-08-28T12:00:00.000Z',
      source: 'odds_api',
    },
    ...overrides,
  };
}

describe('Phase 4A Hybrid shadow status', () => {
  it('2026 Hybrid status is SHADOW / HELD and Core V1 remains effective production', () => {
    expect(isHybridV2ProductionAuthorized(2026)).toBe(false);
    const status = buildHybridShadowStatus(2026);
    expect(status.hybridProductionAuthorized).toBe(false);
    expect(status.effectiveProductionModel).toBe('core_v1');
    expect(status.holdReason).toBe(HYBRID_V2_PRODUCTION_HOLD_REASON);
    expect(status.statusLabel).toBe(HYBRID_SHADOW_STATUS_LABEL);
    expect(status.liveMutable).toBe(true);
    expect(status.official).toBe(false);
    expect(status.notOfficialBetLabel).toBe(HYBRID_NOT_OFFICIAL_2026_BET);
    expect(CORE_V1_EFFECTIVE_PRODUCTION_LABEL).toBe('Core V1');
    expect(HYBRID_LIVE_MUTABLE_SHADOW).toBe('LIVE / MUTABLE SHADOW');
  });
});

describe('Phase 4A Hybrid shadow Game frame', () => {
  it('treats numerical rating 0 as a valid rating, not missing', () => {
    expect(isFiniteRating(0)).toBe(true);
    expect(isFiniteRating(null)).toBe(false);
    expect(isFiniteRating(undefined)).toBe(false);
    expect(isFiniteRating(Number.NaN)).toBe(false);
    expect(
      hybridUnavailableReasons({
        homeRating: 0,
        awayRating: 0,
        homeGrades: ZERO_GRADES,
        awayGrades: ZERO_GRADES,
      })
    ).toEqual([]);

    const row = buildHybridShadowGame(
      baseGame({ homeRating: 0, awayRating: 0 })
    );
    expect(row.hybridAvailable).toBe(true);
    expect(row.v1Spread).not.toBeNull();
    expect(row.hybridSpread).not.toBeNull();
    expect(row.unavailableReasons).toEqual([]);
  });

  it('retains a real Game row when Hybrid ratings or grades are missing', () => {
    const missingBoth = buildHybridShadowGame(
      baseGame({
        homeRating: null,
        awayRating: null,
        homeGrades: null,
        awayGrades: null,
      })
    );
    expect(missingBoth.gameId).toBe('g-1');
    expect(missingBoth.awayTeamName).toBe('Away');
    expect(missingBoth.homeTeamName).toBe('Home');
    expect(missingBoth.hybridAvailable).toBe(false);
  });

  it('produces explicit Hybrid unavailable state when TeamUnitGrades are missing', () => {
    const row = buildHybridShadowGame(
      baseGame({ homeGrades: null, awayGrades: null })
    );
    expect(row.hybridAvailable).toBe(false);
    expect(row.unavailableReasons).toContain('missing_unit_grades');
    expect(row.unavailableLabel).toBe(HYBRID_UNAVAILABLE_UNIT_GRADES);
    expect(row.hybridSpread).toBeNull();
    expect(row.v2Spread).toBeNull();
    expect(row.v1Spread).not.toBeNull();
    expect(row.missingUnitGradeTeamIds).toEqual(['away', 'home']);
  });

  it('produces explicit Hybrid unavailable state when a rating is missing', () => {
    const row = buildHybridShadowGame(
      baseGame({ homeRating: null, awayRating: 4 })
    );
    expect(row.hybridAvailable).toBe(false);
    expect(row.unavailableReasons).toContain('missing_rating');
    expect(row.unavailableLabel).toBe(HYBRID_UNAVAILABLE_RATING);
    expect(row.hybridSpread).toBeNull();
    expect(row.v2Spread).toBeNull();
    expect(row.v1Spread).toBeNull();
    expect(row.missingRatingTeamIds).toEqual(['home']);
  });

  it('never labels a Core V1 value as Hybrid when Hybrid inputs are missing', () => {
    const row = buildHybridShadowGame(
      baseGame({ homeGrades: null, awayGrades: null })
    );
    expect(row.v1Spread).not.toBeNull();
    expect(row.hybridSpread).toBeNull();
    expect(row.v2Spread).toBeNull();
    expect(row.diff).toBeNull();
  });

  it('carries market provenance when a market line is shown', () => {
    const row = buildHybridShadowGame(baseGame());
    expect(row.marketSpread?.value).toBe(-3.5);
    expect(row.marketSpread?.teamId).toBe('home');
    expect(row.marketSpread?.spreadHma).toBe(3.5);
    expect(row.marketSpread?.favoriteTeamId).toBe('home');
    expect(row.marketSpread?.book).toBe('FanDuel');
    expect(row.marketSpread?.timestamp).toBe('2026-08-28T12:00:00.000Z');
    expect(row.marketSpread?.source).toBe('odds_api');
  });

  it('represents partial Hybrid coverage explicitly', () => {
    const available = buildHybridShadowGame(baseGame({ gameId: 'ok' }));
    const unavailable = buildHybridShadowGame(
      baseGame({ gameId: 'miss', homeGrades: null, awayGrades: null })
    );
    const coverage = buildHybridShadowCoverage([available, unavailable]);
    expect(coverage.totalGames).toBe(2);
    expect(coverage.computedGames).toBe(1);
    expect(coverage.unavailableGames).toBe(1);
    expect(coverage.coverageKind).toBe('partial_hybrid');
    expect(classifyHybridShadowCoverage({ totalGames: 2, computedGames: 1 })).toBe(
      'partial_hybrid'
    );
  });

  it('treats zero Hybrid coverage with a nonzero Game frame as input unavailability, not no games', () => {
    const unavailable = buildHybridShadowGame(
      baseGame({ homeGrades: null, awayGrades: null })
    );
    const coverage = buildHybridShadowCoverage([unavailable]);
    expect(coverage.coverageKind).toBe('games_without_hybrid');
    expect(coverage.totalGames).toBe(1);
    expect(coverage.computedGames).toBe(0);
    expect(hybridShadowEmptyMessage('games_without_hybrid', 51)).toContain(
      'Hybrid unavailable'
    );
    expect(hybridShadowEmptyMessage('games_without_hybrid', 51)).not.toContain(
      'No games found'
    );
    expect(hybridShadowEmptyMessage('no_games', 0)).toContain('No games exist');
    expect(classifyHybridShadowCoverage({ totalGames: 51, computedGames: 0 })).toBe(
      'games_without_hybrid'
    );
    expect(classifyHybridShadowCoverage({ totalGames: 0, computedGames: 0 })).toBe(
      'no_games'
    );
    expect(classifyHybridShadowCoverage({ totalGames: 51, computedGames: 51 })).toBe(
      'full_hybrid'
    );
  });
});

describe('Phase 4A Core V1, market favorite, and V2 favorite repairs', () => {
  it('does not present Hybrid calculateV1Spread as production Core V1', () => {
    const homeRating = 12;
    const awayRating = 4;
    const homeTeamId = 'james-madison';
    const simpleHybridV1 = calculateV1Spread(homeRating, awayRating, false);
    const production = computeProductionCoreV1HmaFromV1Ratings({
      homeTeamId,
      homeRating,
      awayRating,
      neutralSite: false,
    });
    const expectedHfa = computeEffectiveHfa(homeTeamId, false).effectiveHfa;
    expect(production).toBeCloseTo(homeRating - awayRating + expectedHfa, 10);
    expect(production).not.toBeCloseTo(simpleHybridV1, 5);

    const row = buildHybridShadowGame(
      baseGame({
        homeTeamId,
        homeTeamName: 'James Madison',
        homeRating,
        awayRating,
        homeGrades: null,
        awayGrades: null,
      })
    );
    expect(row.v1Spread?.hma).toBeCloseTo(production, 10);
    expect(row.v1Spread?.hma).not.toBeCloseTo(simpleHybridV1, 5);
  });

  it('canonicalizes home and away rows of the same spread to the same HMA and actual favorite', () => {
    const homeRow = canonicalizeLabsMarketSpread({
      line: {
        value: -24.5,
        teamId: 'home',
        book: 'FanDuel',
        timestamp: '2026-08-28T12:00:00.000Z',
        source: 'odds_api',
      },
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeTeamName: 'Home',
      awayTeamName: 'Away',
    });
    const awayUnderdogRow = canonicalizeLabsMarketSpread({
      line: {
        value: 24.5,
        teamId: 'away',
        book: 'FanDuel',
        timestamp: '2026-08-28T12:00:00.000Z',
        source: 'odds_api',
      },
      homeTeamId: 'home',
      awayTeamId: 'away',
      homeTeamName: 'Home',
      awayTeamName: 'Away',
    });

    expect(canonicalMarketSpreadHma({
      lineValue: -24.5,
      teamId: 'home',
      homeTeamId: 'home',
      awayTeamId: 'away',
    })).toBe(24.5);
    expect(canonicalMarketSpreadHma({
      lineValue: 24.5,
      teamId: 'away',
      homeTeamId: 'home',
      awayTeamId: 'away',
    })).toBe(24.5);
    expect(homeRow.spreadHma).toBe(24.5);
    expect(awayUnderdogRow.spreadHma).toBe(24.5);
    expect(homeRow.favoriteTeamId).toBe('home');
    expect(awayUnderdogRow.favoriteTeamId).toBe('home');
    expect(awayUnderdogRow.teamId).toBe('away');
    expect(awayUnderdogRow.favoriteTeamId).not.toBe(awayUnderdogRow.teamId);

    const built = buildHybridShadowGame(
      baseGame({
        market: {
          value: 24.5,
          teamId: 'away',
          book: 'FanDuel',
          timestamp: '2026-08-28T12:00:00.000Z',
          source: 'odds_api',
        },
      })
    );
    expect(built.marketSpread?.favoriteTeamId).toBe('home');
    expect(built.marketSpread?.teamId).toBe('away');
    expect(built.marketSpread?.spreadHma).toBe(24.5);
  });

  it('derives V2 favorite from v2SpreadHma independently of Hybrid favorite', () => {
    const homeGrades: HybridShadowUnitGrades = {
      offRunGrade: 1,
      defRunGrade: 1,
      offPassGrade: 1,
      defPassGrade: 1,
      offExplosiveness: 1,
      defExplosiveness: 1,
    };
    const awayGrades: HybridShadowUnitGrades = {
      offRunGrade: 0,
      defRunGrade: 0,
      offPassGrade: 0,
      defPassGrade: 0,
      offExplosiveness: 0,
      defExplosiveness: 0,
    };
    const hybridResult = calculateHybridSpread(
      -20,
      20,
      homeGrades,
      awayGrades,
      false,
      'home',
      'away'
    );
    expect(hybridResult.v2SpreadHma).toBeGreaterThan(0);
    expect(hybridResult.hybridSpreadHma).toBeLessThan(0);

    const row = buildHybridShadowGame(
      baseGame({
        homeRating: -20,
        awayRating: 20,
        homeGrades,
        awayGrades,
      })
    );
    expect(row.v2Spread?.favoriteTeamId).toBe('home');
    expect(row.v2Spread?.favoriteName).toBe('Home');
    expect(row.hybridSpread?.favoriteTeamId).toBe('away');
    expect(row.hybridSpread?.favoriteName).toBe('Away');
    expect(row.v2Spread?.favoriteTeamId).not.toBe(row.hybridSpread?.favoriteTeamId);

    const v2FromHma = toSpreadInfo(hybridResult.v2SpreadHma, 'home', 'away', 'Home', 'Away');
    const hybridFromHma = toSpreadInfo(
      hybridResult.hybridSpreadHma,
      'home',
      'away',
      'Home',
      'Away'
    );
    expect(row.v2Spread).toEqual(v2FromHma);
    expect(row.hybridSpread).toEqual(hybridFromHma);
    expect(row.diff).toBeCloseTo(
      hybridResult.hybridSpreadHma - (row.v1Spread?.hma ?? 0),
      10
    );
  });
});

describe('Phase 4A Models / Hybrid static source gates', () => {
  const nav = fs.readFileSync(path.join(webRoot, 'components/HeaderNav.tsx'), 'utf8');
  const labsNav = fs.readFileSync(path.join(webRoot, 'components/LabsNav.tsx'), 'utf8');
  const page = fs.readFileSync(path.join(webRoot, 'app/labs/hybrid/page.tsx'), 'utf8');
  const route = fs.readFileSync(
    path.join(webRoot, 'app/api/labs/hybrid-slate/route.ts'),
    'utf8'
  );
  const helper = fs.readFileSync(
    path.join(webRoot, 'lib/labs/hybrid-shadow-truth.ts'),
    'utf8'
  );

  it('top navigation visible label is Models', () => {
    expect(nav).toContain('Models');
    expect(nav).not.toContain('Labs (V2)');
    expect(nav).toContain('href="/labs/hybrid"');
    expect(labsNav).toContain('Hybrid V2 Shadow');
  });

  it('Hybrid page no longer says Hybrid is the current production spread model', () => {
    expect(page).not.toContain(
      'Hybrid V2 remains the only production spread model used for My Picks'
    );
    expect(page).not.toContain('the only production spread model');
    expect(page).toContain('HYBRID_SHADOW_STATUS_LABEL');
    expect(page).toContain('HYBRID_NOT_OFFICIAL_2026_BET');
    expect(page).toContain('HYBRID_LIVE_MUTABLE_SHADOW');
    expect(page).toContain('CORE_V1_EFFECTIVE_PRODUCTION_LABEL');
  });

  it('Hybrid page uses /api/current-season-week and does not use /api/weeks to resolve current season/week', () => {
    expect(page).toContain("fetch('/api/current-season-week')");
    expect(page).not.toContain("fetch('/api/weeks')");
    expect(page).not.toContain("fetch('/api/weeks?");
    expect(page).toContain('/api/labs/hybrid-slate?season=');
  });

  it('Hybrid API retains the Game frame and does not skip missing Hybrid inputs', () => {
    expect(route).toContain('prisma.game.findMany');
    expect(route).toContain('buildHybridShadowGame');
    expect(route).toContain('buildHybridShadowCoverage');
    expect(route).not.toContain('Skipping game');
    expect(route).not.toMatch(/if\s*\(\s*!homeRating\s*\|\|\s*!awayRating/);
    expect(route).toContain('isFiniteRating');
    expect(route).toContain('export async function GET');
    expect(route).not.toContain('export async function POST');
    expect(helper).toContain("from '@/lib/core-v2-spread'");
    expect(helper).toContain("from '@/lib/core-v1-spread'");
    expect(helper).toContain('computeEffectiveHfa');
    expect(helper).toContain('computeProductionCoreV1HmaFromV1Ratings');
    expect(helper).not.toContain('calculateV1Spread');
    expect(route).not.toContain('favoriteTeamId: line.teamId');
    expect(page).toContain('Diff (Hybrid − Core V1 HMA)');
    expect(page).toContain('spreadHma');
  });

  it('V4/Fade is explicitly historical/backtest and Super Tier A remains shadow/held', () => {
    expect(page).toContain('V4_FADE_HISTORICAL_STATUS');
    expect(page).toContain('SUPER_TIER_A_SHADOW_STATUS');
    expect(page).toContain('does not claim a 2026 Super Tier A record');
    expect(SUPER_TIER_A_FROZEN_QUALIFICATION.hybridConflictType).toBe(
      'hybrid_strong'
    );
    expect(SUPER_TIER_A_FROZEN_QUALIFICATION.minAbsSpreadEdge).toBe(4.0);
    expect(page).not.toContain('2026 Hybrid W/L');
    expect(page).not.toContain('Hybrid ROI');
    expect(page).not.toContain('Super Tier A ROI');
  });

  it('page empty copy does not claim no football games exist when Hybrid coverage is zero', () => {
    expect(page).toContain('hybridShadowEmptyMessage');
    expect(page).not.toContain('No games found for this week');
  });
});

describe('Phase 4A does not modify formulas, authorization, schema, or writers', () => {
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

  it('existing Hybrid production authorization file is unchanged', () => {
    expect(
      gitDiffNames(['apps/web/lib/config/hybrid-production-activation.ts'])
    ).toEqual([]);
  });

  it('Core V1 and Hybrid formula files are unchanged', () => {
    expect(
      gitDiffNames([
        'apps/web/lib/core-v1-spread.ts',
        'apps/web/lib/core-v2-spread.ts',
        'apps/jobs/src/ratings/core-v1-lifecycle.ts',
        'apps/jobs/src/ratings/compute_balanced_v1.ts',
      ])
    ).toEqual([]);
  });

  it('Prisma schema, workflows, official card, slate, and writers are unchanged', () => {
    expect(
      gitDiffNames([
        'prisma',
        '.github/workflows',
        'apps/web/app/api/weeks/slate/route.ts',
        'apps/web/lib/official-card.ts',
        'apps/web/scripts/sync-hybrid-bets.ts',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });
});
