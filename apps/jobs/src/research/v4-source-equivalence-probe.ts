/**
 * V4 comparator Phase 2 source-equivalence probe helpers.
 *
 * Research-only. This module does not call providers or write data.
 * It evaluates fixed 2026 sample evidence and always fails closed on
 * comparator persistence.
 */

export const V4_EQUIVALENCE_SEASON = 2026;

export interface FixedSampleGame {
  week: number;
  internalGameId: string;
  cfbdGameId: string;
  teamA: string;
  teamB: string;
}

export const V4_EQUIVALENCE_SAMPLE: FixedSampleGame[] = [
  { week: 1, internalGameId: '2026-wk1-east-carolina-alabama', cfbdGameId: '401856634', teamA: 'alabama', teamB: 'east-carolina' },
  { week: 1, internalGameId: '2026-wk1-baylor-auburn', cfbdGameId: '401856636', teamA: 'auburn', teamB: 'baylor' },
  { week: 1, internalGameId: '2026-wk1-florida-atlantic-florida', cfbdGameId: '401856637', teamA: 'florida', teamB: 'florida-atlantic' },
  { week: 2, internalGameId: '2026-wk2-arkansas-utah', cfbdGameId: '401856670', teamA: 'arkansas', teamB: 'utah' },
  { week: 2, internalGameId: '2026-wk2-southern-miss-auburn', cfbdGameId: '401856671', teamA: 'auburn', teamB: 'southern-miss' },
  { week: 2, internalGameId: '2026-wk2-western-kentucky-georgia', cfbdGameId: '401856673', teamA: 'georgia', teamB: 'western-kentucky' },
  { week: 3, internalGameId: '2026-wk3-florida-state-alabama', cfbdGameId: '401856685', teamA: 'alabama', teamB: 'florida-state' },
  { week: 3, internalGameId: '2026-wk3-georgia-arkansas', cfbdGameId: '401856686', teamA: 'arkansas', teamB: 'georgia' },
  { week: 3, internalGameId: '2026-wk3-florida-auburn', cfbdGameId: '401856687', teamA: 'auburn', teamB: 'florida' },
];

export const V4_EQUIVALENCE_ENDPOINTS = [
  '/stats/game/advanced',
  '/drives',
  '/plays',
] as const;

export const V4_EQUIVALENCE_WEEKS = [1, 2, 3] as const;
export const V4_EQUIVALENCE_PROVIDER_CALL_BUDGET =
  V4_EQUIVALENCE_ENDPOINTS.length * V4_EQUIVALENCE_WEEKS.length;

export interface PersistedSampleRow {
  gameId: string;
  teamId: string;
  cfbdGameId: string | null;
  providerTeam: string | null;
  successOff: number | null;
  successDef: number | null;
}

export interface ProviderCallRecord {
  endpoint: string;
  week: number;
  attempted: boolean;
  status: number | null;
  ok: boolean;
  error: string | null;
  rowCount: number | null;
}

export interface AdvancedRow {
  gameId?: string | number | null;
  team?: string | null;
  offense?: { successRate?: number | null } | null;
  defense?: { successRate?: number | null } | null;
  [key: string]: unknown;
}

export interface DriveRow {
  id?: string | number | null;
  gameId?: string | number | null;
  team?: string | null;
  opponent?: string | null;
  offense?: string | null;
  defense?: string | null;
  startYardline?: number | null;
  startYardLine?: number | null;
  endYardline?: number | null;
  endYardLine?: number | null;
  yards?: number | null;
  points?: number | null;
  [key: string]: unknown;
}

