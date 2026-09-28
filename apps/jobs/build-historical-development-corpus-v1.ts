import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
  buildHistoricalDevelopmentCorpus,
  type HistoricalDevelopmentSeasonSource,
} from './src/research/historical-development-corpus-v1';

const CONFIRMATION =
  'BUILD_2022_2023_HISTORICAL_DEVELOPMENT_CORPUS_V1';

interface Args {
  source2022Zip: string;
  source2023Zip: string;
  outputDir: string;
  confirm: string;
}

interface FrozenSourceConfig {
  season: 2022 | 2023;
  runId: number;
  artifactId: number;
  artifactName: string;
  zipSha256: string;
  sourceRepoSha: string;
  rootDir: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

interface LoadedSource {
  config: FrozenSourceConfig;
  source: HistoricalDevelopmentSeasonSource;
  portalRawBytes: Buffer;
  providerCalls: number;
  portalRowCount: number;
  rawSourceRowCounts: Record<string, unknown>;
  snapshotManifestSha256: string;
  snapshotReportSha256: string;
}

const FROZEN_SOURCES: Record<'2022' | '2023', FrozenSourceConfig> = {
  '2022': {
    season: 2022,
    runId: 36464140881,
    artifactId: 10988661299,
    artifactName: 'historical-research-snapshot-v1-2022-36464140881',
    zipSha256:
      '7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99',
    sourceRepoSha: 'e8a2b184c88f39866f29b865a3fd65ad82f99ec0',
    rootDir: '2022-36464140881',
  },
  '2023': {
    season: 2023,
    runId: 36470674904,
    artifactId: 10990949531,
    artifactName: 'historical-research-snapshot-v1-2023-36470674904',
    zipSha256:
      '479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4',
    sourceRepoSha: '7150e263284255e67adf87521fcb710ec97a91a9',
    rootDir: '2023-36470674904',
  },
};

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const source2022Zip = values.get('--source-2022-zip') ?? '';
  const source2023Zip = values.get('--source-2023-zip') ?? '';
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!source2022Zip) throw new Error('source_2022_zip_required');
  if (!source2023Zip) throw new Error('source_2023_zip_required');
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return { source2022Zip, source2023Zip, outputDir, confirm };
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

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonArray(filePath: string): unknown[] {
  const value = readJson(filePath);
  if (!Array.isArray(value)) throw new Error(`json_array_required:${filePath}`);
  return value;
}

function safeArtifactPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_snapshot_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_snapshot_artifact_path');
  }
  return resolved;
}

function verifySnapshotArtifacts(
  rootDir: string,
  manifest: Record<string, unknown>
): void {
  const artifacts = manifest.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 28) {
    throw new Error('snapshot_manifest_artifact_count_mismatch');
  }

  for (const entry of artifacts) {
    const obj = asObject(entry);
    if (!obj) throw new Error('invalid_snapshot_manifest_artifact');
    const file = typeof obj.file === 'string' ? obj.file : '';
    const bytes =
      typeof obj.bytes === 'number' && Number.isInteger(obj.bytes)
        ? obj.bytes
        : null;
    const sha256 = typeof obj.sha256 === 'string' ? obj.sha256 : '';
    if (!file || bytes === null || !/^[0-9a-f]{64}$/i.test(sha256)) {
      throw new Error('invalid_snapshot_manifest_artifact');
    }

    const fullPath = safeArtifactPath(rootDir, file);
    const raw = fs.readFileSync(fullPath);
    if (raw.length !== bytes) {
      throw new Error(`snapshot_artifact_bytes_mismatch:${file}`);
    }
    if (sha256Bytes(raw) !== sha256.toLowerCase()) {
      throw new Error(`snapshot_artifact_hash_mismatch:${file}`);
    }
  }
}

function requireNoMutationExecution(report: Record<string, unknown>): void {
  const execution = asObject(report.execution);
  if (!execution) throw new Error('snapshot_execution_metadata_missing');

  const mustBeFalse = [
    'databaseReads',
    'databaseWrites',
    'prismaClientInstantiated',
    'prismaGenerateInvoked',
    'mutationsInvoked',
    'oddsApiInvoked',
    'sgoInvoked',
    'weatherInvoked',
    'ratingsWrites',
    'shadowWrites',
    'betWrites',
    'gameWrites',
    'lifecycleWrites',
    'migrationsInvoked',
  ];
  for (const key of mustBeFalse) {
    if (execution[key] !== false) {
      throw new Error(`snapshot_execution_boundary_failed:${key}`);
    }
  }
}

