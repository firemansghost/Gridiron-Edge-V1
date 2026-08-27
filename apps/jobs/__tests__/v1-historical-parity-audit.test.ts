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
import {
  COMPARISON_SEASON,
  DOCUMENTED_2026_TALENT_ONLY_PREVIEW_COUNT,
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

const FBS = ['alabama', 'ohio-state', 'toledo', 'app-state'];

function featuresForFbs(
  overrides: Partial<
    Record<string, ReturnType<typeof buildMissingStatsFeatures>>
  > = {}
) {
  return FBS.map((teamId, i) => {
    if (overrides[teamId]) return overrides[teamId]!;
    return buildMissingStatsFeatures({
      teamId,
      season: COMPARISON_SEASON,
      talentComposite: 700 + i * 10,
      blueChipsPct: null,
      commitsSignal: null,
      weeksPlayed: 8,
    });
  });
}

function conferenceMapForFbs() {
  return new Map<string, string | null>([
    ['alabama', 'SEC'],
    ['ohio-state', 'Big Ten'],
    ['toledo', 'Mid-American'],
    ['app-state', 'Sun Belt'],
  ]);
}

function healthyInput(
  overrides: Partial<V1HistoricalParityInput> = {}
): V1HistoricalParityInput {
  const modelConfig = getModelConfig('v1');
  const allFeatures = featuresForFbs();
  const conferenceMap = conferenceMapForFbs();
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
  // Non-FBS pollution row — must be excluded from FBS parity population
  persistedV1Rows.push({
    teamId: 'some-fcs-team',
    season: COMPARISON_SEASON,
    modelVersion: 'v1',
    powerRating: 99,
    confidence: 0.5,
    dataSource: 'season_only',
    games: 10,
  });

  return {
    comparisonSeason: COMPARISON_SEASON,
    fbsIds: [...FBS],
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

describe('V1 historical parity audit', () => {
  it('exact 2025 FBS set + feature vector required', () => {
    const input = healthyInput({
      allFeatures: featuresForFbs().slice(0, 3),
    });
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.findings.join(' ')).toMatch(/featureVectorExactFbsSet/);
  });

  it('non-FBS persisted rows excluded from parity population', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.persistedV1TotalCount).toBe(FBS.length + 1);
    expect(result.persistedV1NonFbsCount).toBe(1);
    expect(result.persistedV1FbsCount).toBe(FBS.length);
    expect(result.comparedCount).toBe(FBS.length);
  });

  it('current replay uses shared computeV1SeasonRatings', () => {
    const input = healthyInput();
    const direct = computeV1SeasonRatings({
      season: COMPARISON_SEASON,
      allFeatures: input.allFeatures,
      conferenceMap: input.conferenceMap,
      modelConfig: input.modelConfig,
    });
    const result = buildV1HistoricalParityAudit(input);
    expect(result.ok).toBe(true);
    expect(result.replayRatingCount).toBe(direct.length);
    expect(result.exactMatchCount).toBe(FBS.length);
    expect(result.historicalParity).toBe(true);
    expect(result.currentFormulaReproducesPersisted2025).toBe(true);
  });

  it('persisted/replay exact-match fixture', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.exactMatchCount).toBe(result.comparedCount);
    expect(result.maxAbsDelta).toBeCloseTo(0, 9);
    expect(result.rmse).toBeCloseTo(0, 9);
  });

  it('mismatch metrics correct', () => {
    const input = healthyInput();
    const rows = input.persistedV1Rows.map((r) =>
      r.teamId === 'alabama'
        ? { ...r, powerRating: (r.powerRating as number) + 2.5 }
        : r
    );
    const result = buildV1HistoricalParityAudit({
      ...input,
      persistedV1Rows: rows,
    });
    expect(result.ok).toBe(true);
    expect(result.exactMatchCount).toBe(FBS.length - 1);
    expect(result.within1).toBe(FBS.length - 1);
    expect(result.within3).toBe(FBS.length);
    expect(result.over5).toBe(0);
    expect(result.maxAbsDelta).toBeCloseTo(2.5, 9);
    expect(result.meanAbsDelta).toBeCloseTo(2.5 / FBS.length, 9);
    expect(result.historicalParity).toBe(false);
    expect(result.currentFormulaReproducesPersisted2025).toBe(false);
  });

  it('CURRENT counterfactual matches shared current formula exactly', () => {
    const input = healthyInput();
    const result = buildV1HistoricalParityAudit(input);
    const current = result.counterfactuals.find((c) => c.kind === 'CURRENT')!;
    expect(current.exactMatchCount).toBe(FBS.length);
    expect(current.mae).toBeCloseTo(0, 9);
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
  });

  it('POST_CAL and NO_CONFERENCE formulas calculated correctly', () => {
    const r = computeV1SeasonRatings({
      season: COMPARISON_SEASON,
      allFeatures: featuresForFbs(),
      conferenceMap: conferenceMapForFbs(),
      modelConfig: getModelConfig('v1'),
    })[0];
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

  it('no counterfactual persists; authorizations false', () => {
    const result = buildV1HistoricalParityAudit(healthyInput());
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.providersInvoked).toBe(false);
    expect(result.oddsInvoked).toBe(false);
    expect(result.scaledConferenceCounterfactualAvailable).toBe(false);
  });

  it('no formula/config constants modified', () => {
    const v1 = getModelConfig('v1');
    expect(v1.calibration_factor).toBe(8.0);
    expect(v1.hfa).toBe(2.0);
    expect(v1.talent_weights?.w_talent).toBe(1.0);
    expect(v1.talent_weights?.w_blue).toBe(0.3);
    expect(v1.talent_weights?.w_commits).toBe(0.15);
    expect(CONFERENCE_ADJUSTMENTS.SEC).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['Mid-American']).toBe(-3.5);
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

  it('raw exceptions sanitized', () => {
    expect(
      sanitizeV1HistoricalParityError(
        new Error('postgresql://user:password@host/db')
      )
    ).not.toContain('postgresql://');
    expect(
      sanitizeV1HistoricalParityError(
        new Error('postgresql://user:password@host/db')
      )
    ).not.toContain('password');
  });
});

describe('read-only store and FeatureLoader strict', () => {
  it('no mutation methods in forensic store', () => {
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
        'createMany',
        'writeTeamSeasonRating',
      ])
    );
    void createPrismaV1HistoricalParityReadStore;
  });

  it('strict FeatureLoader throws on read failure without substituting null', async () => {
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
    expect(cli).toMatch(/CFBD_API_KEY=not provided/);
    expect(cli).not.toMatch(/secrets\.CFBD_API_KEY|OddsApi/);
    expect(cli).not.toMatch(
      /teamSeasonRating\.(upsert|create|update)|powerRating\.(upsert|create)/
    );
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY|secrets\.ODDS_API_KEY/);
    expect(wf).toMatch(/DIRECT_URL/);
  });
});
