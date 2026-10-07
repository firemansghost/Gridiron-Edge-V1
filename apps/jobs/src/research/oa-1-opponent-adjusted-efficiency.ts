import * as crypto from 'crypto';

export const OA_1_FEATURE_VERSION =
  'oa_1_opponent_adjusted_efficiency_feature_v1' as const;
export const OA_1_SOURCE_TABLE =
  'team_game_efficiency_canonical_v1' as const;
export const OA_1_DEVELOPMENT_SEASONS = [2022, 2023] as const;

export const OA_1_DEVELOPMENT_SOURCE = {
  2022: {
    rows: 1468,
    games: 734,
    fingerprintSetSha256:
      'f2aa64e9b19aa29b8ef12ecb3b1ed0712837150609b0e039e17be27e654edeb3',
  },
  2023: {
    rows: 1500,
    games: 750,
    fingerprintSetSha256:
      'f17635c153caff8cfe85f704054bef40625cbae80317db40ad5ba32f81e663f0',
  },
} as const;

export type Oa1AvailabilityStatus = 'AVAILABLE' | 'SOURCE_UNAVAILABLE';

export interface Oa1CanonicalRow {
  season: number;
  providerGameId: string;
  providerWeek: number;
  startDate: string | Date | null;
  neutralSite: boolean | null;
  homeTeamNameCfbd: string;
  awayTeamNameCfbd: string;
  teamNameCfbd: string;
  opponentNameCfbd: string;
  teamIdInternal: string;
  opponentTeamIdInternal: string;
  isHome: boolean;
  availabilityStatus: string;
  ppaOff: number | null;
  ppaDef: number | null;
  successOff: number | null;
  successDef: number | null;
  recordFingerprintSha256: string;
}

export type Oa1MetricKey =
  | 'ppaOff'
  | 'ppaDef'
  | 'successOff'
  | 'successDef';

export type Oa1AggregateStatus =
  | 'AVAILABLE'
  | 'NO_PRIOR_FBS_GAMES'
  | 'NO_AVAILABLE_METRIC_HISTORY'
  | 'NO_OPPONENT_BASELINE'
  | 'PARTIAL_OPPONENT_BASELINE';

export interface Oa1MetricAggregate {
  value: number | null;
  n: number;
  status: Oa1AggregateStatus;
}

export interface Oa1NetAggregate {
  value: number | null;
  status: Oa1AggregateStatus;
}

export interface Oa1TeamFeatureBundle {
  teamIdInternal: string;
  teamNameCfbd: string;
  priorCanonicalGames: number;
  priorAvailableMetricGames: number;
  priorSourceUnavailableGames: number;
  raw: {
    ppaOff: Oa1MetricAggregate;
    ppaDef: Oa1MetricAggregate;
    successOff: Oa1MetricAggregate;
    successDef: Oa1MetricAggregate;
    ppaNet: Oa1NetAggregate;
    successNet: Oa1NetAggregate;
  };
  opponentAdjusted: {
    ppaOff: Oa1MetricAggregate;
    ppaDef: Oa1MetricAggregate;
    successOff: Oa1MetricAggregate;
    successDef: Oa1MetricAggregate;
    ppaNet: Oa1NetAggregate;
    successNet: Oa1NetAggregate;
  };
}

export interface Oa1GameFeatureRow {
  season: number;
  providerGameId: string;
  providerWeek: number;
  startDate: string | null;
  neutralSite: boolean | null;
  homeTeamIdInternal: string;
  homeTeamNameCfbd: string;
  awayTeamIdInternal: string;
  awayTeamNameCfbd: string;
  home: Oa1TeamFeatureBundle;
  away: Oa1TeamFeatureBundle;
}

