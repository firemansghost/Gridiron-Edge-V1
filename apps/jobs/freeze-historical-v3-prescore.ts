#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildHistoricalV3PreScoreFreeze,
  HISTORICAL_V3_PRESCORE_VERSION,
} from './src/research/historical-v3-confirmation';
import type { HistoricalModelDevelopmentInput } from './src/research/historical-model-development-v1';
import type { HistoricalModelV3Candidate } from './src/research/historical-model-v3';
import type { HistoricalV3PredictiveGameInput } from './src/research/historical-v3-predictive-inputs';

const CONFIRMATION = 'FREEZE_2024_HISTORICAL_V3_PRESCORE_INPUTS';

const FROZEN_FEATURE = {
  artifactId: 11000651389,
  zipSha256:
    '047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2',
  builderRepoSha: '743738eea6dfd0852cf28c5941aa998be300b0c9',
} as const;

const FROZEN_CORPUS = {
  artifactId: 10997010171,
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  builderRepoSha: '3d553b0925f55321d53c3048544aa16a047e41c8',
} as const;

const FROZEN_2024_SNAPSHOT = {
  artifactId: 11008470975,
  zipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  sourceRepoSha: 'e1b27f6c5681f6ab4f8d24e50f88e387c64657a7',
} as const;

const FROZEN_V2_REJECTED = {
  artifactId: 11033760438,
  zipSha256:
    'cdfb0c533c8ae6ffc44a29b6929185fd30229a73e18f87635227e5b8ecc3237c',
  status: 'HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED',
} as const;

const CONTRACT_PATH =
  'research/historical/HISTORICAL_SOURCE_RESILIENT_CONFIRMATION_V3_CONTRACT.md';

type JsonObject = Record<string, unknown>;

interface Args {
  featureZip: string;
  corpusZip: string;
  v3ModelZip: string;
  v3ModelZipSha256: string;
  predictiveZip: string;
  predictiveZipSha256: string;
  resolutionZip: string;
  resolutionZipSha256: string;
  outputDir: string;
  confirm: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const result: Args = {
    featureZip: values.get('--feature-zip') ?? '',
    corpusZip: values.get('--corpus-zip') ?? '',
    v3ModelZip: values.get('--v3-model-zip') ?? '',
    v3ModelZipSha256: (values.get('--v3-model-zip-sha256') ?? '').toLowerCase(),
    predictiveZip: values.get('--predictive-zip') ?? '',
    predictiveZipSha256: (values.get('--predictive-zip-sha256') ?? '').toLowerCase(),
    resolutionZip: values.get('--resolution-zip') ?? '',
    resolutionZipSha256: (values.get('--resolution-zip-sha256') ?? '').toLowerCase(),
    outputDir: values.get('--output-dir') ?? '',
    confirm: values.get('--confirm') ?? '',
  };

  for (const [key, value] of Object.entries(result)) {
    if (key.endsWith('Zip') && !value) throw new Error(`${key}_required`);
  }
  for (const value of [
    result.v3ModelZipSha256,
    result.predictiveZipSha256,
    result.resolutionZipSha256,
  ]) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('input_zip_sha256_required');
  }
  if (!result.outputDir) throw new Error('output_dir_required');
  if (result.confirm !== CONFIRMATION) throw new Error('invalid_confirmation');
  return result;
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

