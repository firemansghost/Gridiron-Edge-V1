import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  OA_DATA_1_2024_UNAVAILABLE_GAME_IDS,
  OA_DATA_1_VERSION,
  assertFrozenOaData1Archive,
  buildCanonicalSeasonRows,
  buildOaData1Archive,
  type OaData1AdvancedRow,
  type OaData1GameRow,
  type OaData1SourceMeta,
} from './src/research/oa-data-1-canonical-historical-archive';

const CONFIRMATION =
  'BUILD_OA_DATA_1_CANONICAL_HISTORICAL_ARCHIVE_V1';

interface FrozenSource {
  season: 2022 | 2023 | 2024 | 2025;
  artifactId: number;
  zipSha256: string;
  sourceRepoSha: string;
  rootDir: string;
}

interface Args {
  source2022Zip: string;
  source2023Zip: string;
  source2024Zip: string;
  source2025Zip: string;
  resolution2024Zip: string;
  outputDir: string;
  confirm: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

type JsonObject = Record<string, unknown>;

const FROZEN_SOURCES: Record<'2022' | '2023' | '2024' | '2025', FrozenSource> = {
  '2022': {
    season: 2022,
    artifactId: 10988661299,
    zipSha256:
      '7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99',
    sourceRepoSha: 'e8a2b184c88f39866f29b865a3fd65ad82f99ec0',
    rootDir: '2022-36464140881',
  },
  '2023': {
    season: 2023,
    artifactId: 10990949531,
    zipSha256:
      '479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4',
    sourceRepoSha: '7150e263284255e67adf87521fcb710ec97a91a9',
    rootDir: '2023-36470674904',
  },
  '2024': {
    season: 2024,
    artifactId: 11008470975,
    zipSha256:
      'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
    sourceRepoSha: 'e1b27f6c5681f6ab4f8d24e50f88e387c64657a7',
    rootDir: '2024-36508377627',
  },
  '2025': {
    season: 2025,
    artifactId: 10973848747,
    zipSha256:
      'fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22',
    sourceRepoSha: 'f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7',
    rootDir: '2025-36433016296',
  },
};

const FROZEN_2024_RESOLUTION = {
  artifactId: 11043269261,
  zipSha256:
    'c0c307af5b008b0e35baabc89f5ea743dae496991dcb83ead679478b6b109444',
  rootDir: '36590634515',
} as const;

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
    source2022Zip: values.get('--source-2022-zip') ?? '',
    source2023Zip: values.get('--source-2023-zip') ?? '',
    source2024Zip: values.get('--source-2024-zip') ?? '',
    source2025Zip: values.get('--source-2025-zip') ?? '',
    resolution2024Zip: values.get('--resolution-2024-zip') ?? '',
    outputDir: values.get('--output-dir') ?? '',
    confirm: values.get('--confirm') ?? '',
  };

  for (const [key, value] of Object.entries(args)) {
    if (key === 'confirm') continue;
    if (!value) throw new Error(`missing_required_argument:${key}`);
  }
  if (args.confirm !== CONFIRMATION) throw new Error('invalid_confirmation');
  return args;
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function repoCommitSha(): string {
  const value = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error('invalid_git_head_sha');
  return value;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`invalid_json:${label}`);
  }
}

function requireJsonObject(bytes: Buffer, label: string): JsonObject {
  const value = asObject(parseJson(bytes, label));
  if (!value) throw new Error(`json_object_required:${label}`);
  return value;
}

function requireJsonArray(bytes: Buffer, label: string): unknown[] {
  const value = parseJson(bytes, label);
  if (!Array.isArray(value)) throw new Error(`json_array_required:${label}`);
  return value;
}

