import * as fs from 'fs';
import * as path from 'path';
import {
  buildOa1DevelopmentFeatures,
  computeOa1FeatureRows,
  oa1FingerprintSetSha256,
  type Oa1CanonicalRow,
} from '../src/research/oa-1-opponent-adjusted-efficiency';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = fs.readFileSync(
  path.join(ROOT, 'apps/jobs/build-oa-1-development-features.ts'),
  'utf8'
);
const CONTRACT = fs.readFileSync(
  path.join(
    ROOT,
    'research/opponent-adjustment/OA_1_OPPONENT_ADJUSTED_EFFICIENCY_FEATURE_V1_CONTRACT.md'
  ),
  'utf8'
);

function fp(char: string): string {
  return char.repeat(64);
}

interface SideValues {
  ppaOff: number;
  ppaDef: number;
  successOff: number;
  successDef: number;
}

function gameRows(input: {
  season?: number;
  gameId: string;
  week: number;
  homeId: string;
  awayId: string;
  home?: SideValues;
  away?: SideValues;
  available?: boolean;
  fingerprintChar?: string;
}): Oa1CanonicalRow[] {
  const season = input.season ?? 2022;
  const available = input.available ?? true;
  const homeValues = input.home ?? {
    ppaOff: 0.5,
    ppaDef: 0.5,
    successOff: 0.5,
    successDef: 0.5,
  };
  const awayValues = input.away ?? {
    ppaOff: 0.5,
    ppaDef: 0.5,
    successOff: 0.5,
    successDef: 0.5,
  };
  const nulls = {
    ppaOff: null,
    ppaDef: null,
    successOff: null,
    successDef: null,
  };

  const common = {
    season,
    providerGameId: input.gameId,
    providerWeek: input.week,
    startDate: season + '-09-01T12:00:00.000Z',
    neutralSite: false,
    homeTeamNameCfbd: input.homeId,
    awayTeamNameCfbd: input.awayId,
    availabilityStatus: available ? 'AVAILABLE' : 'SOURCE_UNAVAILABLE',
  };

  return [
    {
      ...common,
      teamNameCfbd: input.homeId,
      opponentNameCfbd: input.awayId,
      teamIdInternal: input.homeId,
      opponentTeamIdInternal: input.awayId,
      isHome: true,
      ...(available ? homeValues : nulls),
      recordFingerprintSha256: fp(input.fingerprintChar ?? 'a'),
    },
    {
      ...common,
      teamNameCfbd: input.awayId,
      opponentNameCfbd: input.homeId,
      teamIdInternal: input.awayId,
      opponentTeamIdInternal: input.homeId,
      isHome: false,
      ...(available ? awayValues : nulls),
      recordFingerprintSha256: fp(input.fingerprintChar ?? 'b'),
    },
  ];
}

