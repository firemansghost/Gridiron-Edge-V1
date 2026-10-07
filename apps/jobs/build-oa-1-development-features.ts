import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  OA_1_DEVELOPMENT_SEASONS,
  OA_1_FEATURE_VERSION,
  OA_1_SOURCE_TABLE,
  buildOa1DevelopmentFeatures,
  type Oa1CanonicalRow,
  type Oa1GameFeatureRow,
} from './src/research/oa-1-opponent-adjusted-efficiency';

export const OA_1_DEVELOPMENT_BUILD_CONFIRMATION =
  'BUILD_OA_1_DEVELOPMENT_FEATURES_2022_2023' as const;

interface Args {
  outputDir: string;
  expectedRepoSha: string;
  confirm: string;
}

interface ManifestEntry {
  file: string;
  bytes: number;
  sha256: string;
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
    outputDir: values.get('--output-dir') ?? '',
    expectedRepoSha: values.get('--expected-repo-sha') ?? '',
    confirm: values.get('--confirm') ?? '',
  };

  for (const [key, value] of Object.entries(args)) {
    if (!value) throw new Error(`missing_required_argument:${key}`);
  }

  if (!/^[0-9a-f]{40}$/.test(args.expectedRepoSha)) {
    throw new Error('invalid_expected_repo_sha');
  }
  if (args.confirm !== OA_1_DEVELOPMENT_BUILD_CONFIRMATION) {
    throw new Error(
      `invalid_confirmation:expected_${OA_1_DEVELOPMENT_BUILD_CONFIRMATION}`
    );
  }

  return args;
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonExclusive(filePath: string, value: unknown): ManifestEntry {
  ensureDir(path.dirname(filePath));
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.writeFileSync(filePath, bytes, { flag: 'wx' });
  return {
    file: filePath,
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function relativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function statusCounts(games: Oa1GameFeatureRow[]) {
  const result: Record<string, Record<string, number>> = {};

  function add(key: string, status: string): void {
    const bucket = result[key] ?? {};
    bucket[status] = (bucket[status] ?? 0) + 1;
    result[key] = bucket;
  }

  for (const game of games) {
    for (const side of [game.home, game.away]) {
      add('raw.ppaOff', side.raw.ppaOff.status);
      add('raw.ppaDef', side.raw.ppaDef.status);
      add('raw.successOff', side.raw.successOff.status);
      add('raw.successDef', side.raw.successDef.status);
      add('raw.ppaNet', side.raw.ppaNet.status);
      add('raw.successNet', side.raw.successNet.status);
      add('opponentAdjusted.ppaOff', side.opponentAdjusted.ppaOff.status);
      add('opponentAdjusted.ppaDef', side.opponentAdjusted.ppaDef.status);
      add(
        'opponentAdjusted.successOff',
        side.opponentAdjusted.successOff.status
      );
      add(
        'opponentAdjusted.successDef',
        side.opponentAdjusted.successDef.status
      );
      add('opponentAdjusted.ppaNet', side.opponentAdjusted.ppaNet.status);
      add(
        'opponentAdjusted.successNet',
        side.opponentAdjusted.successNet.status
      );
    }
  }

  return result;
}

function baselineCoverageSummary(
  residualAudit: Array<{
    metric: string;
    opponentBaselineN: number;
    residual: number | null;
  }>
) {
  const result: Record<
    string,
    {
      sourceObservations: number;
      residualsAvailable: number;
      zeroBaseline: number;
      minBaselineN: number | null;
      maxBaselineN: number | null;
      meanBaselineN: number | null;
    }
  > = {};

  for (const metric of ['ppaOff', 'ppaDef', 'successOff', 'successDef']) {
    const rows = residualAudit.filter((row) => row.metric === metric);
    const counts = rows.map((row) => row.opponentBaselineN);
    result[metric] = {
      sourceObservations: rows.length,
      residualsAvailable: rows.filter((row) => row.residual !== null).length,
      zeroBaseline: rows.filter((row) => row.opponentBaselineN === 0).length,
      minBaselineN: counts.length > 0 ? Math.min(...counts) : null,
      maxBaselineN: counts.length > 0 ? Math.max(...counts) : null,
      meanBaselineN:
        counts.length > 0
          ? counts.reduce((sum, value) => sum + value, 0) / counts.length
          : null,
    };
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const githubSha = String(process.env.GITHUB_SHA ?? '').trim();
  if (githubSha !== args.expectedRepoSha) {
    throw new Error('github_sha_does_not_match_expected_repo_sha');
  }

  const prisma = new PrismaClient();

  try {
    const dbRows = await prisma.canonicalTeamGameEfficiencyV1.findMany({
      where: {
        season: {
          in: [...OA_1_DEVELOPMENT_SEASONS],
        },
      },
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
        recordFingerprintSha256: true,
      },
      orderBy: [
        { season: 'asc' },
        { providerGameId: 'asc' },
        { teamIdInternal: 'asc' },
      ],
    });

    const rows: Oa1CanonicalRow[] = dbRows.map((row) => ({
      ...row,
      startDate: row.startDate ? row.startDate.toISOString() : null,
    }));

    const build = buildOa1DevelopmentFeatures(rows);
    const executionContext = {
      repoCommitSha: args.expectedRepoSha,
      workflowRunId: String(process.env.GITHUB_RUN_ID ?? '').trim() || null,
    };

    const outputRoot = path.resolve(args.outputDir);
    if (fs.existsSync(outputRoot)) {
      throw new Error('output_dir_already_exists');
    }
    ensureDir(outputRoot);

    const entries: ManifestEntry[] = [];

    const featurePath = path.join(
      outputRoot,
      'features',
      'oa_1_game_features.json'
    );
    entries.push(
      writeJsonExclusive(featurePath, {
        version: OA_1_FEATURE_VERSION,
        executionContext,
        sourceTable: OA_1_SOURCE_TABLE,
        seasons: [...OA_1_DEVELOPMENT_SEASONS],
        games: build.games,
      })
    );

    const sourceIdentityPath = path.join(
      outputRoot,
      'audit',
      'source_identity.json'
    );
    entries.push(
      writeJsonExclusive(sourceIdentityPath, {
        version: OA_1_FEATURE_VERSION,
        executionContext,
        sourceTable: OA_1_SOURCE_TABLE,
        sourceIdentity: build.sourceIdentity,
      })
    );

    const availabilityPath = path.join(
      outputRoot,
      'audit',
      'feature_availability.json'
    );
    entries.push(
      writeJsonExclusive(availabilityPath, {
        version: OA_1_FEATURE_VERSION,
        statusCounts: statusCounts(build.games),
      })
    );

    const baselinePath = path.join(
      outputRoot,
      'audit',
      'opponent_baseline_coverage.json'
    );
    entries.push(
      writeJsonExclusive(baselinePath, {
        version: OA_1_FEATURE_VERSION,
        summary: baselineCoverageSummary(build.residualAudit),
        residuals: build.residualAudit,
      })
    );

    const unavailableHistoryPath = path.join(
      outputRoot,
      'audit',
      'source_unavailable_history.json'
    );
    entries.push(
      writeJsonExclusive(unavailableHistoryPath, {
        version: OA_1_FEATURE_VERSION,
        sourceUnavailableDevelopmentRows: rows
          .filter(
            (row) => row.availabilityStatus === 'SOURCE_UNAVAILABLE'
          )
          .map((row) => ({
            season: row.season,
            providerGameId: row.providerGameId,
            teamIdInternal: row.teamIdInternal,
          })),
      })
    );

    const reportPath = path.join(outputRoot, 'report.json');
    entries.push(
      writeJsonExclusive(reportPath, {
        version: OA_1_FEATURE_VERSION,
        status: build.qaPass
          ? 'OA_1_DEVELOPMENT_FEATURES_BUILT'
          : 'OA_1_DEVELOPMENT_FEATURES_BLOCKED',
        executionContext,
        sourceTable: OA_1_SOURCE_TABLE,
        databaseReadSeasons: [...OA_1_DEVELOPMENT_SEASONS],
        qaPass: build.qaPass,
        blockers: build.blockers,
        counts: build.counts,
        sourceIdentity: build.sourceIdentity,
        featureAvailability: statusCounts(build.games),
        opponentBaselineCoverage: baselineCoverageSummary(
          build.residualAudit
        ),
        boundaries: {
          providerCalls: 0,
          databaseReads: true,
          databaseWrites: false,
          prismaMigrateInvoked: false,
          legacyTeamGameStatsReads: 0,
          gameTableReads: 0,
          outcomeReads: 0,
          marketReads: 0,
          betReads: 0,
          modelPredictionReads: 0,
          season2024RowsRead: 0,
          season2025RowsRead: 0,
          season2026RowsRead: 0,
        },
      })
    );

    const manifestEntries = entries
      .map((entry) => ({
        file: relativePath(outputRoot, entry.file),
        bytes: entry.bytes,
        sha256: entry.sha256,
      }))
      .sort((a, b) => a.file.localeCompare(b.file));

    writeJsonExclusive(path.join(outputRoot, 'manifest.json'), {
      version: OA_1_FEATURE_VERSION,
      executionContext,
      artifacts: manifestEntries,
    });

    console.log(
      JSON.stringify(
        {
          status: build.qaPass
            ? 'OA_1_DEVELOPMENT_FEATURES_BUILT'
            : 'OA_1_DEVELOPMENT_FEATURES_BLOCKED',
          qaPass: build.qaPass,
          blockers: build.blockers,
          counts: build.counts,
          sourceIdentity: build.sourceIdentity,
          providerCalls: 0,
          databaseReads: true,
          databaseWrites: false,
          databaseReadSeasons: [...OA_1_DEVELOPMENT_SEASONS],
          season2024RowsRead: 0,
          season2025RowsRead: 0,
          season2026RowsRead: 0,
          outcomeReads: 0,
          marketReads: 0,
        },
        null,
        2
      )
    );

    if (!build.qaPass) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[oa-1-development-build] ${message}`);
  process.exit(1);
});
