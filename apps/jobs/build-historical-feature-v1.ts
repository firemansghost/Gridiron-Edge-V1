import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  HISTORICAL_FEATURE_V1_VERSION,
  buildHistoricalFeatureV1,
} from './src/research/historical-feature-v1';

const CONFIRMATION =
  'BUILD_2022_2023_HISTORICAL_FEATURE_V1';

const FROZEN_CORPUS = {
  runId: 36479515332,
  artifactId: 10997010171,
  artifactName: 'historical-development-corpus-v1-36479515332',
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  builderRepoSha: '3d553b0925f55321d53c3048544aa16a047e41c8',
  rootDir: '36479515332',
} as const;

const SOURCE_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  gameFrames: 'predictive/game_frames.json',
  staticPriors: 'predictive/static_priors.json',
  advancedHistory: 'predictive/history_advanced.json',
  historyEligibility: 'predictive/history_eligibility.json',
  ppaHistory: 'predictive/history_ppa.json',
  outcomes: 'outcomes/outcomes.json',
  market: 'evaluation/market_lines.json',
  portal2022: 'quarantine/transfer_portal_2022.json',
  portal2023: 'quarantine/transfer_portal_2023.json',
} as const;

type SourcePath = (typeof SOURCE_PATHS)[keyof typeof SOURCE_PATHS];

const ALLOWED_SOURCE_READS = new Set<SourcePath>([
  SOURCE_PATHS.manifest,
  SOURCE_PATHS.report,
  SOURCE_PATHS.provenance,
  SOURCE_PATHS.gameFrames,
  SOURCE_PATHS.staticPriors,
  SOURCE_PATHS.advancedHistory,
  SOURCE_PATHS.historyEligibility,
]);

const FORBIDDEN_SOURCE_READS = [
  SOURCE_PATHS.ppaHistory,
  SOURCE_PATHS.outcomes,
  SOURCE_PATHS.market,
  SOURCE_PATHS.portal2022,
  SOURCE_PATHS.portal2023,
] as const;

interface Args {
  sourceCorpusZip: string;
  outputDir: string;
  confirm: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

type JsonObject = Record<string, unknown>;

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const sourceCorpusZip = values.get('--source-corpus-zip') ?? '';
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!sourceCorpusZip) throw new Error('source_corpus_zip_required');
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return { sourceCorpusZip, outputDir, confirm };
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
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

function safeArtifactPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_feature_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_feature_artifact_path');
  }
  return resolved;
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

function parseJsonBytes(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`invalid_json:${label}`);
  }
}

function requireJsonArray(bytes: Buffer, label: string): unknown[] {
  const value = parseJsonBytes(bytes, label);
  if (!Array.isArray(value)) throw new Error(`json_array_required:${label}`);
  return value;
}

function requireJsonObject(bytes: Buffer, label: string): JsonObject {
  const value = asObject(parseJsonBytes(bytes, label));
  if (!value) throw new Error(`json_object_required:${label}`);
  return value;
}

function validateCorpusIdentity(
  manifest: JsonObject,
  report: JsonObject,
  provenance: JsonObject
): void {
  if (
    manifest.version !== 'historical_development_corpus_v1' ||
    manifest.builderRepoSha !== FROZEN_CORPUS.builderRepoSha
  ) {
    throw new Error('corpus_manifest_identity_mismatch');
  }

  if (
    report.version !== 'historical_development_corpus_v1' ||
    report.mode !== 'ARTIFACT_ONLY_OFFLINE_BUILD' ||
    report.builderRepoSha !== FROZEN_CORPUS.builderRepoSha ||
    report.qaPass !== true ||
    report.sourceProviderCallsDuringBuild !== 0 ||
    report.databaseReads !== false ||
    report.databaseWrites !== false ||
    report.prismaInvoked !== false ||
    report.featureEngineeringInvoked !== false ||
    report.modelFittingInvoked !== false
  ) {
    throw new Error('corpus_report_identity_mismatch');
  }

  if (
    provenance.version !== 'historical_development_corpus_v1' ||
    provenance.builderRepoSha !== FROZEN_CORPUS.builderRepoSha
  ) {
    throw new Error('corpus_provenance_identity_mismatch');
  }
}

function manifestArtifactMap(manifest: JsonObject): Map<string, JsonObject> {
  const artifacts = manifest.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== 11) {
    throw new Error('corpus_manifest_artifact_count_mismatch');
  }

  const result = new Map<string, JsonObject>();
  for (const raw of artifacts) {
    const entry = asObject(raw);
    const file = entry && typeof entry.file === 'string' ? entry.file : '';
    if (!entry || !file || result.has(file)) {
      throw new Error('invalid_corpus_manifest_artifact');
    }
    result.set(file, entry);
  }
  return result;
}

