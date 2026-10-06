import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
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
} from './src/research/oa-db-1-canonical-efficiency';

interface Args {
  sourceZip: string;
  report: string;
  plan: string;
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

const EXPECTED_ARCHIVE_MEMBER_SHA256 =
  '6ccea22db8e74feabdc08bbe9b422703486d48fa6820a4dfa802475e04420ff2';
const EXPECTED_ARCHIVE_MEMBER_BYTES = 5085305;

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
    report: values.get('--report') ?? '',
    plan: values.get('--plan') ?? '',
  };
  for (const [key, value] of Object.entries(args)) {
    if (!value) throw new Error(`missing_required_argument:${key}`);
  }
  return args;
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
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

function verifyAcceptedArchive(zipPath: string): {
  rows: OaDb1ArchiveRow[];
  manifest: ArchiveManifest;
  archiveMember: string;
  archiveMemberSha256: string;
} {
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
  if (!expected) throw new Error('accepted_archive_manifest_entry_missing');
  if (
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

  return {
    rows,
    manifest,
    archiveMember,
    archiveMemberSha256: sha256Bytes(archiveBytes),
  };
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function writeJsonExclusive(filePath: string, value: unknown): void {
  ensureParent(filePath);
  fs.writeFileSync(
    filePath,
    JSON.stringify(value, null, 2) + '\n',
    { encoding: 'utf8', flag: 'wx' }
  );
}

async function targetTableExists(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ tableName: string | null }>>
    `SELECT to_regclass('public.team_game_efficiency_canonical_v1')::text AS "tableName"`;
  return rows.length === 1 && rows[0].tableName !== null;
}

async function loadExistingRows(
  prisma: PrismaClient,
  exists: boolean
): Promise<OaDb1ExistingRow[]> {
  if (!exists) return [];

  return prisma.$queryRawUnsafe<OaDb1ExistingRow[]>(`
    SELECT
      season,
      provider_game_id AS "providerGameId",
      team_id_internal AS "teamIdInternal",
      availability_status AS "availabilityStatus",
      record_fingerprint_sha256 AS "recordFingerprintSha256"
    FROM "${OA_DB_1_TABLE}"
    WHERE season BETWEEN 2022 AND 2026
    ORDER BY season, provider_game_id, team_id_internal
  `);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const accepted = verifyAcceptedArchive(args.sourceZip);

  const prisma = new PrismaClient();

  try {
    const [teamMapRows, teams, exists] = await Promise.all([
      prisma.cfbdTeamMap.findMany({
        select: {
          teamNameCfbd: true,
          teamIdInternal: true,
        },
        orderBy: { teamNameCfbd: 'asc' },
      }),
      prisma.team.findMany({
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
      targetTableExists(prisma),
    ]);

    const existingRows = await loadExistingRows(prisma, exists);

    const plan = planOaDb1Preview({
      archiveRows: accepted.rows,
      teamMapRows,
      existingTeamIds: teams.map((team) => team.id),
      targetTableExists: exists,
      existingRows,
    });

    const executionContext = {
      repoCommitSha: String(process.env.GITHUB_SHA ?? '').trim() || null,
      workflowRunId: String(process.env.GITHUB_RUN_ID ?? '').trim() || null,
    };

    const report = {
      version: OA_DB_1_VERSION,
      mode: 'PREVIEW',
      executionContext,
      targetTable: OA_DB_1_TABLE,
      source: {
        archiveRunId: OA_DB_1_ARCHIVE_RUN_ID,
        archiveArtifactId: OA_DB_1_ARCHIVE_ARTIFACT_ID,
        archiveZipSha256: OA_DB_1_ARCHIVE_ZIP_SHA256,
        archiveContractVersion: OA_DB_1_ARCHIVE_CONTRACT,
        archiveManifestBuilderRepoSha: accepted.manifest.builderRepoSha,
        archiveMember: accepted.archiveMember,
        archiveMemberSha256: accepted.archiveMemberSha256,
      },
      dbReads: {
        cfbdTeamMapRows: teamMapRows.length,
        teamRows: teams.length,
        targetTableExists: exists,
        existingTargetRows2022To2026: existingRows.length,
      },
      previewSafe: plan.previewSafe,
      dataCommitEligible: plan.dataCommitEligible,
      schemaDeploymentRequired: plan.schemaDeploymentRequired,
      writeBlockers: plan.writeBlockers,
      counts: plan.counts,
      perSeason: plan.perSeason,
      conflictKeys: plan.conflictKeys,
      unexpectedExistingKeys: plan.unexpectedExistingKeys,
      boundaries: {
        providerCalls: 0,
        databaseWrites: false,
        prismaMigrateInvoked: false,
        legacyTeamGameStatsWrites: false,
        gamesWrites: false,
        planned2026Mutations: plan.counts.planned2026Mutations,
        marketReads: 0,
        outcomePerformanceReads: 0,
      },
    };

    writeJsonExclusive(args.report, report);
    writeJsonExclusive(args.plan, {
      version: OA_DB_1_VERSION,
      executionContext,
      sourceArtifactId: OA_DB_1_ARCHIVE_ARTIFACT_ID,
      sourceArtifactZipSha256: OA_DB_1_ARCHIVE_ZIP_SHA256,
      rows: plan.plannedRows,
    });

    console.log(
      JSON.stringify(
        {
          status: plan.previewSafe
            ? 'OA_DB_1_PREVIEW_OK'
            : 'OA_DB_1_PREVIEW_BLOCKED',
          targetTableExists: plan.targetTableExists,
          schemaDeploymentRequired: plan.schemaDeploymentRequired,
          previewSafe: plan.previewSafe,
          dataCommitEligible: plan.dataCommitEligible,
          counts: plan.counts,
          writeBlockers: plan.writeBlockers,
          providerCalls: 0,
          databaseWrites: false,
          prismaMigrateInvoked: false,
          planned2026Mutations: 0,
        },
        null,
        2
      )
    );

    if (!plan.previewSafe) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[oa-db-1-preview] ${message}`);
  process.exit(1);
});
