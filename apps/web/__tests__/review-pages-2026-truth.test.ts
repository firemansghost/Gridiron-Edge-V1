import * as fs from 'fs';
import * as path from 'path';
import {
  computeMarketBreakdownByMarketType,
  computeWeekReviewMetrics,
  type ReviewBetRow,
} from '@/lib/review-truth-week';
import {
  getDefaultReviewStrategyTag,
  getPreferredReviewStrategyTagForSeason,
  preserveExplicitReviewStrategyRequest,
  resolveReviewStrategyAfterAvailability,
  resolveReviewStrategySelection,
} from '@/lib/strategy-utils';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../..');

describe('Phase 2A review-truth: defaults + metrics', () => {
  describe('getDefaultReviewStrategyTag', () => {
    it('defaults 2026 to official_flat_100 when available (not hybrid_v2)', () => {
      expect(
        getDefaultReviewStrategyTag(2026, [
          'hybrid_v2',
          'official_flat_100',
          'v4_labs',
          'demo_seed',
        ])
      ).toBe('official_flat_100');
    });

    it('defaults 2026 to a non-demo non-hybrid strategy when official is absent', () => {
      expect(
        getDefaultReviewStrategyTag(2026, ['hybrid_v2', 'v4_labs', 'experimental_x'])
      ).toBe('v4_labs');
    });

    it('defaults historical 2025 to hybrid_v2 when available', () => {
      expect(
        getDefaultReviewStrategyTag(2025, ['official_flat_100', 'hybrid_v2', 'v4_labs'])
      ).toBe('hybrid_v2');
    });

    it('does not default to demo/test tags when nothing else exists', () => {
      expect(
        getDefaultReviewStrategyTag(2026, ['demo_seed', 'test_grader', 'experimental_x'])
      ).toBe('all');
    });
  });

  describe('getPreferredReviewStrategyTagForSeason', () => {
    it('prefers official_flat_100 for 2026+ before availability is known', () => {
      expect(getPreferredReviewStrategyTagForSeason(2026)).toBe('official_flat_100');
      expect(getPreferredReviewStrategyTagForSeason(2027)).toBe('official_flat_100');
    });

    it('prefers hybrid_v2 for historical seasons <= 2025', () => {
      expect(getPreferredReviewStrategyTagForSeason(2025)).toBe('hybrid_v2');
      expect(getPreferredReviewStrategyTagForSeason(2024)).toBe('hybrid_v2');
    });
  });

  describe('cross-season availability validation', () => {
    it('keeps 2025 hybrid_v2 when persisted', () => {
      expect(
        resolveReviewStrategyAfterAvailability('hybrid_v2', 2025, [
          'hybrid_v2',
          'official_flat_100',
        ])
      ).toBe('hybrid_v2');
    });

    it('falls back to official_flat_100 when 2025 hybrid is missing', () => {
      expect(
        resolveReviewStrategyAfterAvailability('hybrid_v2', 2025, ['official_flat_100'])
      ).toBe('official_flat_100');
    });

    it('keeps 2026 official_flat_100 when persisted', () => {
      expect(
        resolveReviewStrategyAfterAvailability('official_flat_100', 2026, [
          'official_flat_100',
          'hybrid_v2',
        ])
      ).toBe('official_flat_100');
    });

    it('falls back to valid non-demo non-hybrid when 2026 official is missing', () => {
      expect(
        resolveReviewStrategyAfterAvailability('official_flat_100', 2026, [
          'hybrid_v2',
          'v4_labs',
        ])
      ).toBe('v4_labs');
    });
  });

  describe('explicit URL strategy preservation', () => {
    it('preserves custom persisted tag until availability is known', () => {
      expect(preserveExplicitReviewStrategyRequest('custom_ruleset_v1')).toBe(
        'custom_ruleset_v1'
      );
      expect(resolveReviewStrategySelection('custom_ruleset_v1', [])).toBe(
        'custom_ruleset_v1'
      );
    });

    it('keeps custom persisted tag after availability validation when present', () => {
      expect(
        resolveReviewStrategyAfterAvailability('custom_ruleset_v1', 2026, [
          'official_flat_100',
          'custom_ruleset_v1',
          'hybrid_v2',
        ])
      ).toBe('custom_ruleset_v1');
    });

    it('falls back to season review default when custom tag is not persisted', () => {
      expect(
        resolveReviewStrategyAfterAvailability('custom_ruleset_v1', 2026, [
          'official_flat_100',
          'hybrid_v2',
        ])
      ).toBe('official_flat_100');
    });

    it('keeps all as a valid explicit selection', () => {
      expect(preserveExplicitReviewStrategyRequest('all')).toBe('all');
      expect(
        resolveReviewStrategyAfterAvailability('all', 2026, ['official_flat_100'])
      ).toBe('all');
    });
  });

  describe('Week Review metrics helper', () => {
    function makeBetRow(
      marketType: ReviewBetRow['marketType'],
      result: ReviewBetRow['result'],
      stake = 100,
      pnl: number | null = null,
      clv: number | null = null
    ): ReviewBetRow {
      return {
        marketType,
        result,
        stake,
        pnl,
        clv,
      };
    }

    it('matches Week 1 official reference fixture (98 total / 14 graded / ROI + hitRate)', () => {
      // Reference fixture (spread 50, moneyline 48, totals 0)
      // Graded: 14 (6W / 8L / 0P)
      // Pending: 84
      const bets: ReviewBetRow[] = [];

      // Spread: 7 graded (4W / 3L) => PnL +63.60, pending 43
      for (let i = 0; i < 4; i += 1) bets.push(makeBetRow('spread', 'win', 100, 20.0));
      for (let i = 0; i < 3; i += 1) bets.push(makeBetRow('spread', 'loss', 100, (63.6 - 80) / 3));
      for (let i = 0; i < 43; i += 1) bets.push(makeBetRow('spread', null, 100, null, null));

      // Moneyline: 7 graded (2W / 5L) => PnL -287.368421, pending 41
      for (let i = 0; i < 2; i += 1) bets.push(makeBetRow('moneyline', 'win', 100, 30.0));
      for (let i = 0; i < 5; i += 1)
        bets.push(
          makeBetRow(
            'moneyline',
            'loss',
            100,
            (-287.368421 - 60) / 5
          )
        );
      for (let i = 0; i < 41; i += 1) bets.push(makeBetRow('moneyline', null, 100, null, null));

      expect(bets).toHaveLength(98);

      const m = computeWeekReviewMetrics(bets);
      expect(m.totalBets).toBe(98);
      expect(m.gradedBets).toBe(14);
      expect(m.pendingBets).toBe(84);
      expect(m.wins).toBe(6);
      expect(m.losses).toBe(8);
      expect(m.pushes).toBe(0);
      expect(m.gradedStake).toBeCloseTo(1400, 6);
      expect(m.totalPnL).toBeCloseTo(-223.768421, 6);
      expect(m.hitRate).toBeCloseTo(6 / 14, 10);
      expect(m.roi).toBeCloseTo(-0.159834586, 8);

      const byMarket = computeMarketBreakdownByMarketType(bets);
      expect(byMarket.spread.totalBets).toBe(50);
      expect(byMarket.spread.gradedBets).toBe(7);
      expect(byMarket.spread.pendingBets).toBe(43);
      expect(byMarket.spread.wins).toBe(4);
      expect(byMarket.spread.losses).toBe(3);
      expect(byMarket.spread.pushes).toBe(0);
      expect(byMarket.spread.pnl).toBeCloseTo(63.6, 6);

      expect(byMarket.moneyline.totalBets).toBe(48);
      expect(byMarket.moneyline.gradedBets).toBe(7);
      expect(byMarket.moneyline.pendingBets).toBe(41);
      expect(byMarket.moneyline.wins).toBe(2);
      expect(byMarket.moneyline.losses).toBe(5);
      expect(byMarket.moneyline.pushes).toBe(0);
      expect(byMarket.moneyline.pnl).toBeCloseTo(-287.368421, 6);
    });

    it('excludes pushes from hit rate denominator', () => {
      const bets: ReviewBetRow[] = [
        makeBetRow('spread', 'win', 100, 10),
        makeBetRow('spread', 'push', 100, 0),
        makeBetRow('spread', 'push', 100, 0),
      ];
      const m = computeWeekReviewMetrics(bets);
      expect(m.wins).toBe(1);
      expect(m.losses).toBe(0);
      expect(m.pushes).toBe(2);
      expect(m.hitRate).toBe(1);
    });

    it('does not let pending stake dilute ROI', () => {
      const bets: ReviewBetRow[] = [
        makeBetRow('spread', 'win', 100, 10),
        makeBetRow('spread', null, 100, null, null),
      ];
      const m = computeWeekReviewMetrics(bets);
      expect(m.roi).toBeCloseTo(0.1, 10);
      expect(m.pendingBets).toBe(1);
    });
  });
});