function archiveRead(
  zipPath: string,
  rootDir: string,
  member: string
): Buffer {
  try {
    return execFileSync('unzip', ['-p', zipPath, `${rootDir}/${member}`], {
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch {
    throw new Error(`archive_member_read_failed:${member}`);
  }
}

function verifyZip(filePath: string, expectedSha: string, label: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`source_zip_missing:${label}`);
  }
  const actual = sha256File(filePath);
  if (actual !== expectedSha) {
    throw new Error(`source_zip_hash_mismatch:${label}`);
  }
}

function manifestEntry(
  manifest: JsonObject,
  member: string
): { bytes: number; sha256: string } {
  const artifacts = manifest.artifacts;
  if (!Array.isArray(artifacts)) {
    throw new Error('snapshot_manifest_artifacts_missing');
  }
  for (const raw of artifacts) {
    const entry = asObject(raw);
    if (!entry || entry.file !== member) continue;
    const bytes = entry.bytes;
    const sha = entry.sha256;
    if (
      typeof bytes !== 'number' ||
      !Number.isInteger(bytes) ||
      typeof sha !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(sha)
    ) {
      throw new Error(`invalid_manifest_entry:${member}`);
    }
    return { bytes, sha256: sha.toLowerCase() };
  }
  throw new Error(`manifest_entry_missing:${member}`);
}

function verifyMember(
  manifest: JsonObject,
  member: string,
  bytes: Buffer
): void {
  const expected = manifestEntry(manifest, member);
  if (bytes.length !== expected.bytes) {
    throw new Error(`member_bytes_mismatch:${member}`);
  }
  if (sha256Bytes(bytes) !== expected.sha256) {
    throw new Error(`member_hash_mismatch:${member}`);
  }
}

function loadSeasonSource(
  zipPath: string,
  config: FrozenSource
): {
  games: OaData1GameRow[];
  advancedRows: OaData1AdvancedRow[];
  source: OaData1SourceMeta;
  manifestSha256: string;
  gamesSha256: string;
  advancedSha256: string;
} {
  verifyZip(zipPath, config.zipSha256, String(config.season));

  const manifestBytes = archiveRead(zipPath, config.rootDir, 'manifest.json');
  const manifest = requireJsonObject(
    manifestBytes,
    `${config.season}:manifest`
  );

  if (
    manifest.season !== config.season ||
    manifest.repoCommitSha !== config.sourceRepoSha
  ) {
    throw new Error(`snapshot_manifest_identity_mismatch:${config.season}`);
  }

  const gamesBytes = archiveRead(
    zipPath,
    config.rootDir,
    'raw/001-games.json'
  );
  const advancedBytes = archiveRead(
    zipPath,
    config.rootDir,
    'raw/003-advanced-game-stats.json'
  );

  verifyMember(manifest, 'raw/001-games.json', gamesBytes);
  verifyMember(manifest, 'raw/003-advanced-game-stats.json', advancedBytes);

  return {
    games: requireJsonArray(
      gamesBytes,
      `${config.season}:games`
    ) as OaData1GameRow[],
    advancedRows: requireJsonArray(
      advancedBytes,
      `${config.season}:advanced`
    ) as OaData1AdvancedRow[],
    source: {
      season: config.season,
      artifactId: config.artifactId,
      artifactZipSha256: config.zipSha256,
      sourceEndpoint: '/stats/game/advanced',
      sourceRawMember: 'raw/003-advanced-game-stats.json',
    },
    manifestSha256: sha256Bytes(manifestBytes),
    gamesSha256: sha256Bytes(gamesBytes),
    advancedSha256: sha256Bytes(advancedBytes),
  };
}

function verify2024Resolution(zipPath: string): {
  reportSha256: string;
  acceptedRowsSha256: string;
  status: string;
  acceptedRows: number;
  unresolvedGameIds: number[];
} {
  verifyZip(
    zipPath,
    FROZEN_2024_RESOLUTION.zipSha256,
    '2024-resolution'
  );

  const manifestBytes = archiveRead(
    zipPath,
    FROZEN_2024_RESOLUTION.rootDir,
    'manifest.json'
  );
  const manifest = requireJsonObject(
    manifestBytes,
    '2024-resolution:manifest'
  );
  const reportBytes = archiveRead(
    zipPath,
    FROZEN_2024_RESOLUTION.rootDir,
    'report.json'
  );
  const acceptedBytes = archiveRead(
    zipPath,
    FROZEN_2024_RESOLUTION.rootDir,
    'recovery/accepted_advanced_rows.json'
  );

  verifyMember(manifest, 'report.json', reportBytes);
  verifyMember(
    manifest,
    'recovery/accepted_advanced_rows.json',
    acceptedBytes
  );

  const report = requireJsonObject(reportBytes, '2024-resolution:report');
  const recovery = asObject(report.recovery);
  const accepted = requireJsonArray(
    acceptedBytes,
    '2024-resolution:accepted_rows'
  );

  if (
    report.status !== 'HISTORICAL_V3_WEEK_QUERY_QUALIFIED' ||
    !recovery ||
    recovery.attempted !== true ||
    recovery.completeness !== 'ZERO' ||
    recovery.acceptedRows !== 0 ||
    accepted.length !== 0
  ) {
    throw new Error('oa_data_1_resolution_state_mismatch');
  }

  const unresolved = Array.isArray(recovery.unresolvedGameIds)
    ? recovery.unresolvedGameIds.filter(
        (value): value is number =>
          typeof value === 'number' && Number.isInteger(value)
      )
    : [];
  const actual = [...new Set(unresolved)].sort((a, b) => a - b);
  const expected = [...OA_DATA_1_2024_UNAVAILABLE_GAME_IDS].sort(
    (a, b) => a - b
  );

  if (
    actual.length !== expected.length ||
    actual.some((gameId, index) => gameId !== expected[index])
  ) {
    throw new Error('oa_data_1_resolution_gap_set_mismatch');
  }

  return {
    reportSha256: sha256Bytes(reportBytes),
    acceptedRowsSha256: sha256Bytes(acceptedBytes),
    status: String(report.status),
    acceptedRows: accepted.length,
    unresolvedGameIds: actual,
  };
}

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_output_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_output_path');
  }
  return resolved;
}