describe('OA-1 opponent-adjusted feature math', () => {
  it('emits no-prior-history status for Week 1', () => {
    const rows = gameRows({
      gameId: 'g1',
      week: 1,
      homeId: 'A',
      awayId: 'B',
    });

    const result = computeOa1FeatureRows(rows);
    const game = result.games[0];

    expect(game.home.priorCanonicalGames).toBe(0);
    expect(game.home.raw.ppaOff.status).toBe('NO_PRIOR_FBS_GAMES');
    expect(game.home.opponentAdjusted.ppaOff.status).toBe(
      'NO_PRIOR_FBS_GAMES'
    );
    expect(game.home.opponentAdjusted.ppaOff.n).toBe(0);
  });

  it('uses target-week opponent baselines, excludes source game, and excludes same-week rows', () => {
    const rows = [
      ...gameRows({
        gameId: 'g1',
        week: 1,
        homeId: 'A',
        awayId: 'B',
        home: {
          ppaOff: 1.0,
          ppaDef: 0.5,
          successOff: 0.6,
          successDef: 0.4,
        },
        away: {
          ppaOff: 0.5,
          ppaDef: 1.0,
          successOff: 0.4,
          successDef: 0.6,
        },
      }),
      ...gameRows({
        gameId: 'g2',
        week: 1,
        homeId: 'C',
        awayId: 'D',
        home: {
          ppaOff: 0.7,
          ppaDef: 0.9,
          successOff: 0.5,
          successDef: 0.55,
        },
        away: {
          ppaOff: 0.9,
          ppaDef: 0.7,
          successOff: 0.55,
          successDef: 0.5,
        },
      }),
      ...gameRows({
        gameId: 'g3',
        week: 2,
        homeId: 'B',
        awayId: 'C',
        home: {
          ppaOff: 0.6,
          ppaDef: 0.4,
          successOff: 0.45,
          successDef: 0.35,
        },
        away: {
          ppaOff: 0.4,
          ppaDef: 0.6,
          successOff: 0.35,
          successDef: 0.45,
        },
      }),
      ...gameRows({
        gameId: 'g4',
        week: 2,
        homeId: 'D',
        awayId: 'A',
        home: {
          ppaOff: 0.3,
          ppaDef: 0.8,
          successOff: 0.3,
          successDef: 0.55,
        },
        away: {
          ppaOff: 0.8,
          ppaDef: 0.3,
          successOff: 0.55,
          successDef: 0.3,
        },
      }),
      ...gameRows({
        gameId: 'g5',
        week: 3,
        homeId: 'A',
        awayId: 'C',
      }),
      ...gameRows({
        gameId: 'g6',
        week: 3,
        homeId: 'B',
        awayId: 'D',
        home: {
          ppaOff: 9.9,
          ppaDef: 9.9,
          successOff: 9.9,
          successDef: 9.9,
        },
        away: {
          ppaOff: 9.9,
          ppaDef: 9.9,
          successOff: 9.9,
          successDef: 9.9,
        },
      }),
    ];

    const result = computeOa1FeatureRows(rows);
    const target = result.games.find((game) => game.providerGameId === 'g5')!;

    expect(target.home.teamIdInternal).toBe('A');
    expect(target.home.raw.ppaOff.value).toBeCloseTo(0.9, 12);
    expect(target.home.opponentAdjusted.ppaOff.value).toBeCloseTo(0.35, 12);
    expect(target.home.opponentAdjusted.ppaDef.value).toBeCloseTo(0.35, 12);
    expect(target.home.opponentAdjusted.ppaNet.value).toBeCloseTo(0.7, 12);

    const aPpaOffResiduals = result.residualAudit.filter(
      (row) =>
        row.targetGameId === 'g5' &&
        row.targetTeamIdInternal === 'A' &&
        row.metric === 'ppaOff'
    );
    expect(aPpaOffResiduals).toHaveLength(2);

    const g1Residual = aPpaOffResiduals.find(
      (row) => row.sourceGameId === 'g1'
    )!;
    expect(g1Residual.opponentBaselineN).toBe(1);
    expect(g1Residual.opponentBaseline).toBeCloseTo(0.4, 12);
    expect(g1Residual.residual).toBeCloseTo(0.6, 12);

    const g4Residual = aPpaOffResiduals.find(
      (row) => row.sourceGameId === 'g4'
    )!;
    expect(g4Residual.opponentBaselineN).toBe(1);
    expect(g4Residual.opponentBaseline).toBeCloseTo(0.7, 12);
    expect(g4Residual.residual).toBeCloseTo(0.1, 12);
  });

  it('keeps raw history when opponent baseline is unavailable', () => {
    const rows = [
      ...gameRows({
        gameId: 'g1',
        week: 1,
        homeId: 'A',
        awayId: 'B',
        home: {
          ppaOff: 1.0,
          ppaDef: 0.4,
          successOff: 0.6,
          successDef: 0.3,
        },
      }),
      ...gameRows({
        gameId: 'g2',
        week: 2,
        homeId: 'A',
        awayId: 'C',
      }),
    ];

    const result = computeOa1FeatureRows(rows);
    const target = result.games.find((game) => game.providerGameId === 'g2')!;

    expect(target.home.raw.ppaOff.n).toBe(1);
    expect(target.home.raw.ppaOff.value).toBeCloseTo(1.0, 12);
    expect(target.home.opponentAdjusted.ppaOff.n).toBe(0);
    expect(target.home.opponentAdjusted.ppaOff.value).toBeNull();
    expect(target.home.opponentAdjusted.ppaOff.status).toBe(
      'NO_OPPONENT_BASELINE'
    );
  });

  it('preserves SOURCE_UNAVAILABLE history as missing rather than zero', () => {
    const rows = [
      ...gameRows({
        gameId: 'g1',
        week: 1,
        homeId: 'A',
        awayId: 'B',
        available: false,
      }),
      ...gameRows({
        gameId: 'g2',
        week: 2,
        homeId: 'A',
        awayId: 'C',
      }),
    ];

    const result = computeOa1FeatureRows(rows);
    const target = result.games.find((game) => game.providerGameId === 'g2')!;

    expect(target.home.priorCanonicalGames).toBe(1);
    expect(target.home.priorAvailableMetricGames).toBe(0);
    expect(target.home.priorSourceUnavailableGames).toBe(1);
    expect(target.home.raw.ppaOff.value).toBeNull();
    expect(target.home.raw.ppaOff.n).toBe(0);
    expect(target.home.raw.ppaOff.status).toBe(
      'NO_AVAILABLE_METRIC_HISTORY'
    );
    expect(target.home.opponentAdjusted.ppaOff.value).toBeNull();
  });

  it('does not carry history across seasons', () => {
    const rows = [
      ...gameRows({
        season: 2022,
        gameId: 'g1',
        week: 14,
        homeId: 'A',
        awayId: 'B',
      }),
      ...gameRows({
        season: 2023,
        gameId: 'g2',
        week: 1,
        homeId: 'A',
        awayId: 'C',
      }),
    ];

    const result = computeOa1FeatureRows(rows);
    const target = result.games.find(
      (game) => game.season === 2023 && game.providerGameId === 'g2'
    )!;

    expect(target.home.priorCanonicalGames).toBe(0);
    expect(target.home.raw.ppaOff.status).toBe('NO_PRIOR_FBS_GAMES');
  });
});

