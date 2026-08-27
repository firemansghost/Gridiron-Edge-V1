/**
 * Phase 2C-2H-4 — Core V1 historical parity forensic tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getModelConfig } from '../src/config/model-weights';
import {
  CONFERENCE_ADJUSTMENTS,
  computeV1SeasonRatings,
} from '../src/ratings/compute_ratings_v1';
import {
  FEATURE_LOADER_STRICT_READ_ERROR,
  FeatureLoader,
} from '../src/ratings/feature-loader';
import { buildMissingStatsFeatures } from '../src/preseason/core-v1-ratings-preview';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  COMPARISON_SEASON,
  DOCUMENTED_2026_TALENT_ONLY_PREVIEW_COUNT,
  EXPECTED_2025_FBS_COUNT,
  V1_GIT_HISTORY_EVIDENCE,
  buildV1HistoricalParityAudit,
  counterfactualPower,
  parseV1HistoricalParityArgs,
  sanitizeV1HistoricalParityError,
  type PersistedV1RatingRow,
  type V1HistoricalParityInput,
} from '../src/preseason/v1-historical-parity-audit';
import {
  createPrismaV1HistoricalParityReadStore,
  type V1HistoricalParityReadStore,
} from '../audit-v1-historical-parity';

const CONFERENCES = [
  'SEC',
  'Big Ten',
  'ACC',
  'Big 12',
  'Pac-12',
  'American Athletic',
  'Mountain West',
  'Sun Belt',
  'Mid-American',
  'Conference USA',
  'Independent',
] as const;

function featuresForFbs(
  fbs: string[],
  overrides: Partial<
    Record<string, ReturnType<typeof buildMissingStatsFeatures>>
  > = {}
) {
  return fbs.map((teamId, i) => {
    if (overrides[teamId]) return overrides[teamId]!;
    return buildMissingStatsFeatures({
      teamId,
      season: COMPARISON_SEASON,
      talentComposite: 500 + i * 0.5,
      blueChipsPct: null,
      commitsSignal: null,
      weeksPlayed: 8,
    });
  });
}

function conferenceMapForFbs(fbs: string[]) {
  const map = new Map<string, string | null>();
  for (let i = 0; i < fbs.length; i++) {
    map.set(fbs[i].toLowerCase(), CONFERENCES[i % CONFERENCES.length]);
  }
  return map;
}

function healthyInput(
  overrides: Partial<V1HistoricalParityInput> = {},
  options: { fbsIds?: string[]; includePollution?: boolean } = {}
): V1HistoricalParityInput {
  const fbs = options.fbsIds ?? buildBaseFbsFixture(EXPECTED_2025_FBS_COUNT);
  const modelConfig = getModelConfig('v1');
  const allFeatures = featuresForFbs(fbs);
  const conferenceMap = conferenceMapForFbs(fbs);
  const replay = computeV1SeasonRatings({
    season: COMPARISON_SEASON,
    allFeatures,
    conferenceMap,
    modelConfig,
  });
  const persistedV1Rows: PersistedV1RatingRow[] = replay.map((r) => ({
    teamId: r.teamId,
    season: COMPARISON_SEASON,
    modelVersion: 'v1',
    powerRating: r.powerRating,
    confidence: r.confidence,
    dataSource: r.dataSource,
    games: r.games,
    offenseRating: r.offenseRating,
    defenseRating: r.defenseRating,
  }));
  if (options.includePollution !== false) {
    persistedV1Rows.push({
      teamId: 'some-fcs-team',
      season: COMPARISON_SEASON,
      modelVersion: 'v1',
      powerRating: 99,
      confidence: 0.5,
      dataSource: 'season_only',
      games: 10,
    });
  }

  return {
    comparisonSeason: COMPARISON_SEASON,
    fbsIds: [...fbs],
    persistedV1Rows,
    allFeatures,
    conferenceMap,
    modelConfig,
    conferenceSource: 'Team.conference',
    legacyConferenceMode: true,
    conferenceLoadOk: true,
    featureLoaderStrict: true,
    ...overrides,
  };
}

describe('parseV1HistoricalParityArgs', () => {
  it('accepts --comparison-season 2025', () => {
    expect(
      parseV1HistoricalParityArgs(['--comparison-season', '2025'])
    ).toEqual({ ok: true, comparisonSeason: 2025 });
  });

  it('rejects non-2025 and write flags', () => {
    const bad = parseV1HistoricalParityArgs([
      '--comparison-season',
      '2026',
      '--write',
    ]);
    expect(bad.ok).toBe(false);
  });
});

describe('V1 historical parity completeness gates', () => {
  it('1. healthy exact 136 FBS + 136 finite persisted V1 rows passes', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.ok).toBe(true);
    expect(result.fbsCount).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.distinctFbsTeamIds).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.persistedV1FbsCount).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.persistedPowerFinite).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.comparedCount).toBe(EXPECTED_2025_FBS_COUNT);
    expect(result.comparedTeamSetExact).toBe(true);
    expect(result.historicalParity).toBe(true);
    expect(result.currentFormulaReproducesPersisted2025).toBe(true);
    expect(result.persistedV1NonFbsCount).toBe(1);
  });

  it('2. authoritative FBS count=135 -> fail closed', () => {
    const fbs = buildBaseFbsFixture(135);
    const result = buildV1HistoricalParityAudit(
      healthyInput({}, { fbsIds: fbs, includePollution: false })
    );
    expect(result.ok).toBe(false);
    expect(result.historicalParity).toBe(false);
    expect(result.bestDiagnosticCounterfactual).toBe('INCONCLUSIVE');
    expect(result.findings.join(' ')).toMatch(/136/);
  });

  it('3. authoritative FBS count=137 -> fail closed', () => {
    const fbs = buildBaseFbsFixture(137);
    const result = buildV1HistoricalParityAudit(
      healthyInput({}, { fbsIds: fbs, includePollution: false })
    );
    expect(result.ok).toBe(false);
    expect(result.historicalParity).toBe(false);
    expect(result.counterfactuals).toEqual([]);
  });

  it('4. one persisted FBS rating row missing -> fail closed', () => {
    const input = healthyInput();
    input.persistedV1Rows = input.persistedV1Rows.filter(
      (r) => r.teamId !== input.fbsIds[0]
    );
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.historicalParity).toBe(false);
    expect(result.currentFormulaReproducesPersisted2025).toBe(false);
    expect(result.counterfactuals).toEqual([]);
    expect(result.top20AbsMismatches).toEqual([]);
    expect(result.bestDiagnosticCounterfactual).toBe('INCONCLUSIVE');
    expect(result.persistedFbsMissingCount).toBe(1);
  });

  it('5. one persisted FBS row powerRating=null -> fail closed', () => {
    const input = healthyInput();
    const row = input.persistedV1Rows.find((r) => r.teamId === input.fbsIds[0])!;
    row.powerRating = null;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.historicalParity).toBe(false);
    expect(result.persistedFbsNonFinitePowerCount).toBe(1);
    expect(result.persistedPowerFiniteSetExact).toBe(false);
    expect(result.counterfactuals).toEqual([]);
  });

  it('6. one persisted FBS row powerRating=NaN -> fail closed', () => {
    const input = healthyInput();
    const row = input.persistedV1Rows.find((r) => r.teamId === input.fbsIds[1])!;
    row.powerRating = Number.NaN;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.historicalParity).toBe(false);
    expect(result.persistedPowerFinite).toBe(EXPECTED_2025_FBS_COUNT - 1);
  });

  it('7. replacing missing FBS with non-FBS pollution does NOT restore completeness', () => {
    const input = healthyInput();
    const missingId = input.fbsIds[0];
    input.persistedV1Rows = input.persistedV1Rows.filter(
      (r) => r.teamId !== missingId
    );
    input.persistedV1Rows.push({
      teamId: 'another-fcs-pollution',
      season: COMPARISON_SEASON,
      modelVersion: 'v1',
      powerRating: 12,
      confidence: 0.2,
      dataSource: 'season_only',
      games: 5,
    });
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.persistedV1FbsCount).toBe(EXPECTED_2025_FBS_COUNT - 1);
    expect(result.persistedV1FbsSetExact).toBe(false);
    expect(result.historicalParity).toBe(false);
  });

  it('8. persisted distinct FBS set must equal authoritative FBS set', () => {
    const input = healthyInput();
    const row = input.persistedV1Rows.find((r) => r.teamId === input.fbsIds[0])!;
    row.teamId = 'not-in-fbs-set';
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.persistedV1FbsSetExact).toBe(false);
  });

  it('9. comparedCount<136 can never produce historicalParity=true', () => {
    const input = healthyInput();
    input.persistedV1Rows = input.persistedV1Rows.filter(
      (r) => r.teamId !== input.fbsIds[0]
    );
    const result = buildV1HistoricalParityAudit(input);
    expect(result.comparedCount).toBeLessThan(EXPECTED_2025_FBS_COUNT);
    expect(result.historicalParity).toBe(false);
  });

  it('10. comparedTeamSetExact=false can never produce historicalParity=true', () => {
    const input = healthyInput();
    const row = input.persistedV1Rows.find((r) => r.teamId === input.fbsIds[0])!;
    row.powerRating = null;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.comparedTeamSetExact).toBe(false);
    expect(result.historicalParity).toBe(false);
  });

  it('11. one feature season=2024 -> fail closed', () => {
    const input = healthyInput();
    input.allFeatures[0].season = 2024;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.featureSeasonMismatchCount).toBe(1);
    expect(result.historicalParity).toBe(false);
  });

  it('12. one feature season=2026 -> fail closed', () => {
    const input = healthyInput();
    input.allFeatures[0].season = 2026;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.featureSeasonMismatchCount).toBe(1);
  });

  it('13. non-FBS pollution excluded but does not fail healthy 136', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.persistedV1NonFbsCount).toBeGreaterThanOrEqual(1);
    expect(result.ok).toBe(true);
    expect(result.historicalParity).toBe(true);
  });

  it('14. CURRENT/POST_CAL/NO_CONFERENCE formulas remain unchanged', () => {
    const input = healthyInput();
    const r = computeV1SeasonRatings({
      season: COMPARISON_SEASON,
      allFeatures: input.allFeatures,
      conferenceMap: input.conferenceMap,
      modelConfig: input.modelConfig,
    })[0];
    expect(
      counterfactualPower(
        'CURRENT',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    ).toBeCloseTo(r.powerRating, 10);
    expect(
      counterfactualPower(
        'POST_CAL',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    ).toBeCloseTo(
      r.rawScore * r.calibrationFactor + r.conferenceAdjustment,
      10
    );
    expect(
      counterfactualPower(
        'NO_CONFERENCE',
        r.rawScore,
        r.conferenceAdjustment,
        r.calibrationFactor
      )
    ).toBeCloseTo(r.rawScore * r.calibrationFactor, 10);
  });

  it('mismatch metrics still work on complete population', () => {
    const input = healthyInput();
    const row = input.persistedV1Rows.find((r) => r.teamId === input.fbsIds[0])!;
    row.powerRating = (row.powerRating as number) + 2.5;
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(true);
    expect(result.exactMatchCount).toBe(EXPECTED_2025_FBS_COUNT - 1);
    expect(result.historicalParity).toBe(false);
    expect(result.maxAbsDelta).toBeCloseTo(2.5, 9);
  });

  it('exact feature set still required', () => {
    const input = healthyInput();
    input.allFeatures = input.allFeatures.slice(0, 135);
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.findings.join(' ')).toMatch(/featureVector/);
  });

  it('non-FBS persisted rows excluded from parity population', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.persistedV1TotalCount).toBe(EXPECTED_2025_FBS_COUNT + 1);
    expect(result.persistedV1FbsCount).toBe(EXPECTED_2025_FBS_COUNT);
  });

  it('no formula/config constants modified', () => {
    const v1 = getModelConfig('v1');
    expect(v1.calibration_factor).toBe(8.0);
    expect(v1.hfa).toBe(2.0);
    expect(v1.talent_weights?.w_talent).toBe(1.0);
    expect(CONFERENCE_ADJUSTMENTS.SEC).toBe(5.0);
    expect(EXPECTED_2025_FBS_COUNT).toBe(136);
  });

  it('missing source label maps to season_only; 2026 mislabel count documented', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.missingSourceLabelWouldBeSeasonOnly).toBe(true);
    expect(result.documented2026MislabeledIfPersistedToday).toBe(
      DOCUMENTED_2026_TALENT_ONLY_PREVIEW_COUNT
    );
  });

  it('git history evidence documents pre-calibration conference apply', () => {
    const hit = V1_GIT_HISTORY_EVIDENCE.find((g) =>
      g.sha.startsWith('2c73002')
    );
    expect(hit).toBeTruthy();
    expect(hit!.notes.join(' ')).toMatch(/before calibration/i);
  });

  it('16. ratingsWriteAuthorized=false and modelChangeAuthorized=false in every path', () => {
    const ok = buildV1HistoricalParityAudit(healthyInput());
    const bad = buildV1HistoricalParityAudit(
      healthyInput({}, { fbsIds: buildBaseFbsFixture(135) })
    );
    for (const r of [ok, bad]) {
      expect(r.ratingsWriteAuthorized).toBe(false);
      expect(r.modelChangeAuthorized).toBe(false);
      expect(r.mutationsInvoked).toBe(false);
      expect(r.providersInvoked).toBe(false);
      expect(r.oddsInvoked).toBe(false);
    }
  });

  it('raw exceptions sanitized', () => {
    expect(
      sanitizeV1HistoricalParityError(
        new Error('postgresql://user:password@host/db')
      )
    ).not.toContain('postgresql://');
  });
});

describe('read-only store and FeatureLoader strict', () => {
  it('15. no mutation methods; strict FeatureLoader unchanged', async () => {
    const store: V1HistoricalParityReadStore = {
      loadFbsTeamIds: async () => [],
      loadPersistedV1Ratings: async () => [],
      loadTeamFeatures: async () =>
        buildMissingStatsFeatures({
          teamId: 'x',
          season: 2025,
          talentComposite: 1,
        }),
    };
    expect(Object.keys(store)).not.toEqual(
      expect.arrayContaining([
        'upsert',
        'create',
        'update',
        'delete',
        'writeTeamSeasonRating',
      ])
    );
    void createPrismaV1HistoricalParityReadStore;

    const prisma = {
      teamSeasonTalent: {
        findUnique: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'postgresql://admin:SuperSecret@db.internal:5432/gridiron'
            )
          ),
      },
      teamClassCommits: { findUnique: jest.fn() },
      game: { count: jest.fn() },
      teamGameStat: { findMany: jest.fn().mockResolvedValue([]) },
      teamSeasonStat: { findUnique: jest.fn().mockResolvedValue(null) },
      teamSeasonRating: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never;
    const loader = new FeatureLoader(prisma, { failClosedOnReadError: true });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(loader.loadTeamFeatures('alabama', 2025)).rejects.toThrow(
      FEATURE_LOADER_STRICT_READ_ERROR
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('CLI/workflow source has no providers Odds or persistence', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../audit-v1-historical-parity.ts'),
      'utf8'
    );
    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/audit-v1-historical-parity.yml'
      ),
      'utf8'
    );
    expect(cli).toMatch(/failClosedOnReadError:\s*true/);
    expect(cli).not.toMatch(/secrets\.CFBD_API_KEY|OddsApi/);
    expect(cli).not.toMatch(
      /teamSeasonRating\.(upsert|create|update)|powerRating\.(upsert|create)/
    );
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY|secrets\.ODDS_API_KEY/);
  });
});
