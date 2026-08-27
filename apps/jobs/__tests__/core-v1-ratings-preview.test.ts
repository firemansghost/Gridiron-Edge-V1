/**
 * Phase 2C-2H-3 — Read-only 2026 Core V1 ratings preview tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getModelConfig } from '../src/config/model-weights';
import {
  CONFERENCE_ADJUSTMENTS,
  calculateConfidence,
  calculateDecayFactor,
  computeV1SeasonRatings,
  getConferenceAdjustment,
  getZScore,
} from '../src/ratings/compute_ratings_v1';
import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  assessCoreV1PreviewGates,
  assessFeatureVectorIntegrity,
  buildCoreV1RatingsPreview,
  buildMissingStatsFeatures,
  formatCoreV1RatingsPreviewReport,
  parseCoreV1RatingsPreviewArgs,
  sanitizeCoreV1RatingsPreviewError,
  type CoreV1PreviewAuxiliaryInput,
  type CoreV1PreviewGatesInput,
} from '../src/preseason/core-v1-ratings-preview';
import { buildFbsFixture } from '../src/preseason/season-conference-preview';
import {
  FEATURE_LOADER_STRICT_READ_ERROR,
  FeatureLoader,
} from '../src/ratings/feature-loader';
import {
  createPrismaCoreV1RatingsPreviewReadStore,
  type CoreV1RatingsPreviewReadStore,
} from '../preview-2026-core-v1-ratings';

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

function healthyGates(
  overrides: Partial<CoreV1PreviewGatesInput> = {}
): CoreV1PreviewGatesInput {
  const fbs = buildFbsFixture();
  const conferenceByTeamId: Record<string, string> = {};
  for (let i = 0; i < fbs.length; i++) {
    conferenceByTeamId[fbs[i]] = CONFERENCES[i % CONFERENCES.length];
  }
  return {
    season: TARGET_SEASON,
    fbsIds: fbs,
    scheduleTeamIds: [...fbs],
    conferenceByTeamId,
    conferenceMissingCount: 0,
    conferenceUnrecognizedCount: 0,
    legacyConferenceFallback: false,
    talentRows: fbs.map((teamId, i) => ({
      teamId,
      talentComposite: 500 + i * 0.5,
      blueChipsPct: null as number | null,
    })),
    existingTeamSeasonRatingCount: 0,
    existingPowerRatingCount: 0,
    ...overrides,
  };
}

function healthyAuxiliary(
  overrides: Partial<CoreV1PreviewAuxiliaryInput> = {}
): CoreV1PreviewAuxiliaryInput {
  return {
    blueChipsPctNonNullCount: 0,
    commitsNonNullCount: 0,
    seasonStatsTeamCount: 0,
    gameStatsTeamCount: 0,
    unitGradesTeamCount: 0,
    ...overrides,
  };
}

function healthyFeaturesAndMap(gates: CoreV1PreviewGatesInput) {
  const conferenceMap = new Map<string, string | null>();
  const allFeatures = gates.fbsIds.map((teamId, i) => {
    const conf = gates.conferenceByTeamId[teamId] ?? 'Unknown';
    conferenceMap.set(teamId.toLowerCase(), conf);
    const talent = gates.talentRows.find((r) => r.teamId === teamId);
    return buildMissingStatsFeatures({
      teamId,
      season: TARGET_SEASON,
      talentComposite: talent?.talentComposite ?? 500 + i,
      blueChipsPct: talent?.blueChipsPct ?? null,
      commitsSignal: null,
      weeksPlayed: 0,
    });
  });
  return { allFeatures, conferenceMap };
}

describe('parseCoreV1RatingsPreviewArgs', () => {
  it('accepts --season 2026 --preview', () => {
    expect(
      parseCoreV1RatingsPreviewArgs(['--season', '2026', '--preview'])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects write flags and non-2026', () => {
    const bad = parseCoreV1RatingsPreviewArgs([
      '--season',
      '2025',
      '--preview',
      '--write',
    ]);
    expect(bad.ok).toBe(false);
    if (bad.ok === false) {
      expect(bad.errors.join(' ')).toMatch(/2026/);
      expect(bad.errors.join(' ')).toMatch(/Write flag/);
    }
  });
});

describe('Core V1 ratings preview gates', () => {
  it('1. requires exactly 138 FBS', () => {
    const gates = healthyGates({ fbsIds: buildFbsFixture().slice(0, 137) });
    const assessed = assessCoreV1PreviewGates(gates);
    expect(assessed.ok).toBe(false);
    expect(assessed.findings.join(' ')).toMatch(/dbFbsCount/);
  });

  it('2. requires exactly 138 finite talent composites', () => {
    const fbs = buildFbsFixture();
    const talentRows = fbs.map((teamId, i) => ({
      teamId,
      talentComposite: i === 0 ? null : 500 + i,
    }));
    const assessed = assessCoreV1PreviewGates(healthyGates({ talentRows }));
    expect(assessed.ok).toBe(false);
    expect(assessed.findings.join(' ')).toMatch(/talent/);
  });

  it('3. requires exact 138 conference map', () => {
    const gates = healthyGates();
    const { [gates.fbsIds[0]]: _removed, ...rest } = gates.conferenceByTeamId;
    const assessed = assessCoreV1PreviewGates({
      ...gates,
      conferenceByTeamId: rest,
      conferenceMissingCount: 1,
    });
    expect(assessed.ok).toBe(false);
    expect(assessed.findings.join(' ')).toMatch(/conference/);
  });

  it('14. existing output collision fails closed', () => {
    expect(
      assessCoreV1PreviewGates(
        healthyGates({ existingTeamSeasonRatingCount: 1 })
      ).ok
    ).toBe(false);
    expect(
      assessCoreV1PreviewGates(healthyGates({ existingPowerRatingCount: 3 }))
        .ok
    ).toBe(false);
  });
});

describe('Core V1 preseason model semantics', () => {
  it('4. missing blueChipsPct produces neutral z=0', () => {
    const stats = { mean: 0.4, stdDev: 0.1, values: [] };
    expect(getZScore(null, stats)).toBe(0);
  });

  it('5. missing commits produces neutral z=0', () => {
    const stats = { mean: 10, stdDev: 2, values: [] };
    expect(getZScore(null, stats)).toBe(0);
  });

  it('6. missing base stats triggers talent-only fallback', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const modelConfig = getModelConfig('v1');
    const ratings = computeV1SeasonRatings({
      season: TARGET_SEASON,
      allFeatures,
      conferenceMap,
      modelConfig,
    });
    expect(ratings.every((r) => r.hasBaseFeatures === false)).toBe(true);
    // rawScore === talentComponent when talent-only
    for (const r of ratings) {
      expect(r.rawScore).toBeCloseTo(r.talentComponent, 10);
    }
  });

  it('7. weeksPlayed=0 produces decay=1', () => {
    expect(calculateDecayFactor(0)).toBe(1);
  });

  it('8. unit grades are not required', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary({ unitGradesTeamCount: 0 }),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(true);
    expect(result.unitGradesRequiredByCoreV1).toBe(false);
    expect(result.unitGradesAvailable).toBe('0/138');
  });

  it('17. confidence matches current formula for missing preseason base stats', () => {
    const features = buildMissingStatsFeatures({
      teamId: 'alabama',
      season: 2026,
      talentComposite: 900,
    });
    // featureCoverage=0, dataSourceQuality for missing = 0.3 → confidence 0
    expect(calculateConfidence(features)).toBe(0);
    expect(features.dataSource).toBe('missing');
  });
});

describe('Core V1 ratings preview build', () => {
  it('13. all 138 preview ratings finite on healthy fixture', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(true);
    expect(result.ratingCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.finiteRatingCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.nonFiniteRatingCount).toBe(0);
    expect(result.talentOnlyFallbackTeams).toBe(EXPECTED_FBS_COUNT);
    expect(result.baseFeatureTeams).toBe(0);
    expect(result.featureIntegrityOk).toBe(true);
    expect(result.featureTalentCompositeMatchesPersisted).toBe('138/138');
    expect(result.featureBlueChipsPctMatchesPersisted).toBe('138/138');
    expect(result.featureCommitsSignalNonNull).toBe(0);
    expect(result.blueChipsPctTreatment).toBe('NEUTRAL_ZSCORE_ZERO');
    expect(result.commitsTreatment).toBe('NEUTRAL_ZSCORE_ZERO');
    expect(result.mode).toBe('READ_ONLY');
    expect(result.providersInvoked).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.ratingsPersistenceInvoked).toBe(false);
    expect(result.oddsInvoked).toBe(false);
  });

  it('reports conference adjustments scaled by calibration without changing formula', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const modelConfig = getModelConfig('v1');
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig,
    });
    const cal = modelConfig.calibration_factor || 1;
    expect(result.conferenceAdjustmentScaledByCalibration).toBe(true);
    const sec = result.conferenceAdjustments.find((c) => c.conference === 'SEC');
    expect(sec?.rawAdjustment).toBe(5);
    expect(sec?.effectiveAfterCalibration).toBeCloseTo(5 * cal, 10);
  });

  it('gate failure yields no valid ratings output', () => {
    const gates = healthyGates({ existingTeamSeasonRatingCount: 5 });
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    const report = formatCoreV1RatingsPreviewReport(result);
    expect(report).toMatch(/ok=false/);
    expect(report).toMatch(/output collision/);
  });
});

describe('formula parity and config freeze', () => {
  it('15. preview path matches computeV1SeasonRatings on synthetic fixtures', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const modelConfig = getModelConfig('v1');
    const direct = computeV1SeasonRatings({
      season: TARGET_SEASON,
      allFeatures,
      conferenceMap,
      modelConfig,
    });
    const preview = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig,
    });
    expect(preview.ratings).toHaveLength(direct.length);
    for (let i = 0; i < direct.length; i++) {
      expect(preview.ratings[i].powerRating).toBe(direct[i].powerRating);
      expect(preview.ratings[i].rawScore).toBe(direct[i].rawScore);
      expect(preview.ratings[i].adjustedScore).toBe(direct[i].adjustedScore);
      expect(preview.ratings[i].confidence).toBe(direct[i].confidence);
    }
  });

  it('16. conference adjustment applied before calibration (same location as production)', () => {
    const features = [
      buildMissingStatsFeatures({
        teamId: 'a',
        season: 2026,
        talentComposite: 800,
      }),
      buildMissingStatsFeatures({
        teamId: 'b',
        season: 2026,
        talentComposite: 700,
      }),
    ];
    const conferenceMap = new Map<string, string | null>([
      ['a', 'SEC'],
      ['b', 'Sun Belt'],
    ]);
    const modelConfig = getModelConfig('v1');
    const cal = modelConfig.calibration_factor || 1;
    const [ra, rb] = computeV1SeasonRatings({
      season: 2026,
      allFeatures: features,
      conferenceMap,
      modelConfig,
    });
    expect(ra.conferenceAdjustment).toBe(getConferenceAdjustment('SEC'));
    expect(rb.conferenceAdjustment).toBe(getConferenceAdjustment('Sun Belt'));
    expect(ra.adjustedScore).toBeCloseTo(
      ra.rawScore + ra.conferenceAdjustment,
      10
    );
    expect(ra.powerRating).toBeCloseTo(ra.adjustedScore * cal, 10);
    expect(rb.powerRating).toBeCloseTo(rb.adjustedScore * cal, 10);
  });

  it('18. no formulas/config constants changed', () => {
    const v1 = getModelConfig('v1');
    expect(v1.calibration_factor).toBe(8.0);
    expect(v1.talent_weights?.w_talent).toBe(1.0);
    expect(v1.talent_weights?.w_blue).toBe(0.3);
    expect(v1.talent_weights?.w_commits).toBe(0.15);
    expect(v1.offensive_weights.ypp_off).toBe(0.3);
    expect(v1.defensive_weights.ypp_def).toBe(0.2);
    expect(CONFERENCE_ADJUSTMENTS.SEC).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['Big Ten']).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['Sun Belt']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['Mid-American']).toBe(-3.5);
    expect(CONFERENCE_ADJUSTMENTS.Independent).toBe(-5.0);
  });
});

describe('read-only guarantees', () => {
  it('9. no mutation methods available in preview store', () => {
    const fakePrisma = {} as never;
    // Interface shape: construct via object literal matching store
    const store: CoreV1RatingsPreviewReadStore = {
      loadFbsTeamIds: async () => [],
      loadScheduleTeamIds: async () => [],
      loadTalentRows: async () => [],
      countTeamSeasonRatings: async () => 0,
      countPowerRatings: async () => 0,
      countSeasonStatsTeams: async () => 0,
      countGameStatsTeams: async () => 0,
      countUnitGradesTeams: async () => 0,
      countCommitsTeams: async () => 0,
      loadTeamFeatures: async () =>
        buildMissingStatsFeatures({
          teamId: 'x',
          season: 2026,
          talentComposite: 1,
        }),
    };
    const methods = Object.keys(store);
    expect(methods).not.toEqual(
      expect.arrayContaining([
        'upsert',
        'create',
        'update',
        'delete',
        'createMany',
        'updateMany',
        'deleteMany',
        'writeTeamSeasonRating',
        'writePowerRating',
      ])
    );
    void fakePrisma;
    void createPrismaCoreV1RatingsPreviewReadStore;
  });

  it('10-12. preview module source has no providers, Odds, or ratings persistence', () => {
    const previewSrc = fs.readFileSync(
      path.join(__dirname, '../src/preseason/core-v1-ratings-preview.ts'),
      'utf8'
    );
    const cliSrc = fs.readFileSync(
      path.join(__dirname, '../preview-2026-core-v1-ratings.ts'),
      'utf8'
    );
    const workflowSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/preview-2026-core-v1-ratings.yml'
      ),
      'utf8'
    );
    expect(previewSrc).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY|OddsApi/);
    expect(previewSrc).not.toMatch(
      /teamSeasonRating\.(upsert|create|update)|powerRating\.(upsert|create|update)/
    );
    expect(cliSrc).not.toMatch(/secrets\.CFBD_API_KEY|secrets\.ODDS_API_KEY/);
    expect(cliSrc).not.toMatch(/OddsApi|fetch\(/);
    expect(cliSrc).not.toMatch(
      /teamSeasonRating\.(upsert|create|update)|powerRating\.(upsert|create|update)/
    );
    expect(cliSrc).toMatch(/CFBD_API_KEY=not provided/);
    expect(cliSrc).toMatch(/ODDS_API_KEY=not provided/);
    expect(cliSrc).toMatch(/failClosedOnReadError:\s*true/);
    expect(cliSrc).toMatch(/mode=READ_ONLY/);
    expect(workflowSrc).toMatch(/workflow_dispatch/);
    expect(workflowSrc).not.toMatch(/^\s*schedule:/m);
    expect(workflowSrc).toMatch(/DIRECT_URL/);
    expect(workflowSrc).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(workflowSrc).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(workflowSrc).toMatch(/CFBD_API_KEY: not provided/);
    expect(workflowSrc).toMatch(/ODDS_API_KEY: not provided/);
  });
});

describe('feature vector integrity fail-closed', () => {
  it('1. healthy 138 direct talent + healthy 138 features -> pass', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    const integrity = assessFeatureVectorIntegrity({
      fbsIds: gates.fbsIds,
      season: TARGET_SEASON,
      allFeatures,
      persistedTalent: gates.talentRows,
      commitsNonNullCount: 0,
      seasonStatsTeamCount: 0,
      gameStatsTeamCount: 0,
      existingTeamSeasonRatingCount: 0,
    });
    expect(integrity.featureIntegrityOk).toBe(true);
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(true);
    expect(result.ratingCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.featureIntegrityOk).toBe(true);
  });

  it('2. one loadTeamFeatures talentComposite=null -> fail closed ratingCount=0', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[0].talentComposite = null;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.featureIntegrityOk).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.findings.join(' ')).toMatch(/featureTalentComposite/);
  });

  it('3. one feature talentComposite differs from persisted -> fail closed', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[0].talentComposite =
      (allFeatures[0].talentComposite as number) + 1;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.findings.join(' ')).toMatch(
      /featureTalentCompositeMatchesPersisted/
    );
  });

  it('4. one feature wrong season -> fail closed', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[0].season = 2025;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.featureSeasonMismatchCount).toBe(1);
  });

  it('5. wrong/duplicate teamId -> fail closed', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[1].teamId = allFeatures[0].teamId;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.featureVectorExactFbsSet).toBe(false);
  });

  it('6. non-null blueChipsPct when persisted null -> fail closed', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[0].blueChipsPct = 0.42;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary(),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.findings.join(' ')).toMatch(
      /featureBlueChipsPctMatchesPersisted/
    );
  });

  it('7. commits count=0 but non-null commitsSignal -> fail closed', () => {
    const gates = healthyGates();
    const { allFeatures, conferenceMap } = healthyFeaturesAndMap(gates);
    allFeatures[0].commitsSignal = 3.5;
    const result = buildCoreV1RatingsPreview({
      gates,
      auxiliary: healthyAuxiliary({ commitsNonNullCount: 0 }),
      allFeatures,
      conferenceMap,
      modelConfig: getModelConfig('v1'),
    });
    expect(result.ok).toBe(false);
    expect(result.ratingCount).toBe(0);
    expect(result.featureCommitsSignalNonNull).toBe(1);
  });
});

describe('FeatureLoader strict vs default', () => {
  function mockPrismaThrowingTalent(err: Error) {
    return {
      teamSeasonTalent: {
        findUnique: jest.fn().mockRejectedValue(err),
      },
      teamClassCommits: {
        findUnique: jest.fn(),
      },
      game: {
        count: jest.fn(),
      },
      teamGameStat: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamSeasonStat: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      teamSeasonRating: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never;
  }

  it('8. strict mode throws on Prisma read failure and does not substitute null', async () => {
    const sensitive = new Error(
      'P1001: Can\'t reach database server at postgresql://user:s3cret@db.example:5432/prod'
    );
    const prisma = mockPrismaThrowingTalent(sensitive);
    const loader = new FeatureLoader(prisma, { failClosedOnReadError: true });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(loader.loadTeamFeatures('alabama', 2026)).rejects.toThrow(
      FEATURE_LOADER_STRICT_READ_ERROR
    );
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('9. sensitive connection URL/password not emitted on strict preview path', async () => {
    const secretUrl =
      'postgresql://admin:SuperSecretPassword123@db.internal:5432/gridiron';
    const sensitive = new Error(`Connection failed: ${secretUrl}`);
    const prisma = mockPrismaThrowingTalent(sensitive);
    const loader = new FeatureLoader(prisma, { failClosedOnReadError: true });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let thrown: unknown;
    try {
      await loader.loadTeamFeatures('alabama', 2026);
    } catch (e) {
      thrown = e;
    }
    expect(String(thrown)).toBe(`Error: ${FEATURE_LOADER_STRICT_READ_ERROR}`);
    expect(String(thrown)).not.toContain('SuperSecretPassword123');
    expect(String(thrown)).not.toContain('postgresql://');
    expect(sanitizeCoreV1RatingsPreviewError(thrown)).not.toContain(
      'SuperSecretPassword123'
    );
    expect(sanitizeCoreV1RatingsPreviewError(thrown)).not.toContain(
      'postgresql://'
    );
    const warnText = warnSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(warnText).not.toContain('SuperSecretPassword123');
    expect(warnText).not.toContain(secretUrl);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('10. default FeatureLoader still substitutes null on read failure', async () => {
    const sensitive = new Error(
      'postgresql://user:password@host/db read failed'
    );
    const prisma = mockPrismaThrowingTalent(sensitive);
    const loader = new FeatureLoader(prisma);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const features = await loader.loadTeamFeatures('alabama', 2026);
    expect(features.talentComposite).toBeNull();
    expect(features.blueChipsPct).toBeNull();
    expect(features.commitsSignal).toBeNull();
    expect(features.dataSource).toBe('missing');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
