/**
 * Candidate B V1 exact-float8 child persistence read transport.
 *
 * Persistence invariant only. Does not enter semantic manifests, rowHash, or snapshotHash.
 * Parent reads remain Prisma-based. Child floats travel as float8send hex -> Buffer.readDoubleBE.
 */

import { Prisma } from '@prisma/client';
import { sha256CanonicalJson } from '../../../../web/lib/shadow-model-capture-v1';
import {
  CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS,
  type PersistedTeamRow,
} from './candidate-b-v1-feature-snapshot';

export const PERSISTENCE_READ_CONTRACT_ID = 'candidate_b_v1_exact_float8_binary_read_v1' as const;

export const PERSISTENCE_READ_CONTRACT_MANIFEST = {
  contractId: PERSISTENCE_READ_CONTRACT_ID,
  semanticRole: 'NON_SEMANTIC_PERSISTENCE_READ_TRANSPORT',
  sourceDatabaseType: 'POSTGRESQL_DOUBLE_PRECISION',
  databaseExtraction: 'ENCODE_FLOAT8SEND_HEX',
  wireRepresentation: 'LOWERCASE_HEX_16',
  nullEncoding: 'SQL_NULL',
  jsDecode: 'BUFFER_READ_DOUBLE_BE',
  exactBitRequirement: true,
  childFloatFieldCount: 15,
  parentReadPath: 'PRISMA_PARENT_JSON_VERIFIED',
  rowHashVerification: 'EXACT_138_OF_138',
  snapshotHashVerification: 'EXACT',
  schemaMigrationRequired: false,
} as const;

export const FROZEN_PERSISTENCE_READ_CONTRACT_HASH =
  '88e6f3ac4b2761cf56509842be8c9d52f342d3b9f611cf3add655b68f448592e';

export const PERSISTENCE_READ_CONTRACT_HASH = sha256CanonicalJson(PERSISTENCE_READ_CONTRACT_MANIFEST);

if (PERSISTENCE_READ_CONTRACT_HASH !== FROZEN_PERSISTENCE_READ_CONTRACT_HASH) {
  throw new Error(
    `persistence_read_contract_hash_mismatch:${PERSISTENCE_READ_CONTRACT_HASH}!=${FROZEN_PERSISTENCE_READ_CONTRACT_HASH}`
  );
}

export const CANDIDATE_B_FLOAT8_READ_COLUMNS = [
  { field: 'priorCoreRaw', column: 'prior_core_raw', hexAlias: 'priorCoreRawHex' },
  { field: 'talentRaw', column: 'talent_raw', hexAlias: 'talentRawHex' },
  { field: 'returningRaw', column: 'returning_raw', hexAlias: 'returningRawHex' },
  { field: 'portalRaw', column: 'portal_raw', hexAlias: 'portalRawHex' },
  { field: 'zCore', column: 'z_core', hexAlias: 'zCoreHex' },
  { field: 'zTalent', column: 'z_talent', hexAlias: 'zTalentHex' },
  { field: 'zReturning', column: 'z_returning', hexAlias: 'zReturningHex' },
  { field: 'zPortal', column: 'z_portal', hexAlias: 'zPortalHex' },
  { field: 'candidateBRawComposite', column: 'candidate_b_raw_composite', hexAlias: 'candidateBRawCompositeHex' },
  { field: 'candidateBCompositeZ', column: 'candidate_b_composite_z', hexAlias: 'candidateBCompositeZHex' },
  {
    field: 'candidateBTeamRatingPoints',
    column: 'candidate_b_team_rating_points',
    hexAlias: 'candidateBTeamRatingPointsHex',
  },
  { field: 'inboundRatedCoverage', column: 'inbound_rated_coverage', hexAlias: 'inboundRatedCoverageHex' },
  { field: 'inboundMeanRating', column: 'inbound_mean_rating', hexAlias: 'inboundMeanRatingHex' },
  { field: 'outboundRatedCoverage', column: 'outbound_rated_coverage', hexAlias: 'outboundRatedCoverageHex' },
  { field: 'outboundMeanRating', column: 'outbound_mean_rating', hexAlias: 'outboundMeanRatingHex' },
] as const;

export type CandidateBFloat8HexAlias = (typeof CANDIDATE_B_FLOAT8_READ_COLUMNS)[number]['hexAlias'];

export type CandidateBExactChildRawRow = {
  teamId: string;
  season: number;
  availabilityStatus: string;
  unavailableReasons: string[];
  inboundTransferCount: number;
  inboundRatedCount: number;
  inboundDirectionStatus: string;
  outboundTransferCount: number;
  outboundRatedCount: number;
  outboundDirectionStatus: string;
  rowHash: string;
  priorCoreRawHex: string | null;
  talentRawHex: string | null;
  returningRawHex: string | null;
  portalRawHex: string | null;
  zCoreHex: string | null;
  zTalentHex: string | null;
  zReturningHex: string | null;
  zPortalHex: string | null;
  candidateBRawCompositeHex: string | null;
  candidateBCompositeZHex: string | null;
  candidateBTeamRatingPointsHex: string | null;
  inboundRatedCoverageHex: string | null;
  inboundMeanRatingHex: string | null;
  outboundRatedCoverageHex: string | null;
  outboundMeanRatingHex: string | null;
};