describe('OA-1 source identity and safety', () => {
  it('hashes the natural-key + record-fingerprint set deterministically', () => {
    const rows = gameRows({
      gameId: 'g1',
      week: 1,
      homeId: 'A',
      awayId: 'B',
    });

    expect(oa1FingerprintSetSha256(rows)).toBe(
      oa1FingerprintSetSha256([...rows].reverse())
    );

    const changed = rows.map((row, index) =>
      index === 0
        ? { ...row, recordFingerprintSha256: fp('c') }
        : row
    );
    expect(oa1FingerprintSetSha256(changed)).not.toBe(
      oa1FingerprintSetSha256(rows)
    );
  });

  it('fails the frozen development source identity gate on synthetic input', () => {
    const result = buildOa1DevelopmentFeatures(
      gameRows({
        gameId: 'g1',
        week: 1,
        homeId: 'A',
        awayId: 'B',
      })
    );

    expect(result.qaPass).toBe(false);
    expect(
      result.blockers.some((blocker) =>
        blocker.includes('season source identity mismatch')
      )
    ).toBe(true);
  });

  it('hard-binds the CLI to 2022-2023 canonical rows only', () => {
    expect(CLI).toContain('canonicalTeamGameEfficiencyV1.findMany');
    expect(CLI).toContain('in: [...OA_1_DEVELOPMENT_SEASONS]');
    expect(CLI).toContain('season2024RowsRead: 0');
    expect(CLI).toContain('season2025RowsRead: 0');
    expect(CLI).toContain('season2026RowsRead: 0');

    expect(CLI).not.toContain('prisma.game.findMany');
    expect(CLI).not.toContain('prisma.teamGameStat');
    expect(CLI).not.toContain('homeScore');
    expect(CLI).not.toContain('awayScore');
    expect(CLI).not.toContain('marketLine');
    expect(CLI).not.toContain('prisma.bet');
  });

  it('keeps the contract explicit about no outcomes, markets, 2025, or 2026 selection', () => {
    expect(CONTRACT).toContain('2025 — locked from OA model-performance use');
    expect(CONTRACT).toContain('2026 — shadow/prospective only');
    expect(CONTRACT).toContain('No outcome / market use');
    expect(CONTRACT).toContain('source game itself is excluded');
    expect(CONTRACT).toContain('provider week <');
  });
});
