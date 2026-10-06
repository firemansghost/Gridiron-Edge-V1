import * as crypto from 'crypto';

export const OA_DB_1_VERSION =
  'oa_db_1_canonical_efficiency_persistence_v1' as const;
export const OA_DB_1_TABLE = 'team_game_efficiency_canonical_v1' as const;
export const OA_DB_1_ARCHIVE_CONTRACT =
  'oa_data_1_canonical_historical_team_game_archive_v1' as const;
export const OA_DB_1_ARCHIVE_RUN_ID = '37513866192' as const;
export const OA_DB_1_ARCHIVE_ARTIFACT_ID = '11436781151' as const;
export const OA_DB_1_ARCHIVE_ZIP_SHA256 =
  '0d5371f7dda6f95a14bbd4d40d7a04c442c998daa1a0e47a3459b76364631e10' as const;

export const OA_DB_1_2024_UNAVAILABLE_GAME_IDS = [
  401641034,
  401645328,
  401644689,
  401644780,
] as const;

export type OaDb1AvailabilityStatus =
  | 'AVAILABLE'
  | 'SOURCE_UNAVAILABLE';

export type OaDb1SourceMethod =
  | 'DIRECT_PROVIDER_ROW'
  | 'SOURCE_UNAVAILABLE';

export interface OaDb1ArchiveRow {
  contractVersion: string;
  season: number;
  providerGameId: number;
  providerWeek: number;
  startDate: string | null;
  neutralSite: boolean | null;
  homeTeam: string;
  awayTeam: string;
  team: string;
  opponent: string;
  isHome: boolean;
  status: OaDb1AvailabilityStatus;
  ppaOff: number | null;
  ppaDef: number | null;
  successOff: number | null;
  successDef: number | null;
  sourceSeason: number;
  sourceArtifactId: number;
  sourceArtifactZipSha256: string;
  sourceEndpoint: string;
  sourceRawMember: string;
  sourceMethod: OaDb1SourceMethod;
}

export interface OaDb1TeamMapRow {
  teamNameCfbd: string;
  teamIdInternal: string;
}

export interface OaDb1ExistingRow {
  season: number;
  providerGameId: string;
  teamIdInternal: string;
  availabilityStatus: string;
  recordFingerprintSha256: string;
}

export interface OaDb1PlannedRow {
  season: number;
  providerGameId: string;
  providerWeek: number;
  startDate: string | null;
  neutralSite: boolean | null;
  homeTeamNameCfbd: string;
  awayTeamNameCfbd: string;
  teamNameCfbd: string;
  opponentNameCfbd: string;
  teamIdInternal: string;
  opponentTeamIdInternal: string;
  isHome: boolean;
  availabilityStatus: OaDb1AvailabilityStatus;
  ppaOff: number | null;
  ppaDef: number | null;
  successOff: number | null;
  successDef: number | null;
  sourceSeason: number;
  sourceArtifactId: string;
  sourceArtifactZipSha256: string;
  sourceEndpoint: string;
  sourceRawMember: string;
  sourceMethod: OaDb1SourceMethod;
  archiveContractVersion: string;
  archiveRunId: string;
  archiveArtifactId: string;
  archiveArtifactZipSha256: string;
  recordFingerprintSha256: string;
}

export interface OaDb1PreviewPlan {
  version: typeof OA_DB_1_VERSION;
  targetTable: typeof OA_DB_1_TABLE;
  targetTableExists: boolean;
  schemaDeploymentRequired: boolean;
  previewSafe: boolean;
  dataCommitEligible: false;
  writeBlockers: string[];
  counts: {
    archiveRows: number;
    plannedRows: number;
    create: number;
    identical: number;
    update: 0;
    conflict: number;
    sourceUnavailable: number;
    unexpectedExisting: number;
    duplicatePlannedNaturalKeys: number;
    duplicateExistingNaturalKeys: number;
    existing2026Rows: number;
    planned2026Mutations: 0;
  };
  perSeason: Array<{
    season: number;
    plannedRows: number;
    create: number;
    identical: number;
    conflict: number;
    sourceUnavailable: number;
  }>;
  conflictKeys: string[];
  unexpectedExistingKeys: string[];
  plannedRows: OaDb1PlannedRow[];
}