if (CANDIDATE_B_FLOAT8_READ_COLUMNS.length !== CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS.length) {
  throw new Error('candidate_b_float8_read_column_count_mismatch');
}
for (let i = 0; i < CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS.length; i++) {
  if (CANDIDATE_B_FLOAT8_READ_COLUMNS[i].field !== CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS[i]) {
    throw new Error(`candidate_b_float8_read_column_order_mismatch:${CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS[i]}`);
  }
}

export function candidateBFloat8FromHex(hex: string): number {
  if (!/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error('candidate_b_float8_hex_invalid');
  }
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 8) {
    throw new Error('candidate_b_float8_byte_length_invalid');
  }
  return bytes.readDoubleBE(0);
}

export function candidateBNullableFloat8FromHex(hex: string | null): number | null {
  if (hex === null) return null;
  return candidateBFloat8FromHex(hex);
}

export function buildCandidateBChildSelectSql(snapshotId: string): Prisma.Sql {
  if (typeof snapshotId !== 'string' || snapshotId.length === 0) {
    throw new Error('candidate_b_child_select_snapshot_id_invalid');
  }
  return Prisma.sql`
    SELECT
      "team_id" AS "teamId",
      "season" AS "season",
      "availability_status" AS "availabilityStatus",
      "unavailable_reasons" AS "unavailableReasons",
      "inbound_transfer_count" AS "inboundTransferCount",
      "inbound_rated_count" AS "inboundRatedCount",
      "inbound_direction_status" AS "inboundDirectionStatus",
      "outbound_transfer_count" AS "outboundTransferCount",
      "outbound_rated_count" AS "outboundRatedCount",
      "outbound_direction_status" AS "outboundDirectionStatus",
      "row_hash" AS "rowHash",
      CASE WHEN "prior_core_raw" IS NULL THEN NULL ELSE encode(float8send("prior_core_raw"), 'hex') END AS "priorCoreRawHex",
      CASE WHEN "talent_raw" IS NULL THEN NULL ELSE encode(float8send("talent_raw"), 'hex') END AS "talentRawHex",
      CASE WHEN "returning_raw" IS NULL THEN NULL ELSE encode(float8send("returning_raw"), 'hex') END AS "returningRawHex",
      CASE WHEN "portal_raw" IS NULL THEN NULL ELSE encode(float8send("portal_raw"), 'hex') END AS "portalRawHex",
      CASE WHEN "z_core" IS NULL THEN NULL ELSE encode(float8send("z_core"), 'hex') END AS "zCoreHex",
      CASE WHEN "z_talent" IS NULL THEN NULL ELSE encode(float8send("z_talent"), 'hex') END AS "zTalentHex",
      CASE WHEN "z_returning" IS NULL THEN NULL ELSE encode(float8send("z_returning"), 'hex') END AS "zReturningHex",
      CASE WHEN "z_portal" IS NULL THEN NULL ELSE encode(float8send("z_portal"), 'hex') END AS "zPortalHex",
      CASE WHEN "candidate_b_raw_composite" IS NULL THEN NULL ELSE encode(float8send("candidate_b_raw_composite"), 'hex') END AS "candidateBRawCompositeHex",
      CASE WHEN "candidate_b_composite_z" IS NULL THEN NULL ELSE encode(float8send("candidate_b_composite_z"), 'hex') END AS "candidateBCompositeZHex",
      CASE WHEN "candidate_b_team_rating_points" IS NULL THEN NULL ELSE encode(float8send("candidate_b_team_rating_points"), 'hex') END AS "candidateBTeamRatingPointsHex",
      CASE WHEN "inbound_rated_coverage" IS NULL THEN NULL ELSE encode(float8send("inbound_rated_coverage"), 'hex') END AS "inboundRatedCoverageHex",
      CASE WHEN "inbound_mean_rating" IS NULL THEN NULL ELSE encode(float8send("inbound_mean_rating"), 'hex') END AS "inboundMeanRatingHex",
      CASE WHEN "outbound_rated_coverage" IS NULL THEN NULL ELSE encode(float8send("outbound_rated_coverage"), 'hex') END AS "outboundRatedCoverageHex",
      CASE WHEN "outbound_mean_rating" IS NULL THEN NULL ELSE encode(float8send("outbound_mean_rating"), 'hex') END AS "outboundMeanRatingHex"
    FROM "shadow_model_feature_snapshot_teams"
    WHERE "snapshot_id" = ${snapshotId}
    ORDER BY "team_id" ASC
  `;
}

export function candidateBChildSelectSqlText(sql: Prisma.Sql): string {
  return sql.strings.join('?');
}