export interface Oa1ResidualAuditRow {
  season: number;
  targetGameId: string;
  targetWeek: number;
  targetTeamIdInternal: string;
  targetTeamNameCfbd: string;
  metric: Oa1MetricKey;
  sourceGameId: string;
  sourceWeek: number;
  opponentTeamIdInternal: string;
  opponentTeamNameCfbd: string;
  opponentBaselineN: number;
  sourceValue: number | null;
  opponentBaseline: number | null;
  residual: number | null;
}

export interface Oa1BuildResult {
  version: typeof OA_1_FEATURE_VERSION;
  qaPass: boolean;
  blockers: string[];
  sourceIdentity: {
    rows: number;
    perSeason: Array<{
      season: number;
      rows: number;
      games: number;
      fingerprintSetSha256: string;
      expectedFingerprintSetSha256: string;
      exactIdentityMatch: boolean;
    }>;
  };
  counts: {
    targetGames: number;
    teamSideBundles: number;
    residualAuditRows: number;
    duplicateNaturalKeys: number;
    badGameFrames: number;
    sourceUnavailableRows: number;
  };
  games: Oa1GameFeatureRow[];
  residualAudit: Oa1ResidualAuditRow[];
}

const METRIC_RULES: Record<
  Oa1MetricKey,
  {
    baselineMetric: Oa1MetricKey;
    residual: 'SOURCE_MINUS_BASELINE' | 'BASELINE_MINUS_SOURCE';
  }