function archiveEntries(zipPath: string): string[] {
  try {
    return execFileSync('unzip', ['-Z1', zipPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    throw new Error('archive_list_failed');
  }
}

function findArchiveRoot(zipPath: string): string {
  const manifests = archiveEntries(zipPath).filter(
    (entry) => entry === 'manifest.json' || entry.endsWith('/manifest.json')
  );
  if (manifests.length !== 1) throw new Error('archive_root_ambiguous');
  const dir = path.posix.dirname(manifests[0]);
  return dir === '.' ? '' : dir;
}

function archiveRead(zipPath: string, rootDir: string, member: string): Buffer {
  const full = rootDir ? `${rootDir}/${member}` : member;
  try {
    return execFileSync('unzip', ['-p', zipPath, full], {
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    throw new Error(`archive_member_read_failed:${member}`);
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`invalid_json:${label}`);
  }
}

function jsonObject(bytes: Buffer, label: string): JsonObject {
  const value = asObject(parseJson(bytes, label));
  if (!value) throw new Error(`json_object_required:${label}`);
  return value;
}

function jsonArray(bytes: Buffer, label: string): unknown[] {
  const value = parseJson(bytes, label);
  if (!Array.isArray(value)) throw new Error(`json_array_required:${label}`);
  return value;
}

function manifestMap(manifest: JsonObject): Map<string, JsonObject> {
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('manifest_artifacts_required');
  }
  const result = new Map<string, JsonObject>();
  for (const raw of manifest.artifacts) {
    const entry = asObject(raw);
    const file = entry && typeof entry.file === 'string' ? entry.file : '';
    if (!entry || !file || result.has(file)) {
      throw new Error('invalid_manifest_artifact');
    }
    result.set(file, entry);
  }
  return result;
}

function verifyManifestedBytes(
  map: Map<string, JsonObject>,
  member: string,
  bytes: Buffer
): string {
  const entry = map.get(member);
  if (!entry) throw new Error(`manifest_entry_missing:${member}`);
  const expectedBytes =
    typeof entry.bytes === 'number' && Number.isInteger(entry.bytes)
      ? entry.bytes
      : null;
  const expectedSha =
    typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';
  if (
    expectedBytes === null ||
    expectedBytes !== bytes.length ||
    !/^[0-9a-f]{64}$/.test(expectedSha) ||
    sha256Bytes(bytes) !== expectedSha
  ) {
    throw new Error(`manifest_member_mismatch:${member}`);
  }
  return expectedSha;
}

function assertFile(
  filePath: string,
  expectedSha: string,
  missingCode: string,
  hashCode: string
): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(missingCode);
  }
  if (sha256File(filePath) !== expectedSha) throw new Error(hashCode);
}

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
    throw new Error('unsafe_v3_prescore_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_v3_prescore_artifact_path');
  }
  return resolved;
}