const FROZEN_COUNTS = new Map<number, {
  games: number;
  rows: number;
  available: number;
  unavailable: number;
}>([
  [2022, { games: 734, rows: 1468, available: 1468, unavailable: 0 }],
  [2023, { games: 750, rows: 1500, available: 1500, unavailable: 0 }],
  [2024, { games: 752, rows: 1504, available: 1496, unavailable: 8 }],
  [2025, { games: 762, rows: 1524, available: 1524, unavailable: 0 }],
]);

const FROZEN_SOURCE_BY_SEASON = new Map<number, {
  artifactId: string;
  zipSha256: string;
}>([
  [2022, {
    artifactId: '10988661299',
    zipSha256: '7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99',
  }],
  [2023, {
    artifactId: '10990949531',
    zipSha256: '479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4',
  }],
  [2024, {
    artifactId: '11008470975',
    zipSha256: 'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  }],
  [2025, {
    artifactId: '10973848747',
    zipSha256: 'fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22',
  }],
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function canonicalNumber(value: number | null): number | null {
  if (value === null) return null;
  return Object.is(value, -0) ? 0 : value;
}

function sha256Utf8(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function naturalKey(
  season: number,
  providerGameId: string,
  teamIdInternal: string
): string {
  return `${season}|${providerGameId}|${teamIdInternal}`;
}

export function canonicalOaDb1FingerprintPayload(
  row: Omit<OaDb1PlannedRow, 'recordFingerprintSha256'>
): unknown[] {
  return [
    OA_DB_1_VERSION,
    row.season,
    row.providerGameId,
    row.providerWeek,
    row.startDate,
    row.neutralSite,
    row.homeTeamNameCfbd,
    row.awayTeamNameCfbd,
    row.teamNameCfbd,
    row.opponentNameCfbd,
    row.teamIdInternal,
    row.opponentTeamIdInternal,
    row.isHome,
    row.availabilityStatus,
    canonicalNumber(row.ppaOff),
    canonicalNumber(row.ppaDef),
    canonicalNumber(row.successOff),
    canonicalNumber(row.successDef),
    row.sourceSeason,
    row.sourceArtifactId,
    row.sourceArtifactZipSha256,
    row.sourceEndpoint,
    row.sourceRawMember,
    row.sourceMethod,
    row.archiveContractVersion,
    row.archiveRunId,
    row.archiveArtifactId,
    row.archiveArtifactZipSha256,
  ];
}

export function fingerprintOaDb1Row(
  row: Omit<OaDb1PlannedRow, 'recordFingerprintSha256'>
): string {
  return sha256Utf8(JSON.stringify(canonicalOaDb1FingerprintPayload(row)));
}

export function buildOaDb1PlannedRows(input: {
  archiveRows: OaDb1ArchiveRow[];
  teamMapRows: OaDb1TeamMapRow[];
  existingTeamIds: string[];
}): { rows: OaDb1PlannedRow[]; blockers: string[] } {
  const blockers: string[] = [];

  if (input.archiveRows.length !== 5996) {
    blockers.push(
      `archive row count must equal 5996 (got ${input.archiveRows.length})`
    );
  }

  const teamMap = new Map<string, string>();
  const duplicateMapNames = new Set<string>();
  for (const row of input.teamMapRows) {
    const name = text(row.teamNameCfbd);
    const id = text(row.teamIdInternal);
    if (!name || !id) {
      blockers.push('cfbd_team_map contains blank name/id');
      continue;
    }
    if (teamMap.has(name)) duplicateMapNames.add(name);
    else teamMap.set(name, id);
  }
  for (const name of [...duplicateMapNames].sort()) {
    blockers.push(`duplicate cfbd_team_map provider name: ${name}`);
  }

  const teamIds = new Set(input.existingTeamIds.map(text).filter(Boolean));
  const rows: OaDb1PlannedRow[] = [];
  const plannedKeys = new Set<string>();
  let duplicatePlannedKeys = 0;

  for (const raw of input.archiveRows) {
    if (!FROZEN_COUNTS.has(raw.season)) {
      blockers.push(`archive row outside 2022-2025: ${raw.season}`);
      continue;
    }
    if (raw.contractVersion !== OA_DB_1_ARCHIVE_CONTRACT) {
      blockers.push(
        `archive contract mismatch for ${raw.season}/${raw.providerGameId}/${raw.team}`
      );
      continue;
    }

    const providerGameId = String(raw.providerGameId);
    const frozenSource = FROZEN_SOURCE_BY_SEASON.get(raw.season);
    if (
      !frozenSource ||
      raw.sourceSeason !== raw.season ||
      String(raw.sourceArtifactId) !== frozenSource.artifactId ||
      text(raw.sourceArtifactZipSha256) !== frozenSource.zipSha256 ||
      text(raw.sourceEndpoint) !== '/stats/game/advanced' ||
      text(raw.sourceRawMember) !== 'raw/003-advanced-game-stats.json'
    ) {
      blockers.push(
        `source provenance mismatch: ${raw.season}/${providerGameId}/${raw.team}`
      );
      continue;
    }

    const teamName = text(raw.team);
    const opponentName = text(raw.opponent);
    const homeName = text(raw.homeTeam);
    const awayName = text(raw.awayTeam);

    if (
      !Number.isInteger(raw.providerGameId) ||
      !Number.isInteger(raw.providerWeek) ||
      raw.providerWeek < 0 ||
      !teamName ||
      !opponentName ||
      !homeName ||
      !awayName ||
      teamName === opponentName
    ) {
      blockers.push(
        `invalid archive identity: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }

    const expectedTeam = raw.isHome ? homeName : awayName;
    const expectedOpponent = raw.isHome ? awayName : homeName;
    if (teamName !== expectedTeam || opponentName !== expectedOpponent) {
      blockers.push(
        `archive orientation mismatch: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }

    const teamId = teamMap.get(teamName);
    const opponentTeamId = teamMap.get(opponentName);
    if (!teamId) {
      blockers.push(`missing cfbd_team_map mapping: ${teamName}`);
      continue;
    }
    if (!opponentTeamId) {
      blockers.push(`missing cfbd_team_map mapping: ${opponentName}`);
      continue;
    }
    if (!teamIds.has(teamId)) {
      blockers.push(`mapped team id missing from teams: ${teamName} -> ${teamId}`);
      continue;
    }
    if (!teamIds.has(opponentTeamId)) {
      blockers.push(
        `mapped opponent id missing from teams: ${opponentName} -> ${opponentTeamId}`
      );
      continue;
    }
    if (teamId === opponentTeamId) {
      blockers.push(
        `team and opponent map to same internal id: ${raw.season}/${providerGameId}`
      );
      continue;
    }

    if (
      raw.status !== 'AVAILABLE' &&
      raw.status !== 'SOURCE_UNAVAILABLE'
    ) {
      blockers.push(
        `unsupported availability status: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }
    if (
      raw.sourceMethod !== 'DIRECT_PROVIDER_ROW' &&
      raw.sourceMethod !== 'SOURCE_UNAVAILABLE'
    ) {
      blockers.push(
        `unsupported source method: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }

    if (raw.status === 'AVAILABLE') {
      if (
        raw.sourceMethod !== 'DIRECT_PROVIDER_ROW' ||
        !finite(raw.ppaOff) ||
        !finite(raw.ppaDef) ||
        !finite(raw.successOff) ||
        !finite(raw.successDef)
      ) {
        blockers.push(
          `invalid AVAILABLE row: ${raw.season}/${providerGameId}/${teamName}`
        );
        continue;
      }
    } else if (
      raw.sourceMethod !== 'SOURCE_UNAVAILABLE' ||
      raw.ppaOff !== null ||
      raw.ppaDef !== null ||
      raw.successOff !== null ||
      raw.successDef !== null
    ) {
      blockers.push(
        `invalid SOURCE_UNAVAILABLE row: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }

    const withoutFingerprint: Omit<
      OaDb1PlannedRow,
      'recordFingerprintSha256'
    > = {
      season: raw.season,
      providerGameId,
      providerWeek: raw.providerWeek,
      startDate: raw.startDate ?? null,
      neutralSite:
        typeof raw.neutralSite === 'boolean' ? raw.neutralSite : null,
      homeTeamNameCfbd: homeName,
      awayTeamNameCfbd: awayName,
      teamNameCfbd: teamName,
      opponentNameCfbd: opponentName,
      teamIdInternal: teamId,
      opponentTeamIdInternal: opponentTeamId,
      isHome: raw.isHome,
      availabilityStatus: raw.status,
      ppaOff: raw.ppaOff,
      ppaDef: raw.ppaDef,
      successOff: raw.successOff,
      successDef: raw.successDef,
      sourceSeason: raw.sourceSeason,
      sourceArtifactId: String(raw.sourceArtifactId),
      sourceArtifactZipSha256: text(raw.sourceArtifactZipSha256),
      sourceEndpoint: text(raw.sourceEndpoint),
      sourceRawMember: text(raw.sourceRawMember),
      sourceMethod: raw.sourceMethod,
      archiveContractVersion: raw.contractVersion,
      archiveRunId: OA_DB_1_ARCHIVE_RUN_ID,
      archiveArtifactId: OA_DB_1_ARCHIVE_ARTIFACT_ID,
      archiveArtifactZipSha256: OA_DB_1_ARCHIVE_ZIP_SHA256,
    };

    if (
      !withoutFingerprint.sourceArtifactZipSha256 ||
      !withoutFingerprint.sourceEndpoint ||
      !withoutFingerprint.sourceRawMember
    ) {
      blockers.push(
        `missing source provenance: ${raw.season}/${providerGameId}/${teamName}`
      );
      continue;
    }

    const row: OaDb1PlannedRow = {
      ...withoutFingerprint,
      recordFingerprintSha256: fingerprintOaDb1Row(withoutFingerprint),
    };

    const key = naturalKey(row.season, row.providerGameId, row.teamIdInternal);
    if (plannedKeys.has(key)) duplicatePlannedKeys += 1;
    else plannedKeys.add(key);

    rows.push(row);
  }

  if (duplicatePlannedKeys > 0) {
    blockers.push(
      `duplicate planned natural keys: ${duplicatePlannedKeys}`
    );
  }

  for (const [season, expected] of FROZEN_COUNTS) {
    const seasonRows = rows.filter((row) => row.season === season);
    const available = seasonRows.filter(
      (row) => row.availabilityStatus === 'AVAILABLE'
    ).length;
    const unavailable = seasonRows.filter(
      (row) => row.availabilityStatus === 'SOURCE_UNAVAILABLE'
    ).length;
    if (
      seasonRows.length !== expected.rows ||
      available !== expected.available ||
      unavailable !== expected.unavailable
    ) {
      blockers.push(
        `season ${season} count mismatch: rows=${seasonRows.length} available=${available} unavailable=${unavailable}`
      );
    }
  }

  const unavailable2024Games = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.season === 2024 &&
            row.availabilityStatus === 'SOURCE_UNAVAILABLE'
        )
        .map((row) => Number(row.providerGameId))
    ),
  ].sort((a, b) => a - b);
  const expectedUnavailableGames = [
    ...OA_DB_1_2024_UNAVAILABLE_GAME_IDS,
  ].sort((a, b) => a - b);

  if (
    unavailable2024Games.length !== expectedUnavailableGames.length ||
    unavailable2024Games.some(
      (gameId, index) => gameId !== expectedUnavailableGames[index]
    )
  ) {
    blockers.push('2024 unavailable game set mismatch');
  }

  return {
    rows: rows.sort(
      (a, b) =>
        a.season - b.season ||
        Number(a.providerGameId) - Number(b.providerGameId) ||
        Number(b.isHome) - Number(a.isHome) ||
        a.teamNameCfbd.localeCompare(b.teamNameCfbd)
    ),
    blockers: [...new Set(blockers)].sort(),
  };
}

export function planOaDb1Preview(input: {
  archiveRows: OaDb1ArchiveRow[];
  teamMapRows: OaDb1TeamMapRow[];
  existingTeamIds: string[];
  targetTableExists: boolean;
  existingRows: OaDb1ExistingRow[];
}): OaDb1PreviewPlan {
  const built = buildOaDb1PlannedRows(input);
  const blockers = [...built.blockers];

  const existingByKey = new Map<string, OaDb1ExistingRow>();
  let duplicateExistingNaturalKeys = 0;
  let existing2026Rows = 0;

  for (const row of input.existingRows) {
    const key = naturalKey(
      row.season,
      String(row.providerGameId),
      text(row.teamIdInternal)
    );
    if (existingByKey.has(key)) duplicateExistingNaturalKeys += 1;
    else existingByKey.set(key, row);
    if (row.season === 2026) existing2026Rows += 1;
  }

  if (duplicateExistingNaturalKeys > 0) {
    blockers.push(
      `duplicate existing natural keys: ${duplicateExistingNaturalKeys}`
    );
  }

  let create = 0;
  let identical = 0;
  let conflict = 0;
  const conflictKeys: string[] = [];
  const plannedKeys = new Set<string>();

  const perSeasonMap = new Map<number, {
    season: number;
    plannedRows: number;
    create: number;
    identical: number;
    conflict: number;
    sourceUnavailable: number;
  }>();

  for (const row of built.rows) {
    const key = naturalKey(row.season, row.providerGameId, row.teamIdInternal);
    plannedKeys.add(key);
    const bucket = perSeasonMap.get(row.season) ?? {
      season: row.season,
      plannedRows: 0,
      create: 0,
      identical: 0,
      conflict: 0,
      sourceUnavailable: 0,
    };
    bucket.plannedRows += 1;
    if (row.availabilityStatus === 'SOURCE_UNAVAILABLE') {
      bucket.sourceUnavailable += 1;
    }

    const existing = existingByKey.get(key);
    if (!existing) {
      create += 1;
      bucket.create += 1;
    } else if (
      text(existing.recordFingerprintSha256) === row.recordFingerprintSha256
    ) {
      identical += 1;
      bucket.identical += 1;
    } else {
      conflict += 1;
      bucket.conflict += 1;
      conflictKeys.push(key);
    }
    perSeasonMap.set(row.season, bucket);
  }

  const unexpectedExistingKeys = [...existingByKey.entries()]
    .filter(
      ([key, row]) =>
        row.season >= 2022 &&
        row.season <= 2025 &&
        !plannedKeys.has(key)
    )
    .map(([key]) => key)
    .sort();

  if (conflict > 0) blockers.push(`conflicting existing rows: ${conflict}`);
  if (unexpectedExistingKeys.length > 0) {
    blockers.push(
      `unexpected existing 2022-2025 rows: ${unexpectedExistingKeys.length}`
    );
  }

  const sourceUnavailable = built.rows.filter(
    (row) => row.availabilityStatus === 'SOURCE_UNAVAILABLE'
  ).length;

  return {
    version: OA_DB_1_VERSION,
    targetTable: OA_DB_1_TABLE,
    targetTableExists: input.targetTableExists,
    schemaDeploymentRequired: !input.targetTableExists,
    previewSafe: blockers.length === 0,
    dataCommitEligible: false,
    writeBlockers: [...new Set(blockers)].sort(),
    counts: {
      archiveRows: input.archiveRows.length,
      plannedRows: built.rows.length,
      create,
      identical,
      update: 0,
      conflict,
      sourceUnavailable,
      unexpectedExisting: unexpectedExistingKeys.length,
      duplicatePlannedNaturalKeys: built.rows.length - plannedKeys.size,
      duplicateExistingNaturalKeys,
      existing2026Rows,
      planned2026Mutations: 0,
    },
    perSeason: [...perSeasonMap.values()].sort(
      (a, b) => a.season - b.season
    ),
    conflictKeys: conflictKeys.sort(),
    unexpectedExistingKeys,
    plannedRows: built.rows,
  };
}
