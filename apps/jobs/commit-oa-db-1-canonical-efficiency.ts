import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  OA_DB_1_ARCHIVE_ARTIFACT_ID,
  OA_DB_1_ARCHIVE_CONTRACT,
  OA_DB_1_ARCHIVE_RUN_ID,
  OA_DB_1_ARCHIVE_ZIP_SHA256,
  OA_DB_1_TABLE,
  OA_DB_1_VERSION,
  planOaDb1Preview,
  type OaDb1ArchiveRow,
  type OaDb1ExistingRow,
  type OaDb1PlannedRow,
  type OaDb1PreviewPlan,
} from './src/research/oa-db-1-canonical-efficiency';

export const OA_DB_1_COMMIT_CONFIRMATION =
  'WRITE_OA_DB_1_CANONICAL_EFFICIENCY_2022_2025' as const;
export const OA_DB_1_TRANSACTION_TIMEOUT_MS = 180_000;
export const OA_DB_1_INSERT_BATCH_SIZE = 200;

const EXPECTED_ARCHIVE_MEMBER_SHA256 =
  '6ccea22db8e74feabdc08bbe9b422703486d48fa6820a4dfa802475e04420ff2';
const EXPECTED_ARCHIVE_MEMBER_BYTES = 5085305;

interface Args {
  sourceZip: string;
  reviewedPreviewZip: string;
  reviewedPreviewSha256: string;
  reviewedPreviewRunId: string;
  expectedRepoSha: string;
  confirm: string;
  report: string;
}

interface ManifestEntry {
  file: string;
  bytes: number;
  sha256: string;
}

interface ArchiveManifest {
  version: string;
  builderRepoSha: string;
  artifacts: ManifestEntry[];
}

interface ReviewedPreviewReport {
  version: string;
  mode: string;
  executionContext?: {
    repoCommitSha?: string | null;
    workflowRunId?: string | null;
  };
  targetTable: string;
  targetTableExists: boolean;
  schemaDeploymentRequired: boolean;
  previewSafe: boolean;
  dataCommitEligible: boolean;
  writeBlockers: string[];
  counts: OaDb1PreviewPlan['counts'];
}

interface ReviewedPreviewPlan {
  version: string;
  executionContext?: {
    repoCommitSha?: string | null;
    workflowRunId?: string | null;
  };
  sourceArtifactId: string;
  sourceArtifactZipSha256: string;
  rows: OaDb1PlannedRow[];
}

interface PersistedRow {
  season: number;
  providerGameId: string;
  providerWeek: number;
  startDate: Date | null;
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
  sourceSeason: number;
  sourceArtifactId: string;
  sourceArtifactZipSha256: string;
  sourceEndpoint: string;
  sourceRawMember: string;
  sourceMethod: string;
  archiveContractVersion: string;
  archiveRunId: string;
  archiveArtifactId: string;
  archiveArtifactZipSha256: string;
  recordFingerprintSha256: string;
}

interface CommitFailureDetails {
  code: string;
  plan: OaDb1PreviewPlan | null;
  blockers: string[];
  mutationCallsAttempted: number;
  attemptedRowCount: number;
}

class OaDb1CommitFailure extends Error {
  readonly details: CommitFailureDetails;

