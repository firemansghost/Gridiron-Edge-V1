/**
 * Candidate B V1 exact-float8 child persistence transport.
 *
 * Persistence invariant only. Does not enter semantic manifests, rowHash, or snapshotHash.
 * Parent creation remains Prisma-based. Child floats travel as TEXT -> ::double precision.
 */

import cuid from 'cuid';
import { Prisma } from '@prisma/client';
import {
  CANDIDATE_B_EXPECTED_TEAM_COUNT,
  CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS,
  candidateBNullableFloat8StorageText,
  type TeamFeatureRow,
} from './candidate-b-v1-feature-snapshot';

export type CandidateBChildTransportRow = {
  id: string;
  snapshotId: string;
  teamId: string;
  season: number;
  availabilityStatus: string;
  unavailableReasons: string[];
  priorCoreRaw: string | null;
  talentRaw: string | null;
  returningRaw: string | null;
  portalRaw: string | null;
  zCore: string | null;
  zTalent: string | null;
  zReturning: string | null;
  zPortal: string | null;
  candidateBRawComposite: string | null;
  candidateBCompositeZ: string | null;
  candidateBTeamRatingPoints: string | null;
  inboundTransferCount: number;
  inboundRatedCount: number;
  inboundRatedCoverage: string | null;
  inboundDirectionStatus: string;
  inboundMeanRating: string | null;
  outboundTransferCount: number;
  outboundRatedCount: number;
  outboundRatedCoverage: string | null;
  outboundDirectionStatus: string;
  outboundMeanRating: string | null;
  rowHash: string;
};

export function generateCandidateBChildCuids(count: number): string[] {
  const ids = Array.from({ length: count }, () => cuid());
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('candidate_b_child_id_invalid');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('candidate_b_child_id_not_unique');
  }
  if (ids.some((id) => !cuid.isCuid(id))) {
    throw new Error('candidate_b_child_id_not_cuid');
  }
  return ids;
}

export function buildCandidateBChildTransportRows(
  snapshotId: string,
  teams: TeamFeatureRow[],
  ids?: string[]
): CandidateBChildTransportRow[] {
  const childIds = ids ?? generateCandidateBChildCuids(teams.length);
  if (childIds.length !== teams.length) {
    throw new Error(`candidate_b_child_id_count_mismatch:${childIds.length}`);
  }
  return teams.map((team, index) => ({
    id: childIds[index],
    snapshotId,
    teamId: team.teamId,
    season: team.season,
    availabilityStatus: team.availabilityStatus,
    unavailableReasons: [...team.unavailableReasons],
    priorCoreRaw: candidateBNullableFloat8StorageText(team.priorCoreRaw),
    talentRaw: candidateBNullableFloat8StorageText(team.talentRaw),
    returningRaw: candidateBNullableFloat8StorageText(team.returningRaw),
    portalRaw: candidateBNullableFloat8StorageText(team.portalRaw),
    zCore: candidateBNullableFloat8StorageText(team.zCore),
    zTalent: candidateBNullableFloat8StorageText(team.zTalent),
    zReturning: candidateBNullableFloat8StorageText(team.zReturning),
    zPortal: candidateBNullableFloat8StorageText(team.zPortal),
    candidateBRawComposite: candidateBNullableFloat8StorageText(team.candidateBRawComposite),
    candidateBCompositeZ: candidateBNullableFloat8StorageText(team.candidateBCompositeZ),
    candidateBTeamRatingPoints: candidateBNullableFloat8StorageText(team.candidateBTeamRatingPoints),
    inboundTransferCount: team.inboundTransferCount,
    inboundRatedCount: team.inboundRatedCount,
    inboundRatedCoverage: candidateBNullableFloat8StorageText(team.inboundRatedCoverage),
    inboundDirectionStatus: team.inboundDirectionStatus,
    inboundMeanRating: candidateBNullableFloat8StorageText(team.inboundMeanRating),
    outboundTransferCount: team.outboundTransferCount,
    outboundRatedCount: team.outboundRatedCount,
    outboundRatedCoverage: candidateBNullableFloat8StorageText(team.outboundRatedCoverage),
    outboundDirectionStatus: team.outboundDirectionStatus,
    outboundMeanRating: candidateBNullableFloat8StorageText(team.outboundMeanRating),
    rowHash: team.rowHash,
  }));
}

export function serializeCandidateBChildTransportPayload(rows: CandidateBChildTransportRow[]): string {
  const payloadJson = JSON.stringify(rows);
  if (typeof payloadJson !== 'string') {
    throw new Error('candidate_b_child_payload_not_text');
  }
  return payloadJson;
}