function extractZip(
  zipPath: string,
  config: FrozenSourceConfig,
  tempRoot: string
): string {
  if (!fs.existsSync(zipPath) || !fs.statSync(zipPath).isFile()) {
    throw new Error(`source_zip_missing:${config.season}`);
  }

  const actualZipSha = sha256File(zipPath);
  if (actualZipSha !== config.zipSha256) {
    throw new Error(`source_zip_hash_mismatch:${config.season}`);
  }

  const extractDir = path.join(tempRoot, String(config.season));
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    execFileSync('unzip', ['-qq', zipPath, '-d', extractDir], {
      stdio: 'pipe',
    });
  } catch {
    throw new Error(`source_zip_extract_failed:${config.season}`);
  }

  const rootDir = path.join(extractDir, config.rootDir);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`snapshot_root_missing:${config.season}`);
  }
  return rootDir;
}

function loadFrozenSource(
  zipPath: string,
  config: FrozenSourceConfig,
  tempRoot: string
): LoadedSource {
  const rootDir = extractZip(zipPath, config, tempRoot);
  const manifestPath = path.join(rootDir, 'manifest.json');
  const reportPath = path.join(rootDir, 'report.json');
  const manifestRaw = fs.readFileSync(manifestPath);
  const reportRaw = fs.readFileSync(reportPath);
  const manifest = asObject(JSON.parse(manifestRaw.toString('utf8')));
  const report = asObject(JSON.parse(reportRaw.toString('utf8')));
  if (!manifest || !report) throw new Error('snapshot_metadata_invalid');

  if (
    manifest.version !== 'historical_research_snapshot_v1' ||
    manifest.season !== config.season ||
    manifest.repoCommitSha !== config.sourceRepoSha ||
    manifest.providerCalls !== 27
  ) {
    throw new Error(`snapshot_manifest_identity_mismatch:${config.season}`);
  }

  if (
    report.version !== 'historical_research_snapshot_v1' ||
    report.mode !== 'RESEARCH_PREVIEW_ARTIFACT_ONLY' ||
    report.season !== config.season ||
    report.repoCommitSha !== config.sourceRepoSha ||
    report.qaPass !== true
  ) {
    throw new Error(`snapshot_report_identity_mismatch:${config.season}`);
  }

  requireNoMutationExecution(report);
  verifySnapshotArtifacts(rootDir, manifest);

  const provider = asObject(report.provider);
  const calls = provider?.calls;
  if (
    !provider ||
    provider.name !== 'CFBD' ||
    provider.callsAttempted !== 27 ||
    provider.callsSucceeded !== 27 ||
    !Array.isArray(calls)
  ) {
    throw new Error(`snapshot_provider_accounting_mismatch:${config.season}`);
  }

  const callById = new Map<string, Record<string, unknown>>();
  for (const call of calls) {
    const obj = asObject(call);
    const requestId =
      obj && typeof obj.requestId === 'string' ? obj.requestId : '';
    if (!obj || !requestId || callById.has(requestId)) {
      throw new Error(`snapshot_call_identity_invalid:${config.season}`);
    }
    if (obj.ok !== true || obj.httpStatus !== 200) {
      throw new Error(`snapshot_call_not_successful:${requestId}`);
    }
    callById.set(requestId, obj);
  }

  const rawBytesForRequest = (requestId: string): Buffer => {
    const call = callById.get(requestId);
    const rawFile = call && typeof call.rawFile === 'string' ? call.rawFile : '';
    if (!rawFile) throw new Error(`snapshot_request_missing:${requestId}`);
    return fs.readFileSync(safeArtifactPath(rootDir, rawFile));
  };

  const rowsForRequest = (requestId: string): unknown[] => {
    const parsed = JSON.parse(rawBytesForRequest(requestId).toString('utf8'));
    if (!Array.isArray(parsed)) {
      throw new Error(`snapshot_request_not_array:${requestId}`);
    }
    return parsed;
  };

  const recruitingByYear: Record<number, unknown[]> = {};
  for (let year = config.season - 3; year <= config.season; year += 1) {
    recruitingByYear[year] = rowsForRequest(`recruiting-teams-${year}`);
  }

  const eloByWeek: Record<number, unknown[]> = {};
  for (const requestId of callById.keys()) {
    const match = /^elo-week-(\d{2})$/.exec(requestId);
    if (!match) continue;
    eloByWeek[Number(match[1])] = rowsForRequest(requestId);
  }

  const gamesRows = rowsForRequest('games');
  const linesRows = rowsForRequest('lines');
  const advancedRows = rowsForRequest('advanced-game-stats');
  const ppaRows = rowsForRequest('ppa-games');
  const talentRows = rowsForRequest('talent');
  const returningRows = rowsForRequest('returning-production');
  const portalRows = rowsForRequest('transfer-portal');
  const eloPreseasonRows = rowsForRequest('elo-preseason');

  return {
    config,
    source: {
      season: config.season,
      games: gamesRows,
      lines: linesRows,
      advanced: advancedRows,
      ppa: ppaRows,
      talent: talentRows,
      returningProduction: returningRows,
      recruitingByYear,
      eloPreseason: eloPreseasonRows,
      eloByWeek,
    },
    portalRawBytes: rawBytesForRequest('transfer-portal'),
    providerCalls: provider.callsAttempted as number,
    portalRowCount: portalRows.length,
    rawSourceRowCounts: {
      games: gamesRows.length,
      lines: linesRows.length,
      advanced: advancedRows.length,
      ppa: ppaRows.length,
      talent: talentRows.length,
      returningProduction: returningRows.length,
      transferPortal: portalRows.length,
      recruitingByYear: Object.fromEntries(
        Object.entries(recruitingByYear).map(([year, rows]) => [
          year,
          rows.length,
        ])
      ),
      eloPreseason: eloPreseasonRows.length,
      eloByWeek: Object.fromEntries(
        Object.entries(eloByWeek).map(([week, rows]) => [week, rows.length])
      ),
    },
    snapshotManifestSha256: sha256Bytes(manifestRaw),
    snapshotReportSha256: sha256Bytes(reportRaw),
  };
}