  constructor(details: CommitFailureDetails) {
    super(details.code);
    this.name = 'OaDb1CommitFailure';
    this.details = details;
  }
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++i];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const args: Args = {
    sourceZip: values.get('--source-zip') ?? '',
    reviewedPreviewZip: values.get('--reviewed-preview-zip') ?? '',
    reviewedPreviewSha256: values.get('--reviewed-preview-sha256') ?? '',
    reviewedPreviewRunId: values.get('--reviewed-preview-run-id') ?? '',
    expectedRepoSha: values.get('--expected-repo-sha') ?? '',
    confirm: values.get('--confirm') ?? '',
    report: values.get('--report') ?? '',
  };

  for (const [key, value] of Object.entries(args)) {
    if (!value) throw new Error(`missing_required_argument:${key}`);
  }
  if (args.confirm !== OA_DB_1_COMMIT_CONFIRMATION) {
    throw new Error(
      `invalid_confirmation:expected_${OA_DB_1_COMMIT_CONFIRMATION}`
    );
  }
  if (!/^[0-9a-f]{40}$/.test(args.expectedRepoSha)) {
    throw new Error('invalid_expected_repo_sha');
  }
  if (!/^[0-9a-f]{64}$/.test(args.reviewedPreviewSha256)) {
    throw new Error('invalid_reviewed_preview_sha256');
  }
  if (!/^\d+$/.test(args.reviewedPreviewRunId)) {
    throw new Error('invalid_reviewed_preview_run_id');
  }

  return args;
}