export function buildCandidateBChildInsertSql(payloadJson: string): Prisma.Sql {
  if (typeof payloadJson !== 'string') {
    throw new Error('candidate_b_child_payload_not_text');
  }
  return Prisma.sql`
    INSERT INTO "shadow_model_feature_snapshot_teams" (
      "id",
      "snapshot_id",
      "team_id",
      "season",
      "availability_status",
      "unavailable_reasons",
      "prior_core_raw",
      "talent_raw",
      "returning_raw",
      "portal_raw",
      "z_core",
      "z_talent",
      "z_returning",
      "z_portal",
      "candidate_b_raw_composite",
      "candidate_b_composite_z",
      "candidate_b_team_rating_points",
      "inbound_transfer_count",
      "inbound_rated_count",
      "inbound_rated_coverage",
      "inbound_direction_status",
      "inbound_mean_rating",
      "outbound_transfer_count",
      "outbound_rated_count",
      "outbound_rated_coverage",
      "outbound_direction_status",
      "outbound_mean_rating",
      "row_hash"
    )
    SELECT
      elem->>'id',
      elem->>'snapshotId',
      elem->>'teamId',
      (elem->>'season')::integer,
      elem->>'availabilityStatus',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'unavailableReasons', '[]'::jsonb))),
      (elem->>'priorCoreRaw')::double precision,
      (elem->>'talentRaw')::double precision,
      (elem->>'returningRaw')::double precision,
      (elem->>'portalRaw')::double precision,
      (elem->>'zCore')::double precision,
      (elem->>'zTalent')::double precision,
      (elem->>'zReturning')::double precision,
      (elem->>'zPortal')::double precision,
      (elem->>'candidateBRawComposite')::double precision,
      (elem->>'candidateBCompositeZ')::double precision,
      (elem->>'candidateBTeamRatingPoints')::double precision,
      (elem->>'inboundTransferCount')::integer,
      (elem->>'inboundRatedCount')::integer,
      (elem->>'inboundRatedCoverage')::double precision,
      elem->>'inboundDirectionStatus',
      (elem->>'inboundMeanRating')::double precision,
      (elem->>'outboundTransferCount')::integer,
      (elem->>'outboundRatedCount')::integer,
      (elem->>'outboundRatedCoverage')::double precision,
      elem->>'outboundDirectionStatus',
      (elem->>'outboundMeanRating')::double precision,
      elem->>'rowHash'
    FROM jsonb_array_elements((${payloadJson})::jsonb) AS elem
  `;
}

export function candidateBChildInsertSqlText(sql: Prisma.Sql): string {
  return sql.strings.join('?');
}

export function assertCandidateBChildInsertSqlContract(sql: Prisma.Sql, payloadJson: string): void {
  const text = candidateBChildInsertSqlText(sql);
  if (!text.includes('"shadow_model_feature_snapshot_teams"')) {
    throw new Error('candidate_b_child_insert_table_mismatch');
  }
  if (/ON CONFLICT|UPDATE|DELETE|MERGE/i.test(text)) {
    throw new Error('candidate_b_child_insert_mutating_conflict_logic');
  }
  if (sql.values.length !== 1 || typeof sql.values[0] !== 'string') {
    throw new Error('candidate_b_child_insert_payload_not_single_text_parameter');
  }
  if (sql.values[0] !== payloadJson) {
    throw new Error('candidate_b_child_insert_payload_mismatch');
  }
  if (sql.values.some((value) => typeof value === 'number')) {
    throw new Error('candidate_b_child_insert_numeric_parameter');
  }
  const floatCasts = (text.match(/::double precision/g) ?? []).length;
  if (floatCasts !== CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS.length) {
    throw new Error(`candidate_b_child_insert_float_cast_count:${floatCasts}`);
  }
}

export async function insertCandidateBFeatureSnapshotTeamsExact(
  tx: { $executeRaw: (query: Prisma.Sql) => PromiseLike<number> },
  snapshotId: string,
  teams: TeamFeatureRow[]
): Promise<number> {
  if (teams.length !== CANDIDATE_B_EXPECTED_TEAM_COUNT) {
    throw new Error(`candidate_b_child_insert_count_mismatch:${teams.length}`);
  }
  const rows = buildCandidateBChildTransportRows(snapshotId, teams);
  const payloadJson = serializeCandidateBChildTransportPayload(rows);
  const sql = buildCandidateBChildInsertSql(payloadJson);
  assertCandidateBChildInsertSqlContract(sql, payloadJson);
  const inserted = await tx.$executeRaw(sql);
  if (inserted !== CANDIDATE_B_EXPECTED_TEAM_COUNT) {
    throw new Error(`candidate_b_child_insert_count_mismatch:${inserted}`);
  }
  return inserted;
}