function ensureNewOutputDir(outputDir: string): void {
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeJsonExclusive(
  outputDir: string,
  relativePath: string,
  value: unknown
): ArtifactDigest {
  const fullPath = safeOutputPath(outputDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.writeFileSync(fullPath, bytes, { flag: 'wx' });
  return {
    file: relativePath.replace(/\\/g, '/'),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const builderRepoSha = repoCommitSha();

    const source2022 = loadSeasonSource(
      args.source2022Zip,
      FROZEN_SOURCES['2022']
    );
    const source2023 = loadSeasonSource(
      args.source2023Zip,
      FROZEN_SOURCES['2023']
    );
    const source2024 = loadSeasonSource(
      args.source2024Zip,
      FROZEN_SOURCES['2024']
    );
    const source2025 = loadSeasonSource(
      args.source2025Zip,
      FROZEN_SOURCES['2025']
    );
    const resolution = verify2024Resolution(args.resolution2024Zip);

    const seasonBuilds = [
      buildCanonicalSeasonRows({
        season: 2022,
        games: source2022.games,
        advancedRows: source2022.advancedRows,
        source: source2022.source,
      }),
      buildCanonicalSeasonRows({
        season: 2023,
        games: source2023.games,
        advancedRows: source2023.advancedRows,
        source: source2023.source,
      }),
      buildCanonicalSeasonRows({
        season: 2024,
        games: source2024.games,
        advancedRows: source2024.advancedRows,
        source: source2024.source,
      }),
      buildCanonicalSeasonRows({
        season: 2025,
        games: source2025.games,
        advancedRows: source2025.advancedRows,
        source: source2025.source,
      }),
    ];

    const archive = buildOaData1Archive(seasonBuilds);
    assertFrozenOaData1Archive(archive);

    ensureNewOutputDir(args.outputDir);

    const sourceProvenance = {
      version: OA_DATA_1_VERSION,
      builderRepoSha,
      sources: [source2022, source2023, source2024, source2025].map(
        (source) => ({
          season: source.source.season,
          artifactId: source.source.artifactId,
          zipSha256: source.source.artifactZipSha256,
          sourceEndpoint: source.source.sourceEndpoint,
          manifestSha256: source.manifestSha256,
          gamesMember: 'raw/001-games.json',
          gamesMemberSha256: source.gamesSha256,
          advancedMember: source.source.sourceRawMember,
          advancedMemberSha256: source.advancedSha256,
        })
      ),
      resolution2024: {
        artifactId: FROZEN_2024_RESOLUTION.artifactId,
        zipSha256: FROZEN_2024_RESOLUTION.zipSha256,
        reportSha256: resolution.reportSha256,
        acceptedRowsSha256: resolution.acceptedRowsSha256,
        status: resolution.status,
        acceptedRows: resolution.acceptedRows,
        unresolvedGameIds: resolution.unresolvedGameIds,
      },
    };

    const report = {
      version: OA_DATA_1_VERSION,
      mode: 'ARTIFACT_ONLY_CANONICAL_HISTORICAL_ARCHIVE_BUILD',
      builderRepoSha,
      canonicalGames: 2998,
      canonicalTeamSideRows: archive.rows.length,
      availableRows: archive.rows.filter(
        (row) => row.status === 'AVAILABLE'
      ).length,
      sourceUnavailableRows: archive.rows.filter(
        (row) => row.status === 'SOURCE_UNAVAILABLE'
      ).length,
      coverage: archive.coverage,
      gapGameIds: [...new Set(archive.gaps.map((gap) => gap.providerGameId))]
        .sort((a, b) => a - b),
      resolution2024: {
        status: resolution.status,
        acceptedRows: resolution.acceptedRows,
        unresolvedGameIds: resolution.unresolvedGameIds,
      },
      boundaries: {
        providerCalls: 0,
        databaseReads: false,
        databaseWrites: false,
        prismaInvoked: false,
        marketReads: 0,
        outcomeFieldsUsed: false,
        modelFit: false,
        modelPredictionsComputed: false,
        modelPerformanceComputed: false,
        holdout2025PerformanceReads: 0,
      },
      qaPass: true,
    };

    const artifacts: ArtifactDigest[] = [];
    artifacts.push(
      writeJsonExclusive(
        args.outputDir,
        'archive/canonical_team_games.json',
        archive.rows
      )
    );
    artifacts.push(
      writeJsonExclusive(
        args.outputDir,
        'audit/source_coverage.json',
        archive.coverage
      )
    );
    artifacts.push(
      writeJsonExclusive(
        args.outputDir,
        'audit/source_gaps.json',
        archive.gaps
      )
    );
    artifacts.push(
      writeJsonExclusive(
        args.outputDir,
        'source_provenance.json',
        sourceProvenance
      )
    );
    artifacts.push(writeJsonExclusive(args.outputDir, 'report.json', report));

    writeJsonExclusive(args.outputDir, 'manifest.json', {
      version: OA_DATA_1_VERSION,
      builderRepoSha,
      artifacts,
    });

    console.log(
      JSON.stringify(
        {
          status: 'OA_DATA_1_ARCHIVE_BUILT',
          builderRepoSha,
          canonicalGames: 2998,
          canonicalTeamSideRows: archive.rows.length,
          availableRows: report.availableRows,
          sourceUnavailableRows: report.sourceUnavailableRows,
          qaPass: true,
          providerCalls: 0,
          databaseReads: false,
          databaseWrites: false,
          prismaInvoked: false,
          outcomeFieldsUsed: false,
          modelPredictionsComputed: false,
          modelPerformanceComputed: false,
        },
        null,
        2
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[oa-data-1] ${message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