function ensureNewOutputDir(outputDir: string): void {
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeBytesExclusive(
  outputDir: string,
  relativePath: string,
  bytes: Buffer
): ArtifactDigest {
  const fullPath = safeArtifactPath(outputDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, bytes, { flag: 'wx' });
  return {
    file: relativePath.replace(/\\/g, '/'),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function writeJsonExclusive(
  outputDir: string,
  relativePath: string,
  value: unknown
): ArtifactDigest {
  return writeBytesExclusive(
    outputDir,
    relativePath,
    Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')
  );
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    'invalid_confirmation',
    'source_2022_zip_required',
    'source_2023_zip_required',
    'output_dir_required',
    'output_dir_already_exists',
    'invalid_git_head_sha',
  ];
  if (known.includes(message)) return message;
  if (/source_zip_missing/.test(message)) return 'source_zip_missing';
  if (/source_zip_hash_mismatch/.test(message))
    return 'source_zip_hash_mismatch';
  if (/source_zip_extract_failed/.test(message))
    return 'source_zip_extract_failed';
  if (/snapshot_/.test(message)) return message.replace(/:.*/, '');
  if (/canonical_/.test(message)) return message.replace(/:.*/, '');
  if (/history_/.test(message)) return message.replace(/:.*/, '');
  if (/duplicate_/.test(message)) return message.replace(/:.*/, '');
  return 'historical_development_corpus_v1_build_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'historical-development-corpus-v1-')
  );

  try {
    const source2022 = loadFrozenSource(
      path.resolve(args.source2022Zip),
      FROZEN_SOURCES['2022'],
      tempRoot
    );
    const source2023 = loadFrozenSource(
      path.resolve(args.source2023Zip),
      FROZEN_SOURCES['2023'],
      tempRoot
    );

    const corpus = buildHistoricalDevelopmentCorpus([
      source2022.source,
      source2023.source,
    ]);

    const outputDir = path.resolve(args.outputDir);
    ensureNewOutputDir(outputDir);
    const artifacts: ArtifactDigest[] = [];

    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'predictive/game_frames.json',
        corpus.gameFrames
      )
    );
    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'predictive/static_priors.json',
        corpus.staticPriors
      )
    );
    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'predictive/history_advanced.json',
        corpus.advancedHistory
      )
    );
    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'predictive/history_ppa.json',
        corpus.ppaHistory
      )
    );
    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'predictive/history_eligibility.json',
        corpus.historyEligibility
      )
    );
    artifacts.push(
      writeJsonExclusive(outputDir, 'outcomes/outcomes.json', corpus.outcomes)
    );
    artifacts.push(
      writeJsonExclusive(
        outputDir,
        'evaluation/market_lines.json',
        corpus.marketEvaluation
      )
    );
    artifacts.push(
      writeBytesExclusive(
        outputDir,
        'quarantine/transfer_portal_2022.json',
        source2022.portalRawBytes
      )
    );
    artifacts.push(
      writeBytesExclusive(
        outputDir,
        'quarantine/transfer_portal_2023.json',
        source2023.portalRawBytes
      )
    );

    const builderRepoSha = repoCommitSha();
    const provenance = {
      version: HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
      builderRepoSha,
      sourceArtifacts: [
        {
          season: 2022,
          runId: source2022.config.runId,
          artifactId: source2022.config.artifactId,
          artifactName: source2022.config.artifactName,
          zipSha256: source2022.config.zipSha256,
          sourceRepoSha: source2022.config.sourceRepoSha,
          snapshotManifestSha256: source2022.snapshotManifestSha256,
          snapshotReportSha256: source2022.snapshotReportSha256,
          rawSourceRowCounts: source2022.rawSourceRowCounts,
        },
        {
          season: 2023,
          runId: source2023.config.runId,
          artifactId: source2023.config.artifactId,
          artifactName: source2023.config.artifactName,
          zipSha256: source2023.config.zipSha256,
          sourceRepoSha: source2023.config.sourceRepoSha,
          snapshotManifestSha256: source2023.snapshotManifestSha256,
          snapshotReportSha256: source2023.snapshotReportSha256,
          rawSourceRowCounts: source2023.rawSourceRowCounts,
        },
      ],
    };
    artifacts.push(
      writeJsonExclusive(outputDir, 'source_provenance.json', provenance)
    );

    const report = {
      version: HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
      mode: 'ARTIFACT_ONLY_OFFLINE_BUILD',
      builderRepoSha,
      qaPass: true,
      sourceProviderCallsDuringBuild: 0,
      githubArtifactDownloadsDuringBuilderProcess: 0,
      databaseReads: false,
      databaseWrites: false,
      prismaInvoked: false,
      featureEngineeringInvoked: false,
      modelFittingInvoked: false,
      seasons: [2022, 2023],
      coverage: corpus.qa,
      rawSourceRowCounts: {
        '2022': source2022.rawSourceRowCounts,
        '2023': source2023.rawSourceRowCounts,
      },
      layerCounts: {
        gameFrames: corpus.gameFrames.length,
        staticPriors: corpus.staticPriors.length,
        advancedHistory: corpus.advancedHistory.length,
        ppaHistory: corpus.ppaHistory.length,
        historyEligibility: corpus.historyEligibility.length,
        outcomes: corpus.outcomes.length,
        marketEvaluation: corpus.marketEvaluation.length,
        quarantinedTransferPortalRows2022: source2022.portalRowCount,
        quarantinedTransferPortalRows2023: source2023.portalRowCount,
      },
      boundaries: {
        outcomesInPredictiveLayer: false,
        marketLinesInPredictiveLayer: false,
        transferPortalInPredictiveLayer: false,
        sameWeekHistoryReferences: corpus.qa.sameWeekHistoryReferenceCount,
        weekOneHistoryReferences: corpus.qa.weekOneHistoryReferenceCount,
        featureTransforms: false,
        validation2024Included: false,
        holdout2025Included: false,
      },
    };
    artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

    artifacts.sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : 0
    );
    const manifest = {
      version: HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
      builderRepoSha,
      sourceZipSha256: {
        '2022': FROZEN_SOURCES['2022'].zipSha256,
        '2023': FROZEN_SOURCES['2023'].zipSha256,
      },
      artifacts,
    };
    writeJsonExclusive(outputDir, 'manifest.json', manifest);

    console.log(
      JSON.stringify(
        {
          qaPass: true,
          version: HISTORICAL_DEVELOPMENT_CORPUS_V1_VERSION,
          builderRepoSha,
          canonicalGames: corpus.qa.canonicalGames,
          staticPriorRows: corpus.staticPriors.length,
          advancedHistoryRows: corpus.advancedHistory.length,
          ppaHistoryRows: corpus.ppaHistory.length,
          sameWeekHistoryReferences: corpus.qa.sameWeekHistoryReferenceCount,
          weekOneHistoryReferences: corpus.qa.weekOneHistoryReferenceCount,
          sourceProviderCallsDuringBuild: 0,
          databaseReads: false,
          databaseWrites: false,
          featureEngineeringInvoked: false,
          outputDir,
        },
        null,
        2
      )
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error('[historical-development-corpus-v1] ' + sanitizeError(error));
  process.exit(1);
}