function verifyManifestedBytes(
  artifactMap: Map<string, JsonObject>,
  sourcePath: string,
  bytes: Buffer
): void {
  const entry = artifactMap.get(sourcePath);
  if (!entry) throw new Error(`corpus_manifest_entry_missing:${sourcePath}`);

  const expectedBytes =
    typeof entry.bytes === 'number' && Number.isInteger(entry.bytes)
      ? entry.bytes
      : null;
  const expectedSha =
    typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';

  if (
    expectedBytes === null ||
    !/^[0-9a-f]{64}$/.test(expectedSha) ||
    bytes.length !== expectedBytes ||
    sha256Bytes(bytes) !== expectedSha
  ) {
    throw new Error(`corpus_manifest_verification_failed:${sourcePath}`);
  }
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    'invalid_confirmation',
    'source_corpus_zip_required',
    'output_dir_required',
    'output_dir_already_exists',
    'invalid_git_head_sha',
    'source_corpus_zip_missing',
    'source_corpus_zip_hash_mismatch',
  ];
  if (known.includes(message)) return message;
  if (/corpus_/.test(message)) return message.replace(/:.*/, '');
  if (/historical_feature_v1/.test(message)) return message.replace(/:.*/, '');
  if (/history_/.test(message)) return message.replace(/:.*/, '');
  if (/static_/.test(message)) return message.replace(/:.*/, '');
  if (/feature_/.test(message)) return message.replace(/:.*/, '');
  if (/invalid_/.test(message)) return message.replace(/:.*/, '');
  return 'historical_feature_v1_build_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sourceZip = path.resolve(args.sourceCorpusZip);

  if (!fs.existsSync(sourceZip) || !fs.statSync(sourceZip).isFile()) {
    throw new Error('source_corpus_zip_missing');
  }
  if (sha256File(sourceZip) !== FROZEN_CORPUS.zipSha256) {
    throw new Error('source_corpus_zip_hash_mismatch');
  }

  const sourceReadCounts: Record<SourcePath, number> = {
    [SOURCE_PATHS.manifest]: 0,
    [SOURCE_PATHS.report]: 0,
    [SOURCE_PATHS.provenance]: 0,
    [SOURCE_PATHS.gameFrames]: 0,
    [SOURCE_PATHS.staticPriors]: 0,
    [SOURCE_PATHS.advancedHistory]: 0,
    [SOURCE_PATHS.historyEligibility]: 0,
    [SOURCE_PATHS.ppaHistory]: 0,
    [SOURCE_PATHS.outcomes]: 0,
    [SOURCE_PATHS.market]: 0,
    [SOURCE_PATHS.portal2022]: 0,
    [SOURCE_PATHS.portal2023]: 0,
  };

  const readSource = (sourcePath: SourcePath): Buffer => {
    if (!ALLOWED_SOURCE_READS.has(sourcePath)) {
      throw new Error(`forbidden_source_layer_read:${sourcePath}`);
    }
    const archivePath = `${FROZEN_CORPUS.rootDir}/${sourcePath}`;
    let bytes: Buffer;
    try {
      bytes = execFileSync('unzip', ['-p', sourceZip, archivePath], {
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      throw new Error(`corpus_source_entry_read_failed:${sourcePath}`);
    }
    sourceReadCounts[sourcePath] += 1;
    return bytes;
  };

  const manifestBytes = readSource(SOURCE_PATHS.manifest);
  const reportBytes = readSource(SOURCE_PATHS.report);
  const provenanceBytes = readSource(SOURCE_PATHS.provenance);

  const manifest = requireJsonObject(manifestBytes, SOURCE_PATHS.manifest);
  const report = requireJsonObject(reportBytes, SOURCE_PATHS.report);
  const provenance = requireJsonObject(
    provenanceBytes,
    SOURCE_PATHS.provenance
  );
  validateCorpusIdentity(manifest, report, provenance);

  const artifactMap = manifestArtifactMap(manifest);

  const gameFrameBytes = readSource(SOURCE_PATHS.gameFrames);
  const staticPriorBytes = readSource(SOURCE_PATHS.staticPriors);
  const advancedHistoryBytes = readSource(SOURCE_PATHS.advancedHistory);
  const historyEligibilityBytes = readSource(SOURCE_PATHS.historyEligibility);

  verifyManifestedBytes(artifactMap, SOURCE_PATHS.gameFrames, gameFrameBytes);
  verifyManifestedBytes(artifactMap, SOURCE_PATHS.staticPriors, staticPriorBytes);
  verifyManifestedBytes(
    artifactMap,
    SOURCE_PATHS.advancedHistory,
    advancedHistoryBytes
  );
  verifyManifestedBytes(
    artifactMap,
    SOURCE_PATHS.historyEligibility,
    historyEligibilityBytes
  );

  for (const forbiddenPath of FORBIDDEN_SOURCE_READS) {
    if (sourceReadCounts[forbiddenPath] !== 0) {
      throw new Error(`forbidden_source_layer_opened:${forbiddenPath}`);
    }
  }

  const built = buildHistoricalFeatureV1({
    gameFrames: requireJsonArray(gameFrameBytes, SOURCE_PATHS.gameFrames),
    staticPriors: requireJsonArray(staticPriorBytes, SOURCE_PATHS.staticPriors),
    advancedHistory: requireJsonArray(
      advancedHistoryBytes,
      SOURCE_PATHS.advancedHistory
    ),
    historyEligibility: requireJsonArray(
      historyEligibilityBytes,
      SOURCE_PATHS.historyEligibility
    ),
  });

  const outputDir = path.resolve(args.outputDir);
  ensureNewOutputDir(outputDir);
  const artifacts: ArtifactDigest[] = [];

  artifacts.push(
    writeJsonExclusive(outputDir, 'features/game_features.json', built.rows)
  );

  const builderRepoSha = repoCommitSha();
  const sourceProvenance = {
    version: HISTORICAL_FEATURE_V1_VERSION,
    builderRepoSha,
    sourceCorpus: {
      runId: FROZEN_CORPUS.runId,
      artifactId: FROZEN_CORPUS.artifactId,
      artifactName: FROZEN_CORPUS.artifactName,
      zipSha256: FROZEN_CORPUS.zipSha256,
      corpusBuilderRepoSha: FROZEN_CORPUS.builderRepoSha,
      manifestSha256: sha256Bytes(manifestBytes),
      reportSha256: sha256Bytes(reportBytes),
      provenanceSha256: sha256Bytes(provenanceBytes),
    },
  };
  artifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', sourceProvenance)
  );

  const featureReport = {
    version: HISTORICAL_FEATURE_V1_VERSION,
    mode: 'ARTIFACT_ONLY_OFFLINE_FEATURE_BUILD',
    builderRepoSha,
    qaPass: true,
    sourceProviderCallsDuringBuild: 0,
    githubArtifactDownloadsDuringBuilderProcess: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    normalizationInvoked: false,
    modelFittingInvoked: false,
    outcomeLayerReads: sourceReadCounts[SOURCE_PATHS.outcomes],
    marketLayerReads: sourceReadCounts[SOURCE_PATHS.market],
    ppaHistoryLayerReads: sourceReadCounts[SOURCE_PATHS.ppaHistory],
    quarantineLayerReads:
      sourceReadCounts[SOURCE_PATHS.portal2022] +
      sourceReadCounts[SOURCE_PATHS.portal2023],
    sourceFileReadCounts: sourceReadCounts,
    featureQa: built.qa,
    boundaries: {
      developmentSeasons: [2022, 2023],
      validation2024Included: false,
      holdout2025Included: false,
      fbsVsFcsHistoryUsed: false,
      outcomesUsed: false,
      marketUsed: false,
      portalUsed: false,
      ppaSidecarUsed: false,
      zScoresComputed: false,
      matchupDeltasComputed: false,
      hfaComputed: false,
      modelWeightsComputed: false,
    },
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', featureReport));

  artifacts.sort((left, right) =>
    left.file < right.file ? -1 : left.file > right.file ? 1 : 0
  );
  const featureManifest = {
    version: HISTORICAL_FEATURE_V1_VERSION,
    builderRepoSha,
    sourceCorpusZipSha256: FROZEN_CORPUS.zipSha256,
    artifacts,
  };
  writeJsonExclusive(outputDir, 'manifest.json', featureManifest);

  console.log(
    JSON.stringify(
      {
        qaPass: true,
        version: HISTORICAL_FEATURE_V1_VERSION,
        builderRepoSha,
        gameRows: built.qa.gameRows,
        teamSides: built.qa.teamSides,
        zeroPriorFbsGameSides: built.qa.zeroPriorFbsGameSides,
        fbsVsFcsReferencesExcluded: built.qa.fbsVsFcsReferencesExcluded,
        canonicalHistoryReferencesUsed: built.qa.canonicalHistoryReferencesUsed,
        sameWeekOrLaterReferences: built.qa.sameWeekOrLaterReferences,
        outcomeLayerReads: sourceReadCounts[SOURCE_PATHS.outcomes],
        marketLayerReads: sourceReadCounts[SOURCE_PATHS.market],
        ppaHistoryLayerReads: sourceReadCounts[SOURCE_PATHS.ppaHistory],
        quarantineLayerReads:
          sourceReadCounts[SOURCE_PATHS.portal2022] +
          sourceReadCounts[SOURCE_PATHS.portal2023],
        sourceProviderCallsDuringBuild: 0,
        databaseReads: false,
        databaseWrites: false,
        normalizationInvoked: false,
        modelFittingInvoked: false,
        outputDir,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error('[historical-feature-v1] ' + sanitizeError(error));
  process.exit(1);
}