export interface PlayRow {
  id?: string | number | null;
  driveId?: string | number | null;
  gameId?: string | number | null;
  driveNumber?: number | null;
  offense?: string | null;
  defense?: string | null;
  offenseScore?: number | null;
  defenseScore?: number | null;
  yardline?: number | null;
  yardsToGoal?: number | null;
  yardsGained?: number | null;
  scoring?: boolean | null;
  [key: string]: unknown;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeTeamName(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function filterSampleRows<T extends { gameId?: string | number | null }>(
  rows: T[]
): T[] {
  const ids = new Set(V4_EQUIVALENCE_SAMPLE.map((g) => g.cfbdGameId));
  return rows.filter((row) => {
    const id = textValue(row.gameId);
    return id !== null && ids.has(id);
  });
}

export function compareAdvancedSuccess(
  persisted: PersistedSampleRow[],
  advancedRows: AdvancedRow[],
  tolerance = 1e-12
) {
  const provider = filterSampleRows(advancedRows);
  const keyedProvider = new Map<string, AdvancedRow[]>();
  for (const row of provider) {
    const gameId = textValue(row.gameId);
    const team = normalizeTeamName(textValue(row.team));
    if (!gameId || !team) continue;
    const key = `${gameId}|${team}`;
    const list = keyedProvider.get(key) ?? [];
    list.push(row);
    keyedProvider.set(key, list);
  }

  const diagnostics = persisted.map((row) => {
    const providerTeam = normalizeTeamName(row.providerTeam);
    const key =
      row.cfbdGameId && providerTeam
        ? `${row.cfbdGameId}|${providerTeam}`
        : null;
    const matches = key ? keyedProvider.get(key) ?? [] : [];
    const providerRow = matches.length === 1 ? matches[0] : null;
    const providerOff = finiteNumber(providerRow?.offense?.successRate);
    const providerDef = finiteNumber(providerRow?.defense?.successRate);
    const offDelta =
      providerOff !== null && row.successOff !== null
        ? Math.abs(providerOff - row.successOff)
        : null;
    const defDelta =
      providerDef !== null && row.successDef !== null
        ? Math.abs(providerDef - row.successDef)
        : null;
    const comparable =
      matches.length === 1 &&
      providerOff !== null &&
      providerDef !== null &&
      row.successOff !== null &&
      row.successDef !== null;
    const pass =
      comparable &&
      offDelta !== null &&
      defDelta !== null &&
      offDelta <= tolerance &&
      defDelta <= tolerance;

    return {
      gameId: row.gameId,
      cfbdGameId: row.cfbdGameId,
      teamId: row.teamId,
      providerTeam: row.providerTeam,
      providerMatchCount: matches.length,
      persistedSuccessOff: row.successOff,
      persistedSuccessDef: row.successDef,
      providerSuccessOff: providerOff,
      providerSuccessDef: providerDef,
      offDelta,
      defDelta,
      comparable,
      pass,
    };
  });

  const comparable = diagnostics.filter((d) => d.comparable).length;
  const passed = diagnostics.filter((d) => d.pass).length;
  return {
    expectedTeamRows: persisted.length,
    providerSampleRows: provider.length,
    comparableTeamRows: comparable,
    exactWithinToleranceRows: passed,
    tolerance,
    status:
      persisted.length > 0 && passed === persisted.length
        ? 'PASS'
        : comparable === 0
          ? 'UNTESTABLE'
          : 'FAIL',
    diagnostics,
  };
}

function normalizedYardline(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

export function legacyDriveMetricInputs(row: DriveRow) {
  const gameId = textValue(row.gameId);
  const offense = textValue(row.offense ?? row.team);
  const defense = textValue(row.defense ?? row.opponent);
  const start = normalizedYardline(row.startYardline ?? row.startYardLine);
  const end = normalizedYardline(row.endYardline ?? row.endYardLine);
  const yards = finiteNumber(row.yards);
  const points = finiteNumber(row.points);

  let finalYardline: number | null = null;
  if (end !== null) finalYardline = end;
  else if (start !== null && yards !== null) {
    finalYardline = Math.min(100, start + yards);
  }

  const scoringOpportunity =
    finalYardline !== null ? finalYardline >= 60 : null;

  let availableYardsPct: number | null = null;
  if (start !== null) {
    const available = Math.max(0, 100 - start);
    if (available > 0) {
      let gained: number | null = null;
      if (yards !== null) gained = Math.max(0, yards);
      else if (end !== null) gained = Math.max(0, end - start);
      if (gained !== null) {
        availableYardsPct = Math.max(0, Math.min(1, gained / available));
      }
    }
  }

  return {
    gameId,
    driveId: textValue(row.id),
    offense,
    defense,
    startYardline: start,
    endYardline: end,
    yards,
    points,
    scoringOpportunity,
    availableYardsPct,
    identityComplete: Boolean(gameId && offense && defense),
    scoringOpportunityComputable: scoringOpportunity !== null,
    availableYardsComputable: availableYardsPct !== null,
    pointsPresent: points !== null,
  };
}

export function assessLegacyDriveCompatibility(rows: DriveRow[]) {
  const sample = filterSampleRows(rows);
  const normalized = sample.map(legacyDriveMetricInputs);
  const byGame = new Map<string, typeof normalized>();
  for (const row of normalized) {
    if (!row.gameId) continue;
    const list = byGame.get(row.gameId) ?? [];
    list.push(row);
    byGame.set(row.gameId, list);
  }

  const gameDiagnostics = V4_EQUIVALENCE_SAMPLE.map((game) => {
    const gameRows = byGame.get(game.cfbdGameId) ?? [];
    const driveIds = gameRows
      .map((r) => r.driveId)
      .filter((v): v is string => Boolean(v));
    return {
      cfbdGameId: game.cfbdGameId,
      week: game.week,
      rows: gameRows.length,
      distinctDriveIds: new Set(driveIds).size,
      identityCompleteRows: gameRows.filter((r) => r.identityComplete).length,
      scoringOpportunityComputableRows: gameRows.filter(
        (r) => r.scoringOpportunityComputable
      ).length,
      availableYardsComputableRows: gameRows.filter(
        (r) => r.availableYardsComputable
      ).length,
      pointsPresentRows: gameRows.filter((r) => r.pointsPresent).length,
    };
  });

  const total = normalized.length;
  const allGamesPresent = gameDiagnostics.every((g) => g.rows > 0);
  const fullMetricCoverage =
    total > 0 &&
    normalized.every(
      (r) =>
        r.identityComplete &&
        r.scoringOpportunityComputable &&
        r.availableYardsComputable &&
        r.pointsPresent
    );

  return {
    sampleRows: total,
    sampleGamesPresent: gameDiagnostics.filter((g) => g.rows > 0).length,
    expectedSampleGames: V4_EQUIVALENCE_SAMPLE.length,
    allGamesPresent,
    fullMetricCoverage,
    status:
      allGamesPresent && fullMetricCoverage
        ? 'LEGACY_ROUTE_COMPATIBLE'
        : total === 0
          ? 'UNAVAILABLE_OR_EMPTY'
          : 'INCOMPATIBLE',
    gameDiagnostics,
    normalized,
  };
}

function driveIdSetFromDrives(rows: DriveRow[], gameId: string): Set<string> {
  return new Set(
    rows
      .filter((r) => textValue(r.gameId) === gameId)
      .map((r) => textValue(r.id))
      .filter((v): v is string => Boolean(v))
  );
}

function driveIdSetFromPlays(rows: PlayRow[], gameId: string): Set<string> {
  return new Set(
    rows
      .filter((r) => textValue(r.gameId) === gameId)
      .map((r) => textValue(r.driveId))
      .filter((v): v is string => Boolean(v))
  );
}

function setIntersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count;
}

export function assessPlayDriveIdentity(
  playRows: PlayRow[],
  driveRows: DriveRow[]
) {
  const plays = filterSampleRows(playRows);
  const playFieldCoverage = {
    rows: plays.length,
    driveIdRows: plays.filter((r) => textValue(r.driveId) !== null).length,
    offenseRows: plays.filter((r) => textValue(r.offense) !== null).length,
    defenseRows: plays.filter((r) => textValue(r.defense) !== null).length,
    yardsToGoalRows: plays.filter((r) => finiteNumber(r.yardsToGoal) !== null)
      .length,
    yardsGainedRows: plays.filter((r) => finiteNumber(r.yardsGained) !== null)
      .length,
    offenseScoreRows: plays.filter(
      (r) => finiteNumber(r.offenseScore) !== null
    ).length,
    defenseScoreRows: plays.filter(
      (r) => finiteNumber(r.defenseScore) !== null
    ).length,
  };

  const games = V4_EQUIVALENCE_SAMPLE.map((game) => {
    const p = driveIdSetFromPlays(plays, game.cfbdGameId);
    const d = driveIdSetFromDrives(driveRows, game.cfbdGameId);
    const intersection = setIntersectionSize(p, d);
    const union = new Set([...p, ...d]).size;
    return {
      cfbdGameId: game.cfbdGameId,
      week: game.week,
      playDriveIds: p.size,
      legacyDriveIds: d.size,
      intersection,
      union,
      jaccard: union > 0 ? intersection / union : null,
      exactSetMatch:
        p.size > 0 &&
        d.size > 0 &&
        p.size === d.size &&
        intersection === p.size,
    };
  });

  const comparable = games.filter(
    (g) => g.playDriveIds > 0 && g.legacyDriveIds > 0
  );
  const exact = comparable.filter((g) => g.exactSetMatch);

  return {
    fieldCoverage: playFieldCoverage,
    comparableGames: comparable.length,
    exactDriveIdSetMatches: exact.length,
    status:
      comparable.length === V4_EQUIVALENCE_SAMPLE.length &&
      exact.length === comparable.length
        ? 'MATCHES_LEGACY_DRIVE_IDS'
        : comparable.length === 0
          ? 'UNVERIFIABLE'
          : 'MISMATCH_OR_PARTIAL',
    games,
  };
}

export function buildV4SourceEquivalenceReport(input: {
  repoCommitSha: string;
  observedAt: string;
  providerCalls: ProviderCallRecord[];
  persistedRows: PersistedSampleRow[];
  advancedRows: AdvancedRow[];
  driveRows: DriveRow[];
  playRows: PlayRow[];
  payloadDigests: Record<string, string>;
}) {
  const advanced = compareAdvancedSuccess(
    input.persistedRows,
    input.advancedRows
  );
  const drives = assessLegacyDriveCompatibility(input.driveRows);
  const plays = assessPlayDriveIdentity(input.playRows, input.driveRows);
  const attempts = input.providerCalls.filter((c) => c.attempted).length;
  const successful = input.providerCalls.filter((c) => c.ok).length;

  return {
    capability: 'v4_source_equivalence_probe_v1',
    researchOnly: true,
    season: V4_EQUIVALENCE_SEASON,
    repoCommitSha: input.repoCommitSha,
    observedAt: input.observedAt,
    sample: V4_EQUIVALENCE_SAMPLE,
    providerCallBudget: V4_EQUIVALENCE_PROVIDER_CALL_BUDGET,
    providerCallsAttempted: attempts,
    providerCallsSuccessful: successful,
    providerCalls: input.providerCalls,
    mutationsInvoked: false,
    sourceChecks: {
      currentAdvancedSuccess: advanced,
      legacyDrivesCompatibility: drives,
      currentPlaysDriveIdentity: plays,
    },
    payloadDigests: input.payloadDigests,
    safeToPersistComparator: false,
    comparatorPersistenceAuthorized: false,
    overallStatus:
      attempts <= V4_EQUIVALENCE_PROVIDER_CALL_BUDGET &&
      advanced.status === 'PASS' &&
      drives.status === 'LEGACY_ROUTE_COMPATIBLE' &&
      plays.status === 'MATCHES_LEGACY_DRIVE_IDS'
        ? 'SOURCE_COMPATIBILITY_PROMISING'
        : 'SOURCE_EQUIVALENCE_NOT_PROVEN',
    nextStep:
      'REVIEW_PHASE_2_EVIDENCE_BEFORE_ANY_COMPARATOR_ARCHITECTURE',
  };
}