export function assertCandidateBChildSelectSqlContract(sql: Prisma.Sql, snapshotId: string): void {
  const text = candidateBChildSelectSqlText(sql);
  if (!text.includes('"shadow_model_feature_snapshot_teams"')) {
    throw new Error('candidate_b_child_select_table_mismatch');
  }
  if (!text.includes('"snapshot_id"')) {
    throw new Error('candidate_b_child_select_snapshot_id_filter_missing');
  }
  if (!/ORDER BY\s+"team_id"\s+ASC/i.test(text)) {
    throw new Error('candidate_b_child_select_order_missing');
  }
  if (/INSERT|UPDATE|DELETE|MERGE/i.test(text)) {
    throw new Error('candidate_b_child_select_mutating_sql');
  }
  if (sql.values.length !== 1 || typeof sql.values[0] !== 'string') {
    throw new Error('candidate_b_child_select_snapshot_id_not_single_text_parameter');
  }
  if (sql.values[0] !== snapshotId) {
    throw new Error('candidate_b_child_select_snapshot_id_mismatch');
  }
  const float8sendCount = (text.match(/float8send\(/g) ?? []).length;
  const encodeCount = (text.match(/encode\(/g) ?? []).length;
  if (float8sendCount !== CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS.length) {
    throw new Error(`candidate_b_child_select_float8send_count:${float8sendCount}`);
  }
  if (encodeCount !== CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS.length) {
    throw new Error(`candidate_b_child_select_encode_count:${encodeCount}`);
  }
  for (const { column } of CANDIDATE_B_FLOAT8_READ_COLUMNS) {
    const directSelect = new RegExp(`AS\\s+"${column}"`, 'i');
    if (directSelect.test(text)) {
      throw new Error(`candidate_b_child_select_direct_float_column:${column}`);
    }
    if (!text.includes(`encode(float8send("${column}"), 'hex')`)) {
      throw new Error(`candidate_b_child_select_missing_float8send:${column}`);
    }
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`candidate_b_child_string_invalid:${label}`);
  }
  return value;
}

function requireInt(value: unknown, label: string): number {
  if (typeof value === 'bigint') {
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error(`candidate_b_child_int_invalid:${label}`);
    return n;
  }
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new Error(`candidate_b_child_int_invalid:${label}`);
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`candidate_b_child_string_array_invalid:${label}`);
  }
  return [...value];
}

function requireHexOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`candidate_b_child_hex_type_invalid:${label}`);
  }
  return value;
}

export function mapCandidateBExactChildRow(row: CandidateBExactChildRawRow): PersistedTeamRow {
  const mapped: PersistedTeamRow = {
    teamId: requireNonEmptyString(row.teamId, 'teamId'),
    season: requireInt(row.season, 'season'),
    availabilityStatus: requireNonEmptyString(row.availabilityStatus, 'availabilityStatus'),
    unavailableReasons: requireStringArray(row.unavailableReasons, 'unavailableReasons'),
    inboundTransferCount: requireInt(row.inboundTransferCount, 'inboundTransferCount'),
    inboundRatedCount: requireInt(row.inboundRatedCount, 'inboundRatedCount'),
    inboundDirectionStatus: requireNonEmptyString(row.inboundDirectionStatus, 'inboundDirectionStatus'),
    outboundTransferCount: requireInt(row.outboundTransferCount, 'outboundTransferCount'),
    outboundRatedCount: requireInt(row.outboundRatedCount, 'outboundRatedCount'),
    outboundDirectionStatus: requireNonEmptyString(row.outboundDirectionStatus, 'outboundDirectionStatus'),
    rowHash: requireNonEmptyString(row.rowHash, 'rowHash'),
    priorCoreRaw: null,
    talentRaw: null,
    returningRaw: null,
    portalRaw: null,
    zCore: null,
    zTalent: null,
    zReturning: null,
    zPortal: null,
    candidateBRawComposite: null,
    candidateBCompositeZ: null,
    candidateBTeamRatingPoints: null,
    inboundRatedCoverage: null,
    inboundMeanRating: null,
    outboundRatedCoverage: null,
    outboundMeanRating: null,
  };
  for (const { field, hexAlias } of CANDIDATE_B_FLOAT8_READ_COLUMNS) {
    mapped[field] = candidateBNullableFloat8FromHex(requireHexOrNull(row[hexAlias], hexAlias));
  }
  return mapped;
}

export async function loadCandidateBFeatureSnapshotTeamsExact(
  db: { $queryRaw: (query: Prisma.Sql) => PromiseLike<unknown> },
  snapshotId: string
): Promise<PersistedTeamRow[]> {
  const sql = buildCandidateBChildSelectSql(snapshotId);
  assertCandidateBChildSelectSqlContract(sql, snapshotId);
  const rows = await db.$queryRaw(sql);
  if (!Array.isArray(rows)) {
    throw new Error('candidate_b_child_select_result_not_array');
  }
  const mapped = rows.map((row) => mapCandidateBExactChildRow(row as CandidateBExactChildRawRow));
  const ids = mapped.map((row) => row.teamId);
  if (new Set(ids).size !== ids.length) {
    throw new Error('candidate_b_child_select_duplicate_team_id');
  }
  return mapped;
}
