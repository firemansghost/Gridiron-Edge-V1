/**
 * Phase 2C-2H-5 — Balanced V1 historical parity forensic tests.
 * No network. No production DB. No providers. No Odds. No ratings persistence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildBaseFbsFixture } from '../src/preseason/fbs-membership-init';
import {
  BALANCED_V1_CALIBRATION_FACTOR,
  BALANCED_V1_UPSERT_UPDATE_FIELDS,
  BALANCED_V1_UPSERT_UPDATE_LEAVES_UNCHANGED,
  BALANCED_WEIGHT_EPA,
  BALANCED_WEIGHT_NET_POINTS,
  BALANCED_WEIGHT_TALENT,
  BALANCED_WEIGHT_WIN_PCT,
  BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA,
  COMPARISON_SEASON,
  CORE_V1_SPREAD_BALANCED_SEMANTICS,
  EXPECTED_2025_FBS_COUNT,
  LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION,
  buildBalancedV1HistoricalParityAudit,
  parseBalancedV1HistoricalParityArgs,
  sanitizeBalancedV1HistoricalParityError,
  type BalancedV1HistoricalParityInput,
  type PersistedV1RatingRow,
} from '../src/preseason/balanced-v1-historical-parity-audit';
import {
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
  buildBalancedTeamMetrics,
  computeBalancedV1Ratings,
  type BalancedEpaStatRow,
  type BalancedGameRow,
  type BalancedTalentRow,
} from '../src/ratings/compute_balanced_v1';
import {
  createPrismaBalancedV1HistoricalParityReadStore,
  type BalancedV1HistoricalParityReadStore,
} from '../audit-balanced-v1-historical-parity';

function buildFixtureInput(
  options: {
    fbsIds?: string[];
    includePollution?: boolean;
    mismatchPersisted?: boolean;
    dropOnePersisted?: boolean;
    omitEpaForFirst?: boolean;
  } = {}
): {
  input: BalancedV1HistoricalParityInput;
  replayPowers: Map<string, number>;
} {
  const fbs = options.fbsIds ?? buildBaseFbsFixture(EXPECTED_2025_FBS_COUNT);
  const fbsLower = fbs.map((id) => id.toLowerCase());

  const talentRows: BalancedTalentRow[] = fbsLower.map((teamId, i) => ({
    teamId,
    talentComposite: 400 + i * 2,
  }));

  // Pair adjacent FBS teams into final games so every team has >=1 game.
  const finalGames: BalancedGameRow[] = [];
  for (let i = 0; i < fbsLower.length; i += 2) {
    const home = fbsLower[i];
    const away = fbsLower[(i + 1) % fbsLower.length];
    finalGames.push({
      homeTeamId: home,
      awayTeamId: away,
      homeScore: 28 + (i % 20),
      awayScore: 21 + (i % 15),
    });
  }
  // Non-FBS pollution game — must be excluded
  finalGames.push({
    homeTeamId: fbsLower[0],
    awayTeamId: 'some-fcs-opponent',
    homeScore: 50,
    awayScore: 0,
  });

  const epaStatRows: BalancedEpaStatRow[] = [];
  for (let i = 0; i < fbsLower.length; i++) {
    if (options.omitEpaForFirst && i === 0) continue;
    epaStatRows.push({
      teamId: fbsLower[i],
      epaOff: 0.1 + i * 0.001,
      epaDef: -0.05 + i * 0.0005,
    });
  }

  const gameAggregates = aggregateBalancedGameStats(
    finalGames,
    new Set(fbsLower)
  );
  const epaByTeam = aggregateBalancedEpa(epaStatRows);
  const built = buildBalancedTeamMetrics({
    fbsTeamIds: fbsLower,
    talentRows,
    gameAggregates,
    epaByTeam,
  });
  const replay = computeBalancedV1Ratings(built.metrics);
  const replayPowers = new Map(
    replay.map((r) => [r.teamId, r.powerRating] as const)
  );

  const persistedV1Rows: PersistedV1RatingRow[] = replay.map((r, idx) => ({
    teamId: r.teamId,
    season: COMPARISON_SEASON,
    modelVersion: 'v1',
    powerRating: options.mismatchPersisted
      ? r.powerRating + (idx % 2 === 0 ? 10 : -3)
      : r.powerRating,
    confidence: 0.5,
    // Legacy metadata left on UPDATE — typical production fingerprint
    dataSource: 'game+season',
    games: r.games,
    offenseRating: 1.23,
    defenseRating: -0.45,
  }));

  if (options.dropOnePersisted && persistedV1Rows.length > 0) {
    persistedV1Rows.pop();
  }

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
    input: {
      comparisonSeason: COMPARISON_SEASON,
      fbsIds: [...fbs],
      persistedV1Rows,
      talentRows,
      finalGames,
      epaStatRows,
    },
    replayPowers,
  };
}

describe('Balanced V1 historical parity forensic', () => {
  it('requires exact 136 FBS', () => {
    const { input } = buildFixtureInput({
      fbsIds: buildBaseFbsFixture(135),
      includePollution: false,
    });
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.includes('136'))).toBe(true);
  });

  it('requires exact 136 persisted finite V1 rows', () => {
    const { input } = buildFixtureInput({ dropOnePersisted: true });
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.ok).toBe(false);
    expect(result.persistedPowerFinite).toBe(135);
    expect(result.balancedHistoricalParity).toBe(false);
  });

  it('shared pure Balanced formula matches 25/25/25/25 × 14.0', () => {
    expect(BALANCED_WEIGHT_TALENT).toBe(0.25);
    expect(BALANCED_WEIGHT_EPA).toBe(0.25);
    expect(BALANCED_WEIGHT_NET_POINTS).toBe(0.25);
    expect(BALANCED_WEIGHT_WIN_PCT).toBe(0.25);
    expect(BALANCED_V1_CALIBRATION_FACTOR).toBe(14.0);

    const metrics = [
      {
        teamId: 'a',
        teamName: 'A',
        talentScore: 100,
        epaOverall: 1,
        netPointsPerGame: 10,
        winPct: 1,
        gamesPlayed: 10,
      },
      {
        teamId: 'b',
        teamName: 'B',
        talentScore: 0,
        epaOverall: -1,
        netPointsPerGame: -10,
        winPct: 0,
        gamesPlayed: 10,
      },
    ];
    const ratings = computeBalancedV1Ratings(metrics);
    // zComposite = equal-weight mean of z-scores; power = z * 14
    for (const r of ratings) {
      const expectedZ =
        r.talentZ * 0.25 +
        r.epaZ * 0.25 +
        r.netPointsZ * 0.25 +
        r.winPctZ * 0.25;
      expect(r.zComposite).toBeCloseTo(expectedZ, 12);
      expect(r.powerRating).toBeCloseTo(expectedZ * 14.0, 12);
      expect(r.calibrationFactor).toBe(14.0);
    }
  });

  it('preserves talentZ / EPA / net points / winPct calculations', () => {
    const games: BalancedGameRow[] = [
      {
        homeTeamId: 't1',
        awayTeamId: 't2',
        homeScore: 30,
        awayScore: 10,
      },
    ];
    const agg = aggregateBalancedGameStats(games, new Set(['t1', 't2']));
    expect(agg.get('t1')!.wins).toBe(1);
    expect(agg.get('t1')!.pointsFor).toBe(30);
    expect(agg.get('t2')!.pointsAgainst).toBe(30);

    const epa = aggregateBalancedEpa([
      { teamId: 't1', epaOff: 0.4, epaDef: 0.1 },
      { teamId: 't1', epaOff: 0.6, epaDef: 0.3 },
    ]);
    const built = buildBalancedTeamMetrics({
      fbsTeamIds: ['t1', 't2'],
      talentRows: [
        { teamId: 't1', talentComposite: 500 },
        { teamId: 't2', talentComposite: 400 },
      ],
      gameAggregates: agg,
      epaByTeam: epa,
    });
    const t1 = built.metrics.find((m) => m.teamId === 't1')!;
    expect(t1.winPct).toBe(1);
    expect(t1.netPointsPerGame).toBe(20);
    expect(t1.avgEpaOff).toBeCloseTo(0.5, 12);
    expect(t1.avgEpaDef).toBeCloseTo(0.2, 12);
    expect(t1.epaOverall).toBeCloseTo(0.3, 12);
    expect(t1.talentScore).toBe(500);
  });

  it('preserves missing EPA → avgEpaOff=0, avgEpaDef=0', () => {
    const { input } = buildFixtureInput({ omitEpaForFirst: true });
    const result = buildBalancedV1HistoricalParityAudit(input);
    const firstId = [...input.fbsIds].map((id) => id.toLowerCase()).sort()[0];
    // teamInputs sorted by teamId — find the omitted-EPA team (fbs[0])
    const omitted = input.fbsIds[0].toLowerCase();
    const row = result.teamInputs.find((t) => t.teamId === omitted)!;
    expect(row.avgEpaOff).toBe(0);
    expect(row.avgEpaDef).toBe(0);
    expect(row.epaOverall).toBe(0);
    expect(result.epaCoverage.missingEpaCount).toBeGreaterThanOrEqual(1);
    void firstId;
  });

  it('excludes non-FBS games exactly as writer does', () => {
    const fbs = new Set(['alpha', 'beta']);
    const games: BalancedGameRow[] = [
      {
        homeTeamId: 'alpha',
        awayTeamId: 'beta',
        homeScore: 21,
        awayScore: 14,
      },
      {
        homeTeamId: 'alpha',
        awayTeamId: 'fcs',
        homeScore: 70,
        awayScore: 0,
      },
    ];
    const agg = aggregateBalancedGameStats(games, fbs);
    expect(agg.get('alpha')!.games).toBe(1);
    expect(agg.get('alpha')!.pointsFor).toBe(21);
    expect(agg.has('fcs')).toBe(false);
  });

  it('exact parity when persisted matches Balanced replay', () => {
    const { input } = buildFixtureInput();
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.ok).toBe(true);
    expect(result.replayCount).toBe(136);
    expect(result.exactMatchCount).toBe(136);
    expect(result.balancedHistoricalParity).toBe(true);
    expect(result.balancedCurrentFormulaReproducesPersisted2025).toBe(true);
    expect(result.mae).toBeCloseTo(0, 9);
    expect(result.persistedV1NonFbsCount).toBe(1);
  });

  it('parity metrics correct on mismatches; structural ok still possible', () => {
    const { input } = buildFixtureInput({ mismatchPersisted: true });
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.ok).toBe(true);
    expect(result.exactMatchCount).toBe(0);
    expect(result.balancedHistoricalParity).toBe(false);
    expect(result.balancedCurrentFormulaReproducesPersisted2025).toBe(false);
    expect(result.over5).toBeGreaterThan(0);
    expect(result.mae).not.toBeNull();
    expect(result.mae!).toBeGreaterThan(0);
    expect(result.topMismatches.length).toBeLessThanOrEqual(20);
    expect(result.topMismatches[0]).toMatchObject({
      calibrationFactor: 14.0,
    });
  });

  it('excludes non-FBS persisted pollution from parity set', () => {
    const { input } = buildFixtureInput({ includePollution: true });
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.persistedV1NonFbsCount).toBe(1);
    expect(result.comparedCount).toBe(136);
    expect(result.comparedTeamSetExact).toBe(true);
  });

  it('read-only store has no mutation methods', () => {
    const keys = [
      'loadFbsTeamIds',
      'loadPersistedV1Ratings',
      'loadTalentRows',
      'loadFinalGames',
      'loadEpaStatRows',
    ] as const;
    const store: BalancedV1HistoricalParityReadStore = {
      async loadFbsTeamIds() {
        return [];
      },
      async loadPersistedV1Ratings() {
        return [];
      },
      async loadTalentRows() {
        return [];
      },
      async loadFinalGames() {
        return [];
      },
      async loadEpaStatRows() {
        return [];
      },
    };
    for (const k of keys) expect(typeof store[k]).toBe('function');
    const forbiddenExact = [
      'create',
      'update',
      'upsert',
      'delete',
      'persist',
      'write',
      'insert',
      'save',
    ];
    const names = Object.keys(store).map((n) => n.toLowerCase());
    for (const f of forbiddenExact) {
      expect(names).not.toContain(f);
      expect(names.some((n) => n.startsWith(f) || n.endsWith(f))).toBe(false);
    }
    expect(names.every((n) => n.startsWith('load'))).toBe(true);
    expect(typeof createPrismaBalancedV1HistoricalParityReadStore).toBe(
      'function'
    );
  });

  it('documents writer UPDATE leaves legacy metadata', () => {
    expect([...BALANCED_V1_UPSERT_UPDATE_FIELDS]).toEqual([
      'powerRating',
      'rating',
      'games',
    ]);
    expect([...BALANCED_V1_UPSERT_UPDATE_LEAVES_UNCHANGED]).toEqual([
      'offenseRating',
      'defenseRating',
      'confidence',
      'dataSource',
    ]);
    expect(BALANCED_WRITER_CAN_LEAVE_LEGACY_METADATA).toBe(true);

    const writerSrc = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_balanced.ts'),
      'utf8'
    );
    expect(writerSrc).toContain("modelVersion: BALANCED_MODEL_VERSION");
    expect(writerSrc).toMatch(/powerRating:\s*rating\.powerRating/);
    expect(writerSrc).toMatch(/games:\s*rating\.games/);
    // UPDATE block must not set offense/defense/confidence/dataSource
    const updateMatch = writerSrc.match(
      /if \(existing\) \{[\s\S]*?await prisma\.teamSeasonRating\.update\([\s\S]*?\}\);/
    );
    expect(updateMatch).toBeTruthy();
    const updateBlock = updateMatch![0];
    expect(updateBlock).not.toMatch(/offenseRating:/);
    expect(updateBlock).not.toMatch(/defenseRating:/);
    expect(updateBlock).not.toMatch(/confidence:/);
    expect(updateBlock).not.toMatch(/dataSource:/);
  });

  it('documents core-v1-spread Balanced semantics', () => {
    expect(CORE_V1_SPREAD_BALANCED_SEMANTICS.usesV1PowerRatingsDirectly).toBe(
      true
    );
    expect(CORE_V1_SPREAD_BALANCED_SEMANTICS.additionalScaling).toBe(false);
    expect(CORE_V1_SPREAD_BALANCED_SEMANTICS.coreSpreadHma).toBe(
      'ratingDiff + HFA'
    );
    expect(CORE_V1_SPREAD_BALANCED_SEMANTICS.sourceCommentLabel).toBe(
      'Balanced V1 Power Ratings'
    );

    const spreadSrc = fs.readFileSync(
      path.join(__dirname, '../../web/lib/core-v1-spread.ts'),
      'utf8'
    );
    expect(spreadSrc).toContain('Balanced V1 Power Ratings');
    expect(spreadSrc).toContain('ratingDiff + hfaPoints');
    expect(spreadSrc).toContain('no additional scaling');
  });

  it('classifies compute_ratings_v1 as LEGACY without changing it', () => {
    expect(LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION.deleteAuthorized).toBe(
      false
    );
    expect(
      LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION.renameModelVersionAuthorized
    ).toBe(false);
    expect(
      LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION.formulaChangeAuthorized
    ).toBe(false);
    expect(LEGACY_COMPUTE_RATINGS_V1_CLASSIFICATION.runFor2026Authorized).toBe(
      false
    );
    const src = fs.readFileSync(
      path.join(__dirname, '../src/ratings/compute_ratings_v1.ts'),
      'utf8'
    );
    expect(src).toContain('LEGACY');
  });

  it('cli rejects non-2025; sanitizes secrets', () => {
    expect(parseBalancedV1HistoricalParityArgs([]).ok).toBe(false);
    expect(
      parseBalancedV1HistoricalParityArgs(['--comparison-season', '2026']).ok
    ).toBe(false);
    expect(
      parseBalancedV1HistoricalParityArgs(['--comparison-season', '2025'])
    ).toEqual({ ok: true, comparisonSeason: 2025 });
    expect(
      sanitizeBalancedV1HistoricalParityError(
        new Error('postgres://user:pass@host/db failed')
      )
    ).toContain('[redacted-db-url]');
  });

  it('no providers / Odds / ratings persistence in forensic artifacts', () => {
    const auditSrc = fs.readFileSync(
      path.join(__dirname, '../src/preseason/balanced-v1-historical-parity-audit.ts'),
      'utf8'
    );
    const cliSrc = fs.readFileSync(
      path.join(__dirname, '../audit-balanced-v1-historical-parity.ts'),
      'utf8'
    );
    const wfSrc = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/audit-balanced-v1-historical-parity.yml'
      ),
      'utf8'
    );
    expect(auditSrc).toContain('providersInvoked: false');
    expect(auditSrc).toContain('Odds: false');
    expect(cliSrc).toContain('ratingsPersistenceInvoked=false');
    expect(cliSrc).toContain('CFBD_API_KEY=not provided');
    expect(cliSrc).toContain('ODDS_API_KEY=not provided');
    expect(cliSrc).not.toMatch(/process\.env\.CFBD|process\.env\.ODDS/);
    expect(wfSrc).toContain('workflow_dispatch');
    expect(wfSrc).not.toMatch(/^\s*schedule:/m);
    expect(wfSrc).toContain('CFBD_API_KEY: not provided');
    expect(wfSrc).toContain('ODDS_API_KEY: not provided');
    expect(wfSrc).toContain('writer: compute_ratings_balanced NOT invoked');
    expect(wfSrc).not.toMatch(/npx tsx.*compute_ratings_balanced/);
  });

  it('flags authorization constants false', () => {
    const { input } = buildFixtureInput();
    const result = buildBalancedV1HistoricalParityAudit(input);
    expect(result.ratingsWriteAuthorized).toBe(false);
    expect(result.modelChangeAuthorized).toBe(false);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.providersInvoked).toBe(false);
    expect(result.Odds).toBe(false);
  });
});