> = {
  ppaOff: {
    baselineMetric: 'ppaDef',
    residual: 'SOURCE_MINUS_BASELINE',
  },
  ppaDef: {
    baselineMetric: 'ppaOff',
    residual: 'BASELINE_MINUS_SOURCE',
  },
  successOff: {
    baselineMetric: 'successDef',
    residual: 'SOURCE_MINUS_BASELINE',
  },
  successDef: {
    baselineMetric: 'successOff',
    residual: 'BASELINE_MINUS_SOURCE',
  },
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isoDate(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function naturalKey(row: Oa1CanonicalRow): string {
  return `${row.season}|${row.providerGameId}|${row.teamIdInternal}`;
}

function gameKey(row: Oa1CanonicalRow): string {
  return `${row.season}|${row.providerGameId}`;
}

function teamIndexKey(season: number, teamIdInternal: string): string {
  return `${season}|${teamIdInternal}`;
}

function sha256Utf8(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function oa1FingerprintSetSha256(
  rows: Oa1CanonicalRow[]
): string {
  const lines = [...rows]
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.providerGameId.localeCompare(b.providerGameId) ||
        a.teamIdInternal.localeCompare(b.teamIdInternal)
    )
    .map(
      (row) =>
        `${row.season}|${row.providerGameId}|${row.teamIdInternal}|${row.recordFingerprintSha256}`
    );

  return sha256Utf8(lines.join('\n'));
}

function rawStatus(
  priorCanonicalGames: number,
  n: number
): Oa1AggregateStatus {
  if (priorCanonicalGames === 0) return 'NO_PRIOR_FBS_GAMES';
  if (n === 0) return 'NO_AVAILABLE_METRIC_HISTORY';
  return 'AVAILABLE';
}

function adjustedStatus(
  priorCanonicalGames: number,
  rawN: number,
  adjustedN: number
): Oa1AggregateStatus {
  if (priorCanonicalGames === 0) return 'NO_PRIOR_FBS_GAMES';
  if (rawN === 0) return 'NO_AVAILABLE_METRIC_HISTORY';
  if (adjustedN === 0) return 'NO_OPPONENT_BASELINE';
  if (adjustedN < rawN) return 'PARTIAL_OPPONENT_BASELINE';
  return 'AVAILABLE';
}

function netStatus(
  left: Oa1MetricAggregate,
  right: Oa1MetricAggregate
): Oa1AggregateStatus {
  if (left.value !== null && right.value !== null) {
    if (
      left.status === 'PARTIAL_OPPONENT_BASELINE' ||
      right.status === 'PARTIAL_OPPONENT_BASELINE'
    ) {
      return 'PARTIAL_OPPONENT_BASELINE';
    }
    return 'AVAILABLE';
  }
  if (
    left.status === 'NO_PRIOR_FBS_GAMES' ||
    right.status === 'NO_PRIOR_FBS_GAMES'
  ) {
    return 'NO_PRIOR_FBS_GAMES';
  }
  if (
    left.status === 'NO_AVAILABLE_METRIC_HISTORY' ||
    right.status === 'NO_AVAILABLE_METRIC_HISTORY'
  ) {
    return 'NO_AVAILABLE_METRIC_HISTORY';
  }
  return 'NO_OPPONENT_BASELINE';
}

function rowMetric(
  row: Oa1CanonicalRow,
  metric: Oa1MetricKey
): number | null {
  const value = row[metric];
  return finite(value) ? value : null;
}

function buildMetric(
  input: {
    target: Oa1CanonicalRow;
    targetWeek: number;
    metric: Oa1MetricKey;
    history: Oa1CanonicalRow[];
    teamIndex: Map<string, Oa1CanonicalRow[]>;
  },
  residualAudit: Oa1ResidualAuditRow[]
): { raw: Oa1MetricAggregate; adjusted: Oa1MetricAggregate } {
  const { target, targetWeek, metric, history, teamIndex } = input;
  const sourceRows = history.filter(
    (row) =>
      row.availabilityStatus === 'AVAILABLE' &&
      rowMetric(row, metric) !== null
  );
  const rawValues = sourceRows
    .map((row) => rowMetric(row, metric))
    .filter((value): value is number => value !== null);

  const residuals: number[] = [];
  const rule = METRIC_RULES[metric];

  for (const sourceRow of sourceRows) {
    const sourceValue = rowMetric(sourceRow, metric);
    const opponentRows =
      teamIndex.get(
        teamIndexKey(sourceRow.season, sourceRow.opponentTeamIdInternal)
      ) ?? [];

    const baselineValues = opponentRows
      .filter(
        (row) =>
          row.providerWeek < targetWeek &&
          row.providerGameId !== sourceRow.providerGameId &&
          row.availabilityStatus === 'AVAILABLE'
      )
      .map((row) => rowMetric(row, rule.baselineMetric))
      .filter((value): value is number => value !== null);

    const opponentBaseline = mean(baselineValues);
    const residual =
      sourceValue === null || opponentBaseline === null
        ? null
        : rule.residual === 'SOURCE_MINUS_BASELINE'
          ? sourceValue - opponentBaseline
          : opponentBaseline - sourceValue;

    if (residual !== null) residuals.push(residual);

    residualAudit.push({
      season: target.season,
      targetGameId: target.providerGameId,
      targetWeek,
      targetTeamIdInternal: target.teamIdInternal,
      targetTeamNameCfbd: target.teamNameCfbd,
      metric,
      sourceGameId: sourceRow.providerGameId,
      sourceWeek: sourceRow.providerWeek,
      opponentTeamIdInternal: sourceRow.opponentTeamIdInternal,
      opponentTeamNameCfbd: sourceRow.opponentNameCfbd,
      opponentBaselineN: baselineValues.length,
      sourceValue,
      opponentBaseline,
      residual,
    });
  }

  const rawValue = mean(rawValues);
  const adjustedValue = mean(residuals);

  return {
    raw: {
      value: rawValue,
      n: rawValues.length,
      status: rawStatus(history.length, rawValues.length),
    },
    adjusted: {
      value: adjustedValue,
      n: residuals.length,
      status: adjustedStatus(
        history.length,
        rawValues.length,
        residuals.length
      ),
    },
  };
}

function buildTeamBundle(
  target: Oa1CanonicalRow,
  teamIndex: Map<string, Oa1CanonicalRow[]>,
  residualAudit: Oa1ResidualAuditRow[]
): Oa1TeamFeatureBundle {
  const targetWeek = target.providerWeek;
  const history = (
    teamIndex.get(teamIndexKey(target.season, target.teamIdInternal)) ?? []
  ).filter((row) => row.providerWeek < targetWeek);

  const priorSourceUnavailableGames = history.filter(
    (row) => row.availabilityStatus === 'SOURCE_UNAVAILABLE'
  ).length;
  const priorAvailableMetricGames = history.filter(
    (row) => row.availabilityStatus === 'AVAILABLE'
  ).length;

  const ppaOff = buildMetric(
    {
      target,
      targetWeek,
      metric: 'ppaOff',
      history,
      teamIndex,
    },
    residualAudit
  );
  const ppaDef = buildMetric(
    {
      target,
      targetWeek,
      metric: 'ppaDef',
      history,
      teamIndex,
    },
    residualAudit
  );
  const successOff = buildMetric(
    {
      target,
      targetWeek,
      metric: 'successOff',
      history,
      teamIndex,
    },
    residualAudit
  );
  const successDef = buildMetric(
    {
      target,
      targetWeek,
      metric: 'successDef',
      history,
      teamIndex,
    },
    residualAudit
  );

  const rawPpaNet =
    ppaOff.raw.value !== null && ppaDef.raw.value !== null
      ? ppaOff.raw.value - ppaDef.raw.value
      : null;
  const rawSuccessNet =
    successOff.raw.value !== null && successDef.raw.value !== null
      ? successOff.raw.value - successDef.raw.value
      : null;

  const oppAdjPpaNet =
    ppaOff.adjusted.value !== null && ppaDef.adjusted.value !== null
      ? ppaOff.adjusted.value + ppaDef.adjusted.value
      : null;
  const oppAdjSuccessNet =
    successOff.adjusted.value !== null &&
    successDef.adjusted.value !== null
      ? successOff.adjusted.value + successDef.adjusted.value
      : null;

  return {
    teamIdInternal: target.teamIdInternal,
    teamNameCfbd: target.teamNameCfbd,
    priorCanonicalGames: history.length,
    priorAvailableMetricGames,
    priorSourceUnavailableGames,
    raw: {
      ppaOff: ppaOff.raw,
      ppaDef: ppaDef.raw,
      successOff: successOff.raw,
      successDef: successDef.raw,
      ppaNet: {
        value: rawPpaNet,
        status: netStatus(ppaOff.raw, ppaDef.raw),
      },
      successNet: {
        value: rawSuccessNet,
        status: netStatus(successOff.raw, successDef.raw),
      },
    },
    opponentAdjusted: {
      ppaOff: ppaOff.adjusted,
      ppaDef: ppaDef.adjusted,
      successOff: successOff.adjusted,
      successDef: successDef.adjusted,
      ppaNet: {
        value: oppAdjPpaNet,
        status: netStatus(ppaOff.adjusted, ppaDef.adjusted),
      },
      successNet: {
        value: oppAdjSuccessNet,
        status: netStatus(successOff.adjusted, successDef.adjusted),
      },
    },
  };
}

export function computeOa1FeatureRows(rows: Oa1CanonicalRow[]): {
  games: Oa1GameFeatureRow[];
  residualAudit: Oa1ResidualAuditRow[];
  badGameFrames: number;
  blockers: string[];
} {
  const blockers: string[] = [];
  let badGameFrames = 0;

  const gameGroups = new Map<string, Oa1CanonicalRow[]>();
  for (const row of rows) {
    const key = gameKey(row);
    const bucket = gameGroups.get(key) ?? [];
    bucket.push(row);
    gameGroups.set(key, bucket);
  }

  for (const [key, gameRows] of gameGroups) {
    const homeRows = gameRows.filter((row) => row.isHome);
    const awayRows = gameRows.filter((row) => !row.isHome);
    if (gameRows.length !== 2 || homeRows.length !== 1 || awayRows.length !== 1) {
      badGameFrames += 1;
      blockers.push(`bad game frame: ${key}`);
      continue;
    }

    const home = homeRows[0];
    const away = awayRows[0];
    if (
      home.providerWeek !== away.providerWeek ||
      home.homeTeamNameCfbd !== away.homeTeamNameCfbd ||
      home.awayTeamNameCfbd !== away.awayTeamNameCfbd ||
      home.teamIdInternal !== away.opponentTeamIdInternal ||
      away.teamIdInternal !== home.opponentTeamIdInternal ||
      home.teamNameCfbd !== home.homeTeamNameCfbd ||
      away.teamNameCfbd !== away.awayTeamNameCfbd
    ) {
      badGameFrames += 1;
      blockers.push(`game identity mismatch: ${key}`);
    }
  }

  const teamIndex = new Map<string, Oa1CanonicalRow[]>();
  for (const row of rows) {
    const key = teamIndexKey(row.season, row.teamIdInternal);
    const bucket = teamIndex.get(key) ?? [];
    bucket.push(row);
    teamIndex.set(key, bucket);
  }
  for (const bucket of teamIndex.values()) {
    bucket.sort(
      (a, b) =>
        a.providerWeek - b.providerWeek ||
        a.providerGameId.localeCompare(b.providerGameId)
    );
  }

  const residualAudit: Oa1ResidualAuditRow[] = [];
  const games: Oa1GameFeatureRow[] = [];

  for (const [, gameRows] of [...gameGroups.entries()].sort((a, b) => {
    const [aSeason, aGame] = a[0].split('|');
    const [bSeason, bGame] = b[0].split('|');
    return Number(aSeason) - Number(bSeason) || aGame.localeCompare(bGame);
  })) {
    if (gameRows.length !== 2) continue;
    const home = gameRows.find((row) => row.isHome);
    const away = gameRows.find((row) => !row.isHome);
    if (!home || !away) continue;

    games.push({
      season: home.season,
      providerGameId: home.providerGameId,
      providerWeek: home.providerWeek,
      startDate: isoDate(home.startDate),
      neutralSite: home.neutralSite,
      homeTeamIdInternal: home.teamIdInternal,
      homeTeamNameCfbd: home.teamNameCfbd,
      awayTeamIdInternal: away.teamIdInternal,
      awayTeamNameCfbd: away.teamNameCfbd,
      home: buildTeamBundle(home, teamIndex, residualAudit),
      away: buildTeamBundle(away, teamIndex, residualAudit),
    });
  }

  return {
    games,
    residualAudit,
    badGameFrames,
    blockers,
  };
}

export function buildOa1DevelopmentFeatures(
  rows: Oa1CanonicalRow[]
): Oa1BuildResult {
  const blockers: string[] = [];
  let duplicateNaturalKeys = 0;
  let badGameFrames = 0;

  const allowedSeasons = new Set<number>(OA_1_DEVELOPMENT_SEASONS);
  const seenKeys = new Set<string>();

  for (const row of rows) {
    if (!allowedSeasons.has(row.season)) {
      blockers.push(`row outside development seasons: ${row.season}`);
    }
    if (!Number.isInteger(row.providerWeek) || row.providerWeek < 0) {
      blockers.push(
        `invalid provider week: ${row.season}/${row.providerGameId}/${row.teamIdInternal}`
      );
    }
    if (!row.providerGameId || !row.teamIdInternal || !row.opponentTeamIdInternal) {
      blockers.push('blank canonical identity field');
    }
    if (
      row.availabilityStatus !== 'AVAILABLE' &&
      row.availabilityStatus !== 'SOURCE_UNAVAILABLE'
    ) {
      blockers.push(
        `unsupported availability status: ${row.availabilityStatus}`
      );
    }

    if (row.availabilityStatus === 'AVAILABLE') {
      if (
        !finite(row.ppaOff) ||
        !finite(row.ppaDef) ||
        !finite(row.successOff) ||
        !finite(row.successDef)
      ) {
        blockers.push(
          `AVAILABLE row missing finite metrics: ${naturalKey(row)}`
        );
      }
    } else if (
      row.ppaOff !== null ||
      row.ppaDef !== null ||
      row.successOff !== null ||
      row.successDef !== null
    ) {
      blockers.push(
        `SOURCE_UNAVAILABLE row contains metrics: ${naturalKey(row)}`
      );
    }

    if (!/^[0-9a-f]{64}$/.test(row.recordFingerprintSha256)) {
      blockers.push(`invalid fingerprint: ${naturalKey(row)}`);
    }

    const key = naturalKey(row);
    if (seenKeys.has(key)) duplicateNaturalKeys += 1;
    else seenKeys.add(key);
  }

  if (duplicateNaturalKeys > 0) {
    blockers.push(`duplicate natural keys: ${duplicateNaturalKeys}`);
  }

  const perSeason = OA_1_DEVELOPMENT_SEASONS.map((season) => {
    const seasonRows = rows.filter((row) => row.season === season);
    const expected = OA_1_DEVELOPMENT_SOURCE[season];
    const seasonGames = new Set(seasonRows.map((row) => gameKey(row))).size;
    const fingerprintSetSha256 = oa1FingerprintSetSha256(seasonRows);
    const exactIdentityMatch =
      seasonRows.length === expected.rows &&
      seasonGames === expected.games &&
      fingerprintSetSha256 === expected.fingerprintSetSha256;

    if (!exactIdentityMatch) {
      blockers.push(
        `season source identity mismatch: ${season} rows=${seasonRows.length} games=${seasonGames} sha=${fingerprintSetSha256}`
      );
    }

    return {
      season,
      rows: seasonRows.length,
      games: seasonGames,
      fingerprintSetSha256,
      expectedFingerprintSetSha256: expected.fingerprintSetSha256,
      exactIdentityMatch,
    };
  });

  const computed = computeOa1FeatureRows(rows);
  const games = computed.games;
  const residualAudit = computed.residualAudit;
  badGameFrames += computed.badGameFrames;
  blockers.push(...computed.blockers);

  const expectedTargetGames =
    OA_1_DEVELOPMENT_SOURCE[2022].games +
    OA_1_DEVELOPMENT_SOURCE[2023].games;
  if (games.length !== expectedTargetGames) {
    blockers.push(
      `target game count mismatch: expected=${expectedTargetGames} actual=${games.length}`
    );
  }

  for (const game of games) {
    const bundles = [game.home, game.away];
    for (const bundle of bundles) {
      for (const section of [bundle.raw, bundle.opponentAdjusted]) {
        for (const metric of [
          section.ppaOff,
          section.ppaDef,
          section.successOff,
          section.successDef,
        ]) {
          if (metric.value !== null && !finite(metric.value)) {
            blockers.push(
              `non-finite aggregate: ${game.season}/${game.providerGameId}/${bundle.teamIdInternal}`
            );
          }
        }
      }
      if (
        bundle.opponentAdjusted.ppaOff.n > bundle.raw.ppaOff.n ||
        bundle.opponentAdjusted.ppaDef.n > bundle.raw.ppaDef.n ||
        bundle.opponentAdjusted.successOff.n > bundle.raw.successOff.n ||
        bundle.opponentAdjusted.successDef.n > bundle.raw.successDef.n
      ) {
        blockers.push(
          `adjusted count exceeds raw count: ${game.season}/${game.providerGameId}/${bundle.teamIdInternal}`
        );
      }
    }
  }

  return {
    version: OA_1_FEATURE_VERSION,
    qaPass: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
    sourceIdentity: {
      rows: rows.length,
      perSeason,
    },
    counts: {
      targetGames: games.length,
      teamSideBundles: games.length * 2,
      residualAuditRows: residualAudit.length,
      duplicateNaturalKeys,
      badGameFrames,
      sourceUnavailableRows: rows.filter(
        (row) => row.availabilityStatus === 'SOURCE_UNAVAILABLE'
      ).length,
    },
    games,
    residualAudit,
  };
}