describe('Phase 2A review-truth: static UI/API gates', () => {
  const weekReviewPagePath = path.join(
    webRoot,
    'app/weeks/review/page.tsx'
  );
  const weekSummaryApiPath = path.join(webRoot, 'app/api/bets/summary/route.ts');
  const seasonSummaryApiPath = path.join(webRoot, 'app/api/bets/season-summary/route.ts');

  const weekReviewPage = fs.readFileSync(weekReviewPagePath, 'utf8');
  const weekSummaryApi = fs.readFileSync(weekSummaryApiPath, 'utf8');
  const seasonSummaryApi = fs.readFileSync(seasonSummaryApiPath, 'utf8');

  it('removes the pagination TODO handler', () => {
    expect(weekReviewPage).not.toContain('TODO: Implement pagination');
  });

  it('resets page=1 when season/week/strategy changes and updates page on click', () => {
    expect(weekReviewPage).toContain('setPage(1);');
    expect(weekReviewPage).toContain('setPage(page);');
  });

  it('fixes zero-value null checks in Week Review table', () => {
    expect(weekReviewPage).not.toContain('bet.closePrice ||');
    expect(weekReviewPage).not.toContain('bet.clv ?');
    expect(weekReviewPage).not.toContain('bet.pnl ?');
  });

  it('uses persisted official notes parser for official edge/value display', () => {
    expect(weekReviewPage).toContain('parseOfficialCardNotes');
    expect(weekReviewPage).toContain('getOfficialPersistedEdgeNumeric');
  });

  it('Week Review summary uses avgEdge gating for 2026 official_flat_100', () => {
    expect(weekSummaryApi).toContain('isOfficial2026Review');
    expect(weekSummaryApi).toContain('let avgEdge: number | null = null');
    expect(weekSummaryApi).toContain('if (!isOfficial2026Review)');
  });

  it('Week Review summary/breakdown use the tested metric helpers on the full population', () => {
    expect(weekSummaryApi).toContain("from '@/lib/review-truth-week'");
    expect(weekSummaryApi).toContain('computeWeekReviewMetrics');
    expect(weekSummaryApi).toContain('computeMarketBreakdownByMarketType');
    expect(weekSummaryApi).toContain('const metricRows: ReviewBetRow[] = allBets.map');
    expect(weekSummaryApi).not.toContain('const byMarketType = byMarketTypeMap');
  });

  it('market breakdown UI uses currency PnL and graded/pending counts, not units', () => {
    expect(weekReviewPage).not.toMatch(/toFixed\(2\)\} units/);
    expect(weekReviewPage).not.toContain('units');
    expect(weekReviewPage).toContain('formatCurrency(spread.pnl)');
    expect(weekReviewPage).toContain('formatCurrency(moneyline.pnl)');
    expect(weekReviewPage).toContain(
      '{spread.totalBets} {spread.totalBets === 1 ? \'play\' : \'plays\'} · {spread.gradedBets} graded · {spread.pendingBets} pending'
    );
    expect(weekReviewPage).toContain(
      '{moneyline.totalBets} {moneyline.totalBets === 1 ? \'play\' : \'plays\'} · {moneyline.gradedBets} graded · {moneyline.pendingBets} pending'
    );
  });

  it('preserves explicit URL strategy until availability validation', () => {
    expect(weekReviewPage).toContain('preserveExplicitReviewStrategyRequest');
    expect(weekReviewPage).toContain('resolveReviewStrategyAfterAvailability');
    expect(weekReviewPage).not.toContain('resolveReviewStrategySelection(strategyParam, [])');
    const seasonReviewPage = fs.readFileSync(
      path.join(webRoot, 'app/season-review/page.tsx'),
      'utf8'
    );
    expect(seasonReviewPage).toContain('preserveExplicitReviewStrategyRequest');
    expect(seasonReviewPage).toContain('resolveReviewStrategyAfterAvailability');
    expect(seasonReviewPage).not.toContain('resolveReviewStrategySelection(strategyParam, [])');
  });

  it('does not clear explicit Week Review URL strategy via a blanket [season, week] effect', () => {
    expect(weekReviewPage).not.toMatch(
      /useEffect\(\(\) => \{\s*defaultStrategySet\.current = false;\s*\}, \[season, week\]\)/
    );
    expect(weekReviewPage).not.toContain('}, [season, week]);');
    expect(weekReviewPage).toContain('if (strategyParam !== null)');
    expect(weekReviewPage).toContain('preserveExplicitReviewStrategyRequest(strategyParam)');
    expect(weekReviewPage).toContain('defaultStrategySet.current = true');
  });

  it('keeps explicit custom and all Week Review URL strategies through initialization', () => {
    expect(weekReviewPage).toContain("reviewStrategyToWeekReviewState(preserved ?? 'all')");
    expect(weekReviewPage).toContain('resolveReviewStrategyAfterAvailability(requested, season, available)');
    expect(weekReviewPage).toContain("const requested = strategy === '' ? 'all' : strategy");
  });

  it('resets Week Review strategy default only on user season/week changes', () => {
    expect(weekReviewPage).toContain('getPreferredReviewStrategyTagForSeason');
    expect(weekReviewPage).toMatch(
      /const nextSeason = parseInt\(e\.target\.value, 10\);\s*const preferred = getPreferredReviewStrategyTagForSeason\(nextSeason\);/
    );
    expect(weekReviewPage).toMatch(
      /setData\(null\);\s*setPage\(1\);\s*setStrategy\(reviewStrategyToWeekReviewState\(preferred\)\);\s*defaultStrategySet\.current = true;\s*setSeason\(nextSeason\);/
    );
    expect(weekReviewPage).toMatch(
      /const preferred = getPreferredReviewStrategyTagForSeason\(season\);/
    );
    expect(weekReviewPage).toMatch(
      /setData\(null\);\s*setPage\(1\);\s*setStrategy\(reviewStrategyToWeekReviewState\(preferred\)\);\s*defaultStrategySet\.current = true;\s*setWeek\(nextWeek\);/
    );
    expect(weekReviewPage).toMatch(
      /defaultStrategySet\.current = true;\s*\/\/ Normalize empty string and "all" to empty for API/
    );
  });

  it('applies provisional preferred strategy on Week Review manual cross-season change', () => {
    expect(getPreferredReviewStrategyTagForSeason(2025)).toBe('hybrid_v2');
    expect(getPreferredReviewStrategyTagForSeason(2026)).toBe('official_flat_100');
    expect(weekReviewPage).toContain(
      'const preferred = getPreferredReviewStrategyTagForSeason(nextSeason)'
    );
    expect(weekReviewPage).toContain('setData(null)');
    expect(weekReviewPage).toContain(
      'setStrategy(reviewStrategyToWeekReviewState(preferred))'
    );
    expect(weekReviewPage).not.toMatch(
      /defaultStrategySet\.current = false;\s*setSeason\(parseInt\(e\.target\.value/
    );
  });

  it('gates Season Review fetch until URL params are applied', () => {
    const seasonReviewPage = fs.readFileSync(
      path.join(webRoot, 'app/season-review/page.tsx'),
      'utf8'
    );
    expect(seasonReviewPage).toContain('const [paramsReady, setParamsReady] = useState(false)');
    expect(seasonReviewPage).toContain('if (!paramsReady) return');
    expect(seasonReviewPage).toContain('setParamsReady(true)');
    expect(seasonReviewPage).toContain('[paramsReady, season, strategyTag, selectedMarket]');
    expect(seasonReviewPage).not.toContain('}, [season, strategyTag, selectedMarket]);');
    expect(seasonReviewPage).toContain('preserveExplicitReviewStrategyRequest(strategyParam)');
    expect(seasonReviewPage).toContain('getPreferredReviewStrategyTagForSeason');
    expect(seasonReviewPage).toMatch(
      /const nextSeason = parseInt\(e\.target\.value, 10\);\s*const preferred = getPreferredReviewStrategyTagForSeason\(nextSeason\);/
    );
    expect(seasonReviewPage).toMatch(
      /setData\(null\);\s*setStrategyTag\(preferred\);\s*defaultStrategySet\.current = true;\s*setSeason\(nextSeason\);/
    );
    expect(seasonReviewPage).toMatch(
      /defaultStrategySet\.current = true;\s*setStrategyTag\(e\.target\.value\)/
    );
  });

  it('applies provisional preferred strategy on Season Review manual cross-season change', () => {
    const seasonReviewPage = fs.readFileSync(
      path.join(webRoot, 'app/season-review/page.tsx'),
      'utf8'
    );
    expect(seasonReviewPage).toContain(
      'const preferred = getPreferredReviewStrategyTagForSeason(nextSeason)'
    );
    expect(seasonReviewPage).toContain('setStrategyTag(preferred)');
    expect(seasonReviewPage).toContain('setData(null)');
    expect(seasonReviewPage).not.toMatch(
      /defaultStrategySet\.current = false;\s*setSeason\(parseInt\(e\.target\.value/
    );
  });

  it('Season Summary avoids unsafe avgEdge recomputation for 2026 official_flat_100', () => {
    expect(seasonSummaryApi).toContain('isOfficial2026Review');
    expect(seasonSummaryApi).toContain('if (!isOfficial2026Review)');
  });

  it('does not introduce MarketLine queries in review APIs', () => {
    expect(weekSummaryApi).not.toMatch(/\bMarketLine\b/);
    expect(weekSummaryApi).not.toContain('market-line-helpers');
    expect(seasonSummaryApi).not.toMatch(/\bMarketLine\b/);
    expect(seasonSummaryApi).not.toContain('market-line-helpers');
  });
});