function writeBytesExclusive(
  outputDir: string,
  relativePath: string,
  bytes: Buffer
): ArtifactDigest {
  const fullPath = safeOutputPath(outputDir, relativePath);
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

function readTracked(
  ledger: Record<string, number>,
  prefix: string,
  zipPath: string,
  root: string,
  member: string
): Buffer {
  const key = `${prefix}:${member}`;
  ledger[key] = (ledger[key] ?? 0) + 1;
  return archiveRead(zipPath, root, member);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/(_required|_missing|_mismatch|_failed|_invalid|_nonfinite|_count|_identity|_not_pass)/.test(message)) {
    return message.replace(/:.*/, '');
  }
  if (/archive_|manifest_|v3_confirmation_|v3_predictive_/.test(message)) {
    return message.replace(/:.*/, '');
  }
  return 'historical_v3_prescore_freeze_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const featureZip = path.resolve(args.featureZip);
  const corpusZip = path.resolve(args.corpusZip);
  const v3ModelZip = path.resolve(args.v3ModelZip);
  const predictiveZip = path.resolve(args.predictiveZip);
  const resolutionZip = path.resolve(args.resolutionZip);
  const outputDir = path.resolve(args.outputDir);

  assertFile(featureZip, FROZEN_FEATURE.zipSha256, 'feature_zip_missing', 'feature_zip_hash_mismatch');
  assertFile(corpusZip, FROZEN_CORPUS.zipSha256, 'corpus_zip_missing', 'corpus_zip_hash_mismatch');
  assertFile(v3ModelZip, args.v3ModelZipSha256, 'v3_model_zip_missing', 'v3_model_zip_hash_mismatch');
  assertFile(predictiveZip, args.predictiveZipSha256, 'predictive_zip_missing', 'predictive_zip_hash_mismatch');
  assertFile(resolutionZip, args.resolutionZipSha256, 'resolution_zip_missing', 'resolution_zip_hash_mismatch');

  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');

  const reads: Record<string, number> = {};

  const featureRoot = findArchiveRoot(featureZip);
  const featureManifestBytes = readTracked(reads, 'feature', featureZip, featureRoot, 'manifest.json');
  const featureReportBytes = readTracked(reads, 'feature', featureZip, featureRoot, 'report.json');
  const featureRowsBytes = readTracked(reads, 'feature', featureZip, featureRoot, 'features/game_features.json');
  const featureManifest = jsonObject(featureManifestBytes, 'feature_manifest');
  const featureReport = jsonObject(featureReportBytes, 'feature_report');
  if (
    featureManifest.version !== 'historical_feature_v1' ||
    featureManifest.builderRepoSha !== FROZEN_FEATURE.builderRepoSha ||
    featureReport.version !== 'historical_feature_v1' ||
    featureReport.qaPass !== true
  ) {
    throw new Error('feature_artifact_identity_mismatch');
  }
  verifyManifestedBytes(manifestMap(featureManifest), 'features/game_features.json', featureRowsBytes);

  const corpusRoot = findArchiveRoot(corpusZip);
  const corpusManifestBytes = readTracked(reads, 'corpus', corpusZip, corpusRoot, 'manifest.json');
  const corpusReportBytes = readTracked(reads, 'corpus', corpusZip, corpusRoot, 'report.json');
  const outcomeBytes = readTracked(reads, 'corpus', corpusZip, corpusRoot, 'outcomes/outcomes.json');
  const corpusManifest = jsonObject(corpusManifestBytes, 'corpus_manifest');
  const corpusReport = jsonObject(corpusReportBytes, 'corpus_report');
  if (
    corpusManifest.version !== 'historical_development_corpus_v1' ||
    corpusManifest.builderRepoSha !== FROZEN_CORPUS.builderRepoSha ||
    corpusReport.version !== 'historical_development_corpus_v1' ||
    corpusReport.qaPass !== true
  ) {
    throw new Error('corpus_artifact_identity_mismatch');
  }
  verifyManifestedBytes(manifestMap(corpusManifest), 'outcomes/outcomes.json', outcomeBytes);

  const v3Root = findArchiveRoot(v3ModelZip);
  const v3ManifestBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'manifest.json');
  const v3ReportBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'report.json');
  const v3ProvenanceBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'source_provenance.json');
  const candidateBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'candidate/v3_candidate.json');
  const backcompatBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'audit/v1_v3_backcompat.json');
  const v3Manifest = jsonObject(v3ManifestBytes, 'v3_model_manifest');
  const v3Report = jsonObject(v3ReportBytes, 'v3_model_report');
  const v3Provenance = jsonObject(v3ProvenanceBytes, 'v3_model_provenance');
  if (
    v3Manifest.version !== 'historical_model_v3_backcompat_v1' ||
    v3Manifest.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Report.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Report.validation2024Reads !== 0 ||
    v3Report.holdout2025Reads !== 0 ||
    v3Report.marketReads !== 0
  ) {
    throw new Error('v3_model_artifact_identity_mismatch');
  }
  const v3Map = manifestMap(v3Manifest);
  const candidateSha = verifyManifestedBytes(v3Map, 'candidate/v3_candidate.json', candidateBytes);
  const backcompatSha = verifyManifestedBytes(v3Map, 'audit/v1_v3_backcompat.json', backcompatBytes);
  const backcompat = jsonObject(backcompatBytes, 'v3_backcompat');
  if (backcompat.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    throw new Error('v3_confirmation_backcompat_not_pass');
  }
  const candidate = parseJson(candidateBytes, 'v3_candidate') as HistoricalModelV3Candidate;

  const resolutionRoot = findArchiveRoot(resolutionZip);
  const resolutionManifestBytes = readTracked(reads, 'resolution', resolutionZip, resolutionRoot, 'manifest.json');
  const resolutionReportBytes = readTracked(reads, 'resolution', resolutionZip, resolutionRoot, 'report.json');
  const resolutionManifest = jsonObject(resolutionManifestBytes, 'resolution_manifest');
  const resolutionReport = jsonObject(resolutionReportBytes, 'resolution_report');
  if (
    resolutionManifest.version !== 'historical_v3_week_query_resolution_v1' ||
    resolutionManifest.status !== resolutionReport.status ||
    !['HISTORICAL_V3_WEEK_QUERY_QUALIFIED', 'HISTORICAL_V3_WEEK_QUERY_REJECTED'].includes(String(resolutionReport.status))
  ) {
    throw new Error('resolution_artifact_identity_mismatch');
  }
  verifyManifestedBytes(manifestMap(resolutionManifest), 'report.json', resolutionReportBytes);

  const predictiveRoot = findArchiveRoot(predictiveZip);
  const predictiveManifestBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'manifest.json');
  const predictiveReportBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'report.json');
  const predictiveProvenanceBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'source_provenance.json');
  const predictiveRowsBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'predictive/v3_game_inputs.json');
  const predictiveQaBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'audit/source_gap_report.json');
  const predictiveManifest = jsonObject(predictiveManifestBytes, 'predictive_manifest');
  const predictiveReport = jsonObject(predictiveReportBytes, 'predictive_report');
  const predictiveProvenance = jsonObject(predictiveProvenanceBytes, 'predictive_provenance');
  if (
    predictiveManifest.version !== 'historical_v3_predictive_inputs_v1' ||
    predictiveManifest.status !== 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT' ||
    predictiveManifest.season !== 2024 ||
    predictiveReport.status !== 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT' ||
    predictiveReport.canonicalGames !== 752 ||
    predictiveReport.canonicalTeams !== 134 ||
    predictiveReport.providerCalls !== 0 ||
    predictiveReport.marketReads !== 0 ||
    predictiveReport.ppaSidecarReads !== 0 ||
    predictiveReport.portalReads !== 0 ||
    predictiveReport.outcomeFieldsUsed !== false ||
    predictiveReport.outcomeScoringReads !== 0 ||
    predictiveReport.modelPredictionsComputed !== false ||
    predictiveReport.holdout2025Reads !== 0
  ) {
    throw new Error('predictive_artifact_identity_mismatch');
  }
  const predictiveMap = manifestMap(predictiveManifest);
  const predictiveRowsSha = verifyManifestedBytes(
    predictiveMap,
    'predictive/v3_game_inputs.json',
    predictiveRowsBytes
  );
  const predictiveQaSha = verifyManifestedBytes(
    predictiveMap,
    'audit/source_gap_report.json',
    predictiveQaBytes
  );
  const predictiveSource = asObject(predictiveProvenance.v3ModelArtifact);
  const predictiveResolution = asObject(predictiveProvenance.v3ResolutionArtifact);
  const predictiveSnapshot = asObject(predictiveProvenance.frozen2024Snapshot);
  if (
    !predictiveSource ||
    predictiveSource.zipSha256 !== args.v3ModelZipSha256 ||
    !predictiveResolution ||
    predictiveResolution.zipSha256 !== args.resolutionZipSha256 ||
    predictiveResolution.status !== resolutionReport.status ||
    !predictiveSnapshot ||
    predictiveSnapshot.zipSha256 !== FROZEN_2024_SNAPSHOT.zipSha256
  ) {
    throw new Error('predictive_provenance_mismatch');
  }

  const predictiveRows = jsonArray(
    predictiveRowsBytes,
    'predictive_rows'
  ) as HistoricalV3PredictiveGameInput[];
  const developmentInput: HistoricalModelDevelopmentInput = {
    featureRows: jsonArray(featureRowsBytes, 'development_features'),
    outcomeRows: jsonArray(outcomeBytes, 'development_outcomes'),
  };

  const frozen = buildHistoricalV3PreScoreFreeze({
    candidate,
    backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS',
    predictiveRows,
    developmentInput,
  });

  const predictiveQa = jsonObject(predictiveQaBytes, 'predictive_qa');
  if (
    predictiveQa.sourceGapFormSides !== frozen.staticMissingnessCounts.sourceGapFormSides ||
    predictiveQa.naturalNoPriorFormSides !== frozen.staticMissingnessCounts.naturalFormMissingSides
  ) {
    throw new Error('prescore_source_gap_summary_mismatch');
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const artifacts: ArtifactDigest[] = [];
  const hfaDigest = writeJsonExclusive(outputDir, 'baselines/hfa.json', frozen.hfaBaseline);
  artifacts.push(hfaDigest);
  const eloDigest = writeJsonExclusive(outputDir, 'baselines/elo_hfa.json', frozen.eloHfaBaseline);
  artifacts.push(eloDigest);

  const repoSha = repoCommitSha();
  const contractBytes = fs.readFileSync(path.resolve(CONTRACT_PATH));
  const inputManifest = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    status: frozen.status,
    repoSha,
    contract: {
      path: CONTRACT_PATH,
      sha256: sha256Bytes(contractBytes),
    },
    modelDefinitionId: frozen.modelDefinitionId,
    lambda: frozen.lambda,
    frozenV1CandidateIdentity: asObject(v3Provenance.frozenV1ModelArtifact) ?? null,
    v3Candidate: {
      zipSha256: args.v3ModelZipSha256,
      member: 'candidate/v3_candidate.json',
      memberSha256: candidateSha,
      backcompatMember: 'audit/v1_v3_backcompat.json',
      backcompatMemberSha256: backcompatSha,
    },
    frozen2024Snapshot: FROZEN_2024_SNAPSHOT,
    rejectedV2SourceEvidence: FROZEN_V2_REJECTED,
    v3Resolution: {
      zipSha256: args.resolutionZipSha256,
      status: resolutionReport.status,
      manifestSha256: sha256Bytes(resolutionManifestBytes),
      reportSha256: sha256Bytes(resolutionReportBytes),
    },
    v3PredictiveInputs: {
      zipSha256: args.predictiveZipSha256,
      member: 'predictive/v3_game_inputs.json',
      memberSha256: predictiveRowsSha,
      qaMember: 'audit/source_gap_report.json',
      qaMemberSha256: predictiveQaSha,
      manifestSha256: sha256Bytes(predictiveManifestBytes),
      reportSha256: sha256Bytes(predictiveReportBytes),
      provenanceSha256: sha256Bytes(predictiveProvenanceBytes),
    },
    canonicalGameIds: frozen.canonicalGameIds,
    canonicalGames: frozen.canonicalGames,
    staticMissingnessCounts: frozen.staticMissingnessCounts,
    sourceGapSides: frozen.sourceGapSides,
    baselineArtifacts: {
      hfa: hfaDigest,
      eloHfa: eloDigest,
    },
    developmentEvidence: {
      featureZipSha256: FROZEN_FEATURE.zipSha256,
      featureRowsSha256: sha256Bytes(featureRowsBytes),
      corpusZipSha256: FROZEN_CORPUS.zipSha256,
      outcomesSha256: sha256Bytes(outcomeBytes),
    },
    sourceMemberReadLedger: reads,
    forbiddenReads: {
      market: 0,
      ppaSidecar: 0,
      portal: 0,
      outcome2024: 0,
      holdout2025: 0,
    },
  };
  const inputManifestDigest = writeJsonExclusive(
    outputDir,
    'freeze/input_manifest.json',
    inputManifest
  );
  artifacts.push(inputManifestDigest);

  const provenance = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    builderRepoSha: repoSha,
    v3ModelZipSha256: args.v3ModelZipSha256,
    predictiveZipSha256: args.predictiveZipSha256,
    resolutionZipSha256: args.resolutionZipSha256,
    inputManifestSha256: inputManifestDigest.sha256,
    sourceMemberReadLedger: reads,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'source_provenance.json', provenance));

  const report = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    mode: 'ARTIFACT_ONLY_OFFLINE_V3_PRESCORE_FREEZE',
    builderRepoSha: repoSha,
    status: frozen.status,
    canonicalGames: frozen.canonicalGames,
    providerCalls: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    marketReads: 0,
    ppaSidecarReads: 0,
    portalReads: 0,
    outcome2024Reads: 0,
    modelPredictions2024Computed: false,
    holdout2025Reads: 0,
    sourceGapFormSides: frozen.staticMissingnessCounts.sourceGapFormSides,
    inputManifestSha256: inputManifestDigest.sha256,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((a, b) => a.file.localeCompare(b.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    builderRepoSha: repoSha,
    status: frozen.status,
    inputManifestSha256: inputManifestDigest.sha256,
    artifacts,
  });

  console.log(JSON.stringify({
    status: frozen.status,
    canonicalGames: frozen.canonicalGames,
    sourceGapFormSides: frozen.staticMissingnessCounts.sourceGapFormSides,
    providerCalls: 0,
    outcome2024Reads: 0,
    marketReads: 0,
    holdout2025Reads: 0,
    databaseReads: false,
    databaseWrites: false,
    inputManifestSha256: inputManifestDigest.sha256,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[historical-v3-prescore] ' + sanitizeError(error));
  process.exit(1);
}