export function parseOaDb1CommitArgs(argv: string[]):
  | { ok: true; value: Args }
  | { ok: false; errors: string[] } {
  try {
    return { ok: true, value: parseArgs(argv) };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Json(value: unknown): string {
  return sha256Bytes(Buffer.from(JSON.stringify(value), 'utf8'));
}

function archiveMembers(zipPath: string): string[] {
  const output = execFileSync('unzip', ['-Z1', zipPath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return output
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

function uniqueMemberBySuffix(
  members: string[],
  suffix: string
): string {
  const matches = members.filter((member) => member.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(
      `archive_member_suffix_count_mismatch:${suffix}:${matches.length}`
    );
  }
  return matches[0];
}

function archiveRead(zipPath: string, member: string): Buffer {
  return execFileSync('unzip', ['-p', zipPath, member], {
    maxBuffer: 128 * 1024 * 1024,
  });
}

function parseJson<T>(bytes: Buffer, label: string): T {
  try {
    return JSON.parse(bytes.toString('utf8')) as T;
  } catch {
    throw new Error(`invalid_json:${label}`);
  }
}

function verifyAcceptedArchive(zipPath: string): OaDb1ArchiveRow[] {
  if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile()) {
    throw new Error('accepted_archive_zip_missing');
  }
  const zipSha = sha256File(zipPath);
  if (zipSha !== OA_DB_1_ARCHIVE_ZIP_SHA256) {
    throw new Error(`accepted_archive_zip_hash_mismatch:${zipSha}`);
  }

  const members = archiveMembers(zipPath);
  const manifestMember = uniqueMemberBySuffix(members, '/manifest.json');
  const archiveMember = uniqueMemberBySuffix(
    members,
    '/archive/canonical_team_games.json'
  );
  const manifest = parseJson<ArchiveManifest>(
    archiveRead(zipPath, manifestMember),
    'manifest'
  );

  if (
    manifest.version !== OA_DB_1_ARCHIVE_CONTRACT ||
    manifest.builderRepoSha !==
      'caff37b8cdb12f0e5f49ab680d976f7d2b258779'
  ) {
    throw new Error('accepted_archive_manifest_identity_mismatch');
  }

  const expected = manifest.artifacts.find(
    (entry) => entry.file === 'archive/canonical_team_games.json'
  );
  if (
    !expected ||
    expected.bytes !== EXPECTED_ARCHIVE_MEMBER_BYTES ||
    expected.sha256 !== EXPECTED_ARCHIVE_MEMBER_SHA256
  ) {
    throw new Error('accepted_archive_manifest_entry_mismatch');
  }

  const archiveBytes = archiveRead(zipPath, archiveMember);
  if (
    archiveBytes.length !== EXPECTED_ARCHIVE_MEMBER_BYTES ||
    sha256Bytes(archiveBytes) !== EXPECTED_ARCHIVE_MEMBER_SHA256
  ) {
    throw new Error('accepted_archive_member_hash_mismatch');
  }

  const rows = parseJson<OaDb1ArchiveRow[]>(
    archiveBytes,
    'canonical_team_games'
  );
  if (!Array.isArray(rows)) throw new Error('accepted_archive_rows_not_array');
  return rows;
}

function verifyReviewedPreview(args: Args): {
  report: ReviewedPreviewReport;
  plan: ReviewedPreviewPlan;
  zipSha256: string;
} {
  if (
    !fs.existsSync(args.reviewedPreviewZip) ||
    !fs.statSync(args.reviewedPreviewZip).isFile()
  ) {
    throw new Error('reviewed_preview_zip_missing');
  }

  const zipSha256 = sha256File(args.reviewedPreviewZip);
  if (zipSha256 !== args.reviewedPreviewSha256) {
    throw new Error(
      `reviewed_preview_zip_hash_mismatch:${zipSha256}`
    );
  }

  const members = archiveMembers(args.reviewedPreviewZip);
  const reportMember = uniqueMemberBySuffix(members, '/report.json');
  const planMember = uniqueMemberBySuffix(members, '/planned_rows.json');

  const report = parseJson<ReviewedPreviewReport>(
    archiveRead(args.reviewedPreviewZip, reportMember),
    'reviewed_preview_report'
  );
  const plan = parseJson<ReviewedPreviewPlan>(
    archiveRead(args.reviewedPreviewZip, planMember),
    'reviewed_preview_plan'
  );

  const reportRunId = String(
    report.executionContext?.workflowRunId ?? ''
  );
  const reportRepoSha = String(
    report.executionContext?.repoCommitSha ?? ''
  );
  const planRunId = String(plan.executionContext?.workflowRunId ?? '');
  const planRepoSha = String(plan.executionContext?.repoCommitSha ?? '');

  const counts = report.counts;
  const blockers: string[] = [];
  if (report.version !== OA_DB_1_VERSION) blockers.push('reviewed_preview_version_mismatch');
  if (report.mode !== 'PREVIEW') blockers.push('reviewed_preview_mode_mismatch');
  if (report.targetTable !== OA_DB_1_TABLE) blockers.push('reviewed_preview_target_table_mismatch');
  if (report.targetTableExists !== true) blockers.push('reviewed_preview_target_table_missing');
  if (report.schemaDeploymentRequired !== false) blockers.push('reviewed_preview_schema_still_required');
  if (report.previewSafe !== true) blockers.push('reviewed_preview_not_safe');
  if (!Array.isArray(report.writeBlockers) || report.writeBlockers.length !== 0) {
    blockers.push('reviewed_preview_write_blockers_present');
  }
  if (reportRepoSha !== args.expectedRepoSha || planRepoSha !== args.expectedRepoSha) {
    blockers.push('reviewed_preview_repo_sha_mismatch');
  }
  if (
    reportRunId !== args.reviewedPreviewRunId ||
    planRunId !== args.reviewedPreviewRunId
  ) {
    blockers.push('reviewed_preview_run_id_mismatch');
  }
  if (plan.version !== OA_DB_1_VERSION) blockers.push('reviewed_preview_plan_version_mismatch');
  if (plan.sourceArtifactId !== OA_DB_1_ARCHIVE_ARTIFACT_ID) {
    blockers.push('reviewed_preview_source_artifact_id_mismatch');
  }
  if (plan.sourceArtifactZipSha256 !== OA_DB_1_ARCHIVE_ZIP_SHA256) {
    blockers.push('reviewed_preview_source_artifact_hash_mismatch');
  }
  if (!Array.isArray(plan.rows) || plan.rows.length !== 5996) {
    blockers.push('reviewed_preview_planned_rows_not_5996');
  }

  const expectedCounts: Partial<OaDb1PreviewPlan['counts']> = {
    archiveRows: 5996,
    plannedRows: 5996,
    create: 5996,
    identical: 0,
    update: 0,
    conflict: 0,
    sourceUnavailable: 8,
    unexpectedExisting: 0,
    duplicatePlannedNaturalKeys: 0,
    duplicateExistingNaturalKeys: 0,
    existing2026Rows: 0,
    planned2026Mutations: 0,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if ((counts as Record<string, unknown>)[key] !== expected) {
      blockers.push(`reviewed_preview_count_mismatch:${key}`);
    }
  }

  if (blockers.length > 0) {
    throw new Error(`reviewed_preview_blocked:${blockers.join(',')}`);
  }

  return { report, plan, zipSha256 };
}

async function targetTableExists(
  db: PrismaClient | Prisma.TransactionClient
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ tableName: string | null }>>
    `SELECT to_regclass('public.team_game_efficiency_canonical_v1')::text AS "tableName"`;
  return rows.length === 1 && rows[0].tableName !== null;
}

async function loadExistingRows(
  db: PrismaClient | Prisma.TransactionClient
): Promise<OaDb1ExistingRow[]> {
  return db.canonicalTeamGameEfficiencyV1.findMany({
    where: { season: { gte: 2022, lte: 2026 } },
    select: {
      season: true,
      providerGameId: true,
      teamIdInternal: true,
      availabilityStatus: true,
      recordFingerprintSha256: true,
    },
    orderBy: [
      { season: 'asc' },
      { providerGameId: 'asc' },
      { teamIdInternal: 'asc' },
    ],
  });
}

async function loadPersistedRows2022To2025(
  db: PrismaClient | Prisma.TransactionClient
): Promise<PersistedRow[]> {
  return db.canonicalTeamGameEfficiencyV1.findMany({
    where: { season: { gte: 2022, lte: 2025 } },
    select: {
      season: true,
      providerGameId: true,
      providerWeek: true,
      startDate: true,
      neutralSite: true,
      homeTeamNameCfbd: true,
      awayTeamNameCfbd: true,
      teamNameCfbd: true,
      opponentNameCfbd: true,
      teamIdInternal: true,
      opponentTeamIdInternal: true,
      isHome: true,
      availabilityStatus: true,
      ppaOff: true,
      ppaDef: true,
      successOff: true,
      successDef: true,
      sourceSeason: true,
      sourceArtifactId: true,
      sourceArtifactZipSha256: true,
      sourceEndpoint: true,
      sourceRawMember: true,
      sourceMethod: true,
      archiveContractVersion: true,
      archiveRunId: true,
      archiveArtifactId: true,
      archiveArtifactZipSha256: true,
      recordFingerprintSha256: true,
    },
    orderBy: [
      { season: 'asc' },
      { providerGameId: 'asc' },
      { teamIdInternal: 'asc' },
    ],
  });
}

async function snapshot2026(
  db: PrismaClient | Prisma.TransactionClient
): Promise<{ count: number; sha256: string }> {
  const rows = await db.canonicalTeamGameEfficiencyV1.findMany({
    where: { season: 2026 },
    select: {
      season: true,
      providerGameId: true,
      teamIdInternal: true,
      recordFingerprintSha256: true,
    },
    orderBy: [
      { providerGameId: 'asc' },
      { teamIdInternal: 'asc' },
    ],
  });
  return {
    count: rows.length,
    sha256: sha256Json(rows),
  };
}

function naturalKey(row: {
  season: number;
  providerGameId: string;
  teamIdInternal: string;
}): string {
  return `${row.season}|${row.providerGameId}|${row.teamIdInternal}`;
}

export function validateOaDb1CommitPlan(plan: OaDb1PreviewPlan): string[] {
  const blockers = [...plan.writeBlockers];
  if (!plan.targetTableExists) blockers.push('target_table_missing');
  if (plan.schemaDeploymentRequired) blockers.push('schema_deployment_required');
  if (!plan.previewSafe) blockers.push('preview_not_safe');
  if (plan.counts.archiveRows !== 5996) blockers.push('archive_rows_not_5996');
  if (plan.counts.plannedRows !== 5996) blockers.push('planned_rows_not_5996');
  if (plan.counts.update !== 0) blockers.push('updates_not_zero');
  if (plan.counts.conflict !== 0) blockers.push('conflicts_not_zero');
  if (plan.counts.sourceUnavailable !== 8) blockers.push('source_unavailable_not_8');
  if (plan.counts.unexpectedExisting !== 0) blockers.push('unexpected_existing_not_zero');
  if (plan.counts.duplicatePlannedNaturalKeys !== 0) blockers.push('duplicate_planned_keys');
  if (plan.counts.duplicateExistingNaturalKeys !== 0) blockers.push('duplicate_existing_keys');
  if (plan.counts.existing2026Rows !== 0) blockers.push('existing_2026_rows_not_zero');
  if (plan.counts.planned2026Mutations !== 0) blockers.push('planned_2026_mutations_not_zero');
  if (plan.counts.create + plan.counts.identical !== 5996) {
    blockers.push('create_plus_identical_not_5996');
  }
  return [...new Set(blockers)].sort();
}

function reviewedPreviewMatchesCurrentPlan(
  reviewedRows: OaDb1PlannedRow[],
  currentRows: OaDb1PlannedRow[]
): boolean {
  if (reviewedRows.length !== 5996 || currentRows.length !== 5996) return false;
  const reviewed = new Map(
    reviewedRows.map((row) => [naturalKey(row), row.recordFingerprintSha256])
  );
  if (reviewed.size !== 5996) return false;
  for (const row of currentRows) {
    if (reviewed.get(naturalKey(row)) !== row.recordFingerprintSha256) {
      return false;
    }
  }
  return true;
}

function timeEqual(expected: string | null, actual: Date | null): boolean {
  if (expected === null || actual === null) return expected === null && actual === null;
  const millis = Date.parse(expected);
  return Number.isFinite(millis) && millis === actual.getTime();
}

export function persistedRowsExactlyMatchPlan(
  plannedRows: OaDb1PlannedRow[],
  persistedRows: PersistedRow[]
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (plannedRows.length !== 5996) mismatches.push('planned_row_count_not_5996');
  if (persistedRows.length !== 5996) mismatches.push('persisted_row_count_not_5996');

  const persisted = new Map(persistedRows.map((row) => [naturalKey(row), row]));
  if (persisted.size !== persistedRows.length) {
    mismatches.push('persisted_duplicate_natural_key');
  }

  for (const expected of plannedRows) {
    const key = naturalKey(expected);
    const actual = persisted.get(key);
    if (!actual) {
      mismatches.push(`missing:${key}`);
      if (mismatches.length >= 25) break;
      continue;
    }

    const same =
      actual.season === expected.season &&
      actual.providerGameId === expected.providerGameId &&
      actual.providerWeek === expected.providerWeek &&
      timeEqual(expected.startDate, actual.startDate) &&
      actual.neutralSite === expected.neutralSite &&
      actual.homeTeamNameCfbd === expected.homeTeamNameCfbd &&
      actual.awayTeamNameCfbd === expected.awayTeamNameCfbd &&
      actual.teamNameCfbd === expected.teamNameCfbd &&
      actual.opponentNameCfbd === expected.opponentNameCfbd &&
      actual.teamIdInternal === expected.teamIdInternal &&
      actual.opponentTeamIdInternal === expected.opponentTeamIdInternal &&
      actual.isHome === expected.isHome &&
      actual.availabilityStatus === expected.availabilityStatus &&
      actual.ppaOff === expected.ppaOff &&
      actual.ppaDef === expected.ppaDef &&
      actual.successOff === expected.successOff &&
      actual.successDef === expected.successDef &&
      actual.sourceSeason === expected.sourceSeason &&
      actual.sourceArtifactId === expected.sourceArtifactId &&
      actual.sourceArtifactZipSha256 === expected.sourceArtifactZipSha256 &&
      actual.sourceEndpoint === expected.sourceEndpoint &&
      actual.sourceRawMember === expected.sourceRawMember &&
      actual.sourceMethod === expected.sourceMethod &&
      actual.archiveContractVersion === expected.archiveContractVersion &&
      actual.archiveRunId === expected.archiveRunId &&
      actual.archiveArtifactId === expected.archiveArtifactId &&
      actual.archiveArtifactZipSha256 === expected.archiveArtifactZipSha256 &&
      actual.recordFingerprintSha256 === expected.recordFingerprintSha256;

    if (!same) {
      mismatches.push(`value_mismatch:${key}`);
      if (mismatches.length >= 25) break;
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

function createData(row: OaDb1PlannedRow) {
  const startDate =
    row.startDate === null ? null : new Date(row.startDate);
  if (startDate && !Number.isFinite(startDate.getTime())) {
    throw new Error(
      `invalid_start_date:${row.season}/${row.providerGameId}/${row.teamNameCfbd}`
    );
  }

  return {
    season: row.season,
    providerGameId: row.providerGameId,
    providerWeek: row.providerWeek,
    startDate,
    neutralSite: row.neutralSite,
    homeTeamNameCfbd: row.homeTeamNameCfbd,
    awayTeamNameCfbd: row.awayTeamNameCfbd,
    teamNameCfbd: row.teamNameCfbd,
    opponentNameCfbd: row.opponentNameCfbd,
    teamIdInternal: row.teamIdInternal,
    opponentTeamIdInternal: row.opponentTeamIdInternal,
    isHome: row.isHome,
    availabilityStatus: row.availabilityStatus,
    ppaOff: row.ppaOff,
    ppaDef: row.ppaDef,
    successOff: row.successOff,
    successDef: row.successDef,
    sourceSeason: row.sourceSeason,
    sourceArtifactId: row.sourceArtifactId,
    sourceArtifactZipSha256: row.sourceArtifactZipSha256,
    sourceEndpoint: row.sourceEndpoint,
    sourceRawMember: row.sourceRawMember,
    sourceMethod: row.sourceMethod,
    archiveContractVersion: row.archiveContractVersion,
    archiveRunId: row.archiveRunId,
    archiveArtifactId: row.archiveArtifactId,
    archiveArtifactZipSha256: row.archiveArtifactZipSha256,
    recordFingerprintSha256: row.recordFingerprintSha256,
  };
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function writeReport(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main(): Promise<void> {
  const parsed = parseOaDb1CommitArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }
  const args = parsed.value;

  const githubSha = String(process.env.GITHUB_SHA ?? '').trim();
  if (githubSha !== args.expectedRepoSha) {
    console.error('github_sha_does_not_match_expected_repo_sha');
    process.exit(1);
  }

  const archiveRows = verifyAcceptedArchive(args.sourceZip);
  const reviewedPreview = verifyReviewedPreview(args);

  const prisma = new PrismaClient();
  let authoritativePlan: OaDb1PreviewPlan | null = null;
  let writeBlockers: string[] = [];
  let mutationCallsAttempted = 0;
  let attemptedRowCount = 0;
  let committedRowCount = 0;
  let transactionVerified = false;
  let postCommitVerified = false;
  let transactionRolledBack = false;
  let commitSucceeded = false;
  let createCountInsideTransaction = 0;
  let identicalCountInsideTransaction = 0;
  let previewEvidenceMatched = false;
  let before2026 = { count: 0, sha256: sha256Json([]) };
  let after2026 = { count: 0, sha256: sha256Json([]) };
  let transactionMismatches: string[] = [];
  let postCommitMismatches: string[] = [];
  let errorCode: string | null = null;

  try {
    if (!(await targetTableExists(prisma))) {
      throw new Error('target_table_missing');
    }

    const txResult = await prisma.$transaction(
      async (tx) => {
        let plan: OaDb1PreviewPlan | null = null;
        let blockers: string[] = [];
        let localMutationCalls = 0;
        let localAttemptedRows = 0;

        try {
          const [teamMapRows, teams, existingRows, pre2026] =
            await Promise.all([
              tx.cfbdTeamMap.findMany({
                select: {
                  teamNameCfbd: true,
                  teamIdInternal: true,
                },
                orderBy: { teamNameCfbd: 'asc' },
              }),
              tx.team.findMany({
                select: { id: true },
                orderBy: { id: 'asc' },
              }),
              loadExistingRows(tx),
              snapshot2026(tx),
            ]);

          before2026 = pre2026;

          plan = planOaDb1Preview({
            archiveRows,
            teamMapRows,
            existingTeamIds: teams.map((team) => team.id),
            targetTableExists: true,
            existingRows,
          });
          authoritativePlan = plan;

          blockers = validateOaDb1CommitPlan(plan);
          writeBlockers = blockers;
          if (blockers.length > 0) {
            throw new Error('commit_plan_blocked');
          }

          previewEvidenceMatched = reviewedPreviewMatchesCurrentPlan(
            reviewedPreview.plan.rows,
            plan.plannedRows
          );
          if (!previewEvidenceMatched) {
            blockers.push('reviewed_preview_does_not_match_current_plan');
            writeBlockers = [...new Set(blockers)].sort();
            throw new Error('reviewed_preview_plan_mismatch');
          }

          const existingKeys = new Set(
            existingRows
              .filter((row) => row.season >= 2022 && row.season <= 2025)
              .map((row) => naturalKey(row))
          );
          const createRows = plan.plannedRows.filter(
            (row) => !existingKeys.has(naturalKey(row))
          );

          if (createRows.length !== plan.counts.create) {
            blockers.push('derived_create_count_mismatch');
            writeBlockers = [...new Set(blockers)].sort();
            throw new Error('derived_create_count_mismatch');
          }

          createCountInsideTransaction = createRows.length;
          identicalCountInsideTransaction = plan.counts.identical;

          for (const batch of chunk(createRows, OA_DB_1_INSERT_BATCH_SIZE)) {
            localMutationCalls += 1;
            localAttemptedRows += batch.length;
            mutationCallsAttempted = localMutationCalls;
            attemptedRowCount = localAttemptedRows;

            const result = await tx.canonicalTeamGameEfficiencyV1.createMany({
              data: batch.map(createData),
            });
            if (result.count !== batch.length) {
              throw new Error('create_many_count_mismatch');
            }
          }

          const [persisted, postPlanRows, inTx2026] = await Promise.all([
            loadPersistedRows2022To2025(tx),
            loadExistingRows(tx),
            snapshot2026(tx),
          ]);

          if (
            inTx2026.count !== before2026.count ||
            inTx2026.sha256 !== before2026.sha256
          ) {
            throw new Error('season_2026_changed_inside_transaction');
          }

          const postPlan = planOaDb1Preview({
            archiveRows,
            teamMapRows,
            existingTeamIds: teams.map((team) => team.id),
            targetTableExists: true,
            existingRows: postPlanRows,
          });
          const postPlanBlockers = validateOaDb1CommitPlan(postPlan).filter(
            (blocker) => blocker !== 'create_plus_identical_not_5996'
          );
          if (
            postPlanBlockers.length > 0 ||
            postPlan.counts.create !== 0 ||
            postPlan.counts.identical !== 5996 ||
            postPlan.counts.conflict !== 0
          ) {
            throw new Error('in_transaction_post_plan_verification_failed');
          }

          const exact = persistedRowsExactlyMatchPlan(
            plan.plannedRows,
            persisted
          );
          transactionMismatches = exact.mismatches;
          if (!exact.ok) {
            throw new Error('in_transaction_exact_match_failed');
          }

          transactionVerified = true;
          return {
            committedRowCount: createRows.length,
            mutationCallsAttempted: localMutationCalls,
            attemptedRowCount: localAttemptedRows,
          };
        } catch (error) {
          throw new OaDb1CommitFailure({
            code: error instanceof Error ? error.message : 'transaction_failed',
            plan,
            blockers,
            mutationCallsAttempted: localMutationCalls,
            attemptedRowCount: localAttemptedRows,
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: OA_DB_1_TRANSACTION_TIMEOUT_MS,
      }
    );

    committedRowCount = txResult.committedRowCount;
    mutationCallsAttempted = txResult.mutationCallsAttempted;
    attemptedRowCount = txResult.attemptedRowCount;
    commitSucceeded = true;

    const [persistedAfterCommit, after2026Snapshot] = await Promise.all([
      loadPersistedRows2022To2025(prisma),
      snapshot2026(prisma),
    ]);
    after2026 = after2026Snapshot;

    const exactPost = persistedRowsExactlyMatchPlan(
      authoritativePlan!.plannedRows,
      persistedAfterCommit
    );
    postCommitMismatches = exactPost.mismatches;
    postCommitVerified =
      exactPost.ok &&
      after2026.count === before2026.count &&
      after2026.sha256 === before2026.sha256;

    if (!postCommitVerified) {
      errorCode = 'post_commit_verification_failed';
    }
  } catch (error) {
    if (!commitSucceeded) transactionRolledBack = true;
    if (error instanceof OaDb1CommitFailure) {
      authoritativePlan = error.details.plan;
      writeBlockers = error.details.blockers;
      mutationCallsAttempted = error.details.mutationCallsAttempted;
      attemptedRowCount = error.details.attemptedRowCount;
      errorCode = error.details.code;
    } else {
      errorCode = error instanceof Error ? error.message : 'commit_failed';
    }
  } finally {
    const report = {
      version: OA_DB_1_VERSION,
      mode: 'COMMIT',
      repoCommitSha: args.expectedRepoSha,
      confirmationSatisfied: args.confirm === OA_DB_1_COMMIT_CONFIRMATION,
      source: {
        archiveRunId: OA_DB_1_ARCHIVE_RUN_ID,
        archiveArtifactId: OA_DB_1_ARCHIVE_ARTIFACT_ID,
        archiveZipSha256: OA_DB_1_ARCHIVE_ZIP_SHA256,
      },
      reviewedPreview: {
        workflowRunId: args.reviewedPreviewRunId,
        artifactZipSha256: reviewedPreview.zipSha256,
        repoCommitSha:
          reviewedPreview.report.executionContext?.repoCommitSha ?? null,
        previewEvidenceMatched,
      },
      authoritativePlan: authoritativePlan
        ? {
            counts: authoritativePlan.counts,
            perSeason: authoritativePlan.perSeason,
            writeBlockers: authoritativePlan.writeBlockers,
          }
        : null,
      writeBlockers,
      transaction: {
        isolation: 'Serializable',
        timeoutMs: OA_DB_1_TRANSACTION_TIMEOUT_MS,
        insertBatchSize: OA_DB_1_INSERT_BATCH_SIZE,
        mutationCallsAttempted,
        attemptedRowCount,
        createCountInsideTransaction,
        identicalCountInsideTransaction,
        committedRowCount,
        transactionVerified,
        transactionRolledBack,
        transactionMismatches,
        commitSucceeded,
      },
      postCommit: {
        verified: postCommitVerified,
        mismatches: postCommitMismatches,
      },
      season2026Protection: {
        before: before2026,
        after: after2026,
        unchanged:
          before2026.count === after2026.count &&
          before2026.sha256 === after2026.sha256,
        planned2026Mutations: 0,
      },
      boundaries: {
        providerCalls: 0,
        prismaMigrateInvoked: false,
        legacyTeamGameStatsWrites: false,
        gamesWrites: false,
        marketReads: 0,
        outcomePerformanceReads: 0,
        updateOperationsInvoked: false,
        deleteOperationsInvoked: false,
      },
      errorCode,
    };

    writeReport(args.report, report);
    console.log(JSON.stringify(report, null, 2));
    await prisma.$disconnect();
  }

  process.exit(
    commitSucceeded && transactionVerified && postCommitVerified ? 0 : 1
  );
}

if (require.main === module) {
  void main();
}
