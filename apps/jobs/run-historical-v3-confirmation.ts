#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  scoreHistoricalV3Confirmation,
  HISTORICAL_V3_CONFIRMATION_VERSION,
  HISTORICAL_V3_PRESCORE_VERSION,
  type HistoricalV3BaselineState,
  type HistoricalV3OutcomeRow,
} from './src/research/historical-v3-confirmation';
import type { HistoricalModelV3Candidate } from './src/research/historical-model-v3';
import type { HistoricalV3PredictiveGameInput } from './src/research/historical-v3-predictive-inputs';

const CONFIRMATION = 'SCORE_2024_HISTORICAL_V3_CONFIRMATION_ONCE';

const FROZEN_2024_SNAPSHOT = {
  artifactId: 11008470975,
  zipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  sourceRepoSha: 'e1b27f6c5681f6ab4f8d24e50f88e387c64657a7',
  providerCalls: 28,
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  snapshotZip: string;
  prescoreZip: string;
  prescoreZipSha256: string;
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
    snapshotZip: values.get('--snapshot-zip') ?? '',
    prescoreZip: values.get('--prescore-zip') ?? '',
    prescoreZipSha256: (values.get('--prescore-zip-sha256') ?? '').toLowerCase(),
    v3ModelZip: values.get('--v3-model-zip') ?? '',
    v3ModelZipSha256: (values.get('--v3-model-zip-sha256') ?? '').toLowerCase(),
    predictiveZip: values.get('--predictive-zip') ?? '',
    predictiveZipSha256: (values.get('--predictive-zip-sha256') ?? '').toLowerCase(),
    resolutionZip: values.get('--resolution-zip') ?? '',
    resolutionZipSha256: (values.get('--resolution-zip-sha256') ?? '').toLowerCase(),
    outputDir: values.get('--output-dir') ?? '',
    confirm: values.get('--confirm') ?? '',
  };
  for (const key of ['snapshotZip', 'prescoreZip', 'v3ModelZip', 'predictiveZip', 'resolutionZip'] as const) {
    if (!result[key]) throw new Error(`${key}_required`);
  }
  for (const key of ['prescoreZipSha256', 'v3ModelZipSha256', 'predictiveZipSha256', 'resolutionZipSha256'] as const) {
    if (!/^[0-9a-f]{64}$/.test(result[key])) throw new Error(`${key}_required`);
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

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
  if (!Array.isArray(manifest.artifacts)) throw new Error('manifest_artifacts_required');
  const result = new Map<string, JsonObject>();
  for (const raw of manifest.artifacts) {
    const entry = asObject(raw);
    const file = entry && typeof entry.file === 'string' ? entry.file : '';
    if (!entry || !file || result.has(file)) throw new Error('invalid_manifest_artifact');
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
    throw new Error('unsafe_v3_confirmation_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_v3_confirmation_artifact_path');
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

function findSnapshotGamesMember(report: JsonObject): string {
  const provider = asObject(report.provider);
  if (
    !provider ||
    provider.name !== 'CFBD' ||
    provider.callsAttempted !== FROZEN_2024_SNAPSHOT.providerCalls ||
    provider.callsSucceeded !== FROZEN_2024_SNAPSHOT.providerCalls ||
    !Array.isArray(provider.calls)
  ) {
    throw new Error('snapshot_provider_identity_mismatch');
  }
  const games = provider.calls
    .map(asObject)
    .filter((call): call is JsonObject => call !== null)
    .find((call) => call.requestId === 'games');
  const rawFile = games ? stringValue(games.rawFile) : null;
  if (!games || games.ok !== true || games.httpStatus !== 200 || !rawFile) {
    throw new Error('snapshot_games_call_missing');
  }
  return rawFile;
}

function buildOutcomes(rows: unknown[]): HistoricalV3OutcomeRow[] {
  const result: HistoricalV3OutcomeRow[] = [];
  const seen = new Set<number>();

  for (const raw of rows) {
    const row = asObject(raw);
    if (
      !row ||
      integer(row.season) !== 2024 ||
      row.seasonType !== 'regular' ||
      row.completed !== true ||
      row.homeClassification !== 'fbs' ||
      row.awayClassification !== 'fbs'
    ) {
      continue;
    }
    const gameId = integer(row.id);
    const homeTeam = stringValue(row.homeTeam);
    const awayTeam = stringValue(row.awayTeam);
    const homePoints = finite(row.homePoints);
    const awayPoints = finite(row.awayPoints);
    if (
      gameId === null ||
      gameId <= 0 ||
      !homeTeam ||
      !awayTeam ||
      homePoints === null ||
      awayPoints === null ||
      seen.has(gameId)
    ) {
      throw new Error('v3_confirmation_outcome_identity_invalid');
    }
    seen.add(gameId);
    result.push({
      gameId,
      homeTeam,
      awayTeam,
      finalHomePoints: homePoints,
      finalAwayPoints: awayPoints,
      homeMargin: homePoints - awayPoints,
    });
  }

  result.sort((a, b) => a.gameId - b.gameId);
  return result;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/(_required|_missing|_mismatch|_failed|_invalid|_nonfinite|_count|_identity|_not_pass)/.test(message)) {
    return message.replace(/:.*/, '');
  }
  if (/archive_|manifest_|snapshot_|v3_confirmation_|predictive_|prescore_/.test(message)) {
    return message.replace(/:.*/, '');
  }
  return 'historical_v3_confirmation_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const snapshotZip = path.resolve(args.snapshotZip);
  const prescoreZip = path.resolve(args.prescoreZip);
  const v3ModelZip = path.resolve(args.v3ModelZip);
  const predictiveZip = path.resolve(args.predictiveZip);
  const resolutionZip = path.resolve(args.resolutionZip);
  const outputDir = path.resolve(args.outputDir);

  assertFile(snapshotZip, FROZEN_2024_SNAPSHOT.zipSha256, 'snapshot_zip_missing', 'snapshot_zip_hash_mismatch');
  assertFile(prescoreZip, args.prescoreZipSha256, 'prescore_zip_missing', 'prescore_zip_hash_mismatch');
  assertFile(v3ModelZip, args.v3ModelZipSha256, 'v3_model_zip_missing', 'v3_model_zip_hash_mismatch');
  assertFile(predictiveZip, args.predictiveZipSha256, 'predictive_zip_missing', 'predictive_zip_hash_mismatch');
  assertFile(resolutionZip, args.resolutionZipSha256, 'resolution_zip_missing', 'resolution_zip_hash_mismatch');
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');

  const reads: Record<string, number> = {};

  // Verify the complete frozen pre-score package before opening 2024 outcomes.
  const prescoreRoot = findArchiveRoot(prescoreZip);
  const prescoreManifestBytes = readTracked(reads, 'prescore', prescoreZip, prescoreRoot, 'manifest.json');
  const prescoreReportBytes = readTracked(reads, 'prescore', prescoreZip, prescoreRoot, 'report.json');
  const inputManifestBytes = readTracked(reads, 'prescore', prescoreZip, prescoreRoot, 'freeze/input_manifest.json');
  const hfaBytes = readTracked(reads, 'prescore', prescoreZip, prescoreRoot, 'baselines/hfa.json');
  const eloBytes = readTracked(reads, 'prescore', prescoreZip, prescoreRoot, 'baselines/elo_hfa.json');
  const prescoreManifest = jsonObject(prescoreManifestBytes, 'prescore_manifest');
  const prescoreReport = jsonObject(prescoreReportBytes, 'prescore_report');
  const inputManifest = jsonObject(inputManifestBytes, 'input_manifest');
  if (
    prescoreManifest.version !== HISTORICAL_V3_PRESCORE_VERSION ||
    prescoreManifest.status !== 'HISTORICAL_V3_PRESCORE_FREEZE_READY' ||
    prescoreReport.version !== HISTORICAL_V3_PRESCORE_VERSION ||
    prescoreReport.status !== 'HISTORICAL_V3_PRESCORE_FREEZE_READY' ||
    prescoreReport.outcome2024Reads !== 0 ||
    prescoreReport.modelPredictions2024Computed !== false ||
    prescoreReport.marketReads !== 0 ||
    prescoreReport.holdout2025Reads !== 0 ||
    inputManifest.version !== HISTORICAL_V3_PRESCORE_VERSION ||
    inputManifest.status !== 'HISTORICAL_V3_PRESCORE_FREEZE_READY'
  ) {
    throw new Error('prescore_artifact_identity_mismatch');
  }
  const prescoreMap = manifestMap(prescoreManifest);
  const inputManifestSha = verifyManifestedBytes(
    prescoreMap,
    'freeze/input_manifest.json',
    inputManifestBytes
  );
  verifyManifestedBytes(prescoreMap, 'baselines/hfa.json', hfaBytes);
  verifyManifestedBytes(prescoreMap, 'baselines/elo_hfa.json', eloBytes);
  if (
    prescoreManifest.inputManifestSha256 !== inputManifestSha ||
    prescoreReport.inputManifestSha256 !== inputManifestSha
  ) {
    throw new Error('prescore_manifest_hash_mismatch');
  }

  const frozenCandidate = asObject(inputManifest.v3Candidate);
  const frozenPredictive = asObject(inputManifest.v3PredictiveInputs);
  const frozenResolution = asObject(inputManifest.v3Resolution);
  const frozenSnapshot = asObject(inputManifest.frozen2024Snapshot);
  if (
    !frozenCandidate ||
    frozenCandidate.zipSha256 !== args.v3ModelZipSha256 ||
    !frozenPredictive ||
    frozenPredictive.zipSha256 !== args.predictiveZipSha256 ||
    !frozenResolution ||
    frozenResolution.zipSha256 !== args.resolutionZipSha256 ||
    !frozenSnapshot ||
    frozenSnapshot.zipSha256 !== FROZEN_2024_SNAPSHOT.zipSha256
  ) {
    throw new Error('prescore_frozen_source_mismatch');
  }

  const hfaBaseline = parseJson(hfaBytes, 'hfa_baseline') as HistoricalV3BaselineState;
  const eloBaseline = parseJson(eloBytes, 'elo_baseline') as HistoricalV3BaselineState;

  const v3Root = findArchiveRoot(v3ModelZip);
  const v3ManifestBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'manifest.json');
  const candidateBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'candidate/v3_candidate.json');
  const backcompatBytes = readTracked(reads, 'v3model', v3ModelZip, v3Root, 'audit/v1_v3_backcompat.json');
  const v3Manifest = jsonObject(v3ManifestBytes, 'v3_model_manifest');
  if (
    v3Manifest.version !== 'historical_model_v3_backcompat_v1' ||
    v3Manifest.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS'
  ) {
    throw new Error('v3_model_artifact_identity_mismatch');
  }
  const v3Map = manifestMap(v3Manifest);
  const candidateSha = verifyManifestedBytes(v3Map, 'candidate/v3_candidate.json', candidateBytes);
  const backcompatSha = verifyManifestedBytes(v3Map, 'audit/v1_v3_backcompat.json', backcompatBytes);
  if (
    frozenCandidate.memberSha256 !== candidateSha ||
    frozenCandidate.backcompatMemberSha256 !== backcompatSha
  ) {
    throw new Error('v3_model_frozen_hash_mismatch');
  }
  const backcompat = jsonObject(backcompatBytes, 'backcompat');
  if (backcompat.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    throw new Error('v3_confirmation_backcompat_not_pass');
  }
  const candidate = parseJson(candidateBytes, 'candidate') as HistoricalModelV3Candidate;

  const predictiveRoot = findArchiveRoot(predictiveZip);
  const predictiveManifestBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'manifest.json');
  const predictiveRowsBytes = readTracked(reads, 'predictive', predictiveZip, predictiveRoot, 'predictive/v3_game_inputs.json');
  const predictiveManifest = jsonObject(predictiveManifestBytes, 'predictive_manifest');
  if (
    predictiveManifest.version !== 'historical_v3_predictive_inputs_v1' ||
    predictiveManifest.status !== 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT'
  ) {
    throw new Error('predictive_artifact_identity_mismatch');
  }
  const predictiveMap = manifestMap(predictiveManifest);
  const predictiveRowsSha = verifyManifestedBytes(
    predictiveMap,
    'predictive/v3_game_inputs.json',
    predictiveRowsBytes
  );
  if (frozenPredictive.memberSha256 !== predictiveRowsSha) {
    throw new Error('predictive_frozen_hash_mismatch');
  }
  const predictiveRows = jsonArray(
    predictiveRowsBytes,
    'predictive_rows'
  ) as HistoricalV3PredictiveGameInput[];

  const frozenGameIds = Array.isArray(inputManifest.canonicalGameIds)
    ? inputManifest.canonicalGameIds.map(Number)
    : [];
  const predictiveGameIds = predictiveRows.map((row) => row.gameId).sort((a, b) => a - b);
  if (
    frozenGameIds.length !== 752 ||
    predictiveGameIds.length !== 752 ||
    frozenGameIds.some((value, index) => value !== predictiveGameIds[index])
  ) {
    throw new Error('prescore_canonical_game_identity_mismatch');
  }

  const resolutionRoot = findArchiveRoot(resolutionZip);
  const resolutionManifestBytes = readTracked(reads, 'resolution', resolutionZip, resolutionRoot, 'manifest.json');
  const resolutionReportBytes = readTracked(reads, 'resolution', resolutionZip, resolutionRoot, 'report.json');
  const resolutionManifest = jsonObject(resolutionManifestBytes, 'resolution_manifest');
  const resolutionReport = jsonObject(resolutionReportBytes, 'resolution_report');
  if (
    resolutionManifest.version !== 'historical_v3_week_query_resolution_v1' ||
    resolutionManifest.status !== resolutionReport.status ||
    frozenResolution.status !== resolutionReport.status ||
    frozenResolution.manifestSha256 !== sha256Bytes(resolutionManifestBytes) ||
    frozenResolution.reportSha256 !== sha256Bytes(resolutionReportBytes)
  ) {
    throw new Error('resolution_frozen_hash_mismatch');
  }

  // Snapshot metadata can be verified before outcome access.
  const snapshotRoot = findArchiveRoot(snapshotZip);
  const snapshotManifestBytes = readTracked(reads, 'snapshot', snapshotZip, snapshotRoot, 'manifest.json');
  const snapshotReportBytes = readTracked(reads, 'snapshot', snapshotZip, snapshotRoot, 'report.json');
  const snapshotManifest = jsonObject(snapshotManifestBytes, 'snapshot_manifest');
  const snapshotReport = jsonObject(snapshotReportBytes, 'snapshot_report');
  if (
    snapshotManifest.version !== 'historical_research_snapshot_v1' ||
    snapshotManifest.season !== 2024 ||
    snapshotManifest.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha ||
    snapshotManifest.providerCalls !== FROZEN_2024_SNAPSHOT.providerCalls ||
    snapshotReport.version !== 'historical_research_snapshot_v1' ||
    snapshotReport.season !== 2024 ||
    snapshotReport.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha
  ) {
    throw new Error('snapshot_identity_mismatch');
  }
  const snapshotMap = manifestMap(snapshotManifest);
  verifyManifestedBytes(snapshotMap, 'report.json', snapshotReportBytes);

  // Reserved evidence opens only after all frozen input/hash checks above succeed.
  const gamesMember = findSnapshotGamesMember(snapshotReport);
  const gamesBytes = readTracked(reads, 'snapshot-outcome', snapshotZip, snapshotRoot, gamesMember);
  verifyManifestedBytes(snapshotMap, gamesMember, gamesBytes);
  const outcomes = buildOutcomes(jsonArray(gamesBytes, 'snapshot_games_outcomes'));

  const result = scoreHistoricalV3Confirmation({
    candidate,
    predictiveRows,
    outcomes,
    hfaBaseline,
    eloHfaBaseline: eloBaseline,
    frozenInputIntegrity: true,
    marketReads: 0,
    holdout2025Reads: 0,
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const artifacts: ArtifactDigest[] = [];
  artifacts.push(writeJsonExclusive(outputDir, 'predictions/2024_predictions.json', result.predictionRows));
  artifacts.push(writeJsonExclusive(outputDir, 'metrics/confirmation_metrics.json', {
    v3: result.v3Metrics,
    eloHfa: result.eloHfaMetrics,
    hfa: result.hfaMetrics,
    gateChecks: result.gateChecks,
    inputBlockers: result.inputBlockers,
  }));

  const repoSha = repoCommitSha();
  const provenance = {
    version: HISTORICAL_V3_CONFIRMATION_VERSION,
    scorerRepoSha: repoSha,
    prescoreZipSha256: args.prescoreZipSha256,
    inputManifestSha256: inputManifestSha,
    v3ModelZipSha256: args.v3ModelZipSha256,
    predictiveZipSha256: args.predictiveZipSha256,
    resolutionZipSha256: args.resolutionZipSha256,
    snapshotZipSha256: FROZEN_2024_SNAPSHOT.zipSha256,
    outcomeMember: gamesMember,
    outcomeMemberSha256: sha256Bytes(gamesBytes),
    sourceMemberReadLedger: reads,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'source_provenance.json', provenance));

  const report = {
    version: HISTORICAL_V3_CONFIRMATION_VERSION,
    mode: 'ONE_SHOT_2024_SOURCE_INFORMED_CONFIRMATION',
    scorerRepoSha: repoSha,
    status: result.status,
    inputBlockers: result.inputBlockers,
    predictionCount: result.predictionRows.length,
    metrics: {
      v3: result.v3Metrics,
      eloHfa: result.eloHfaMetrics,
      hfa: result.hfaMetrics,
    },
    gateChecks: result.gateChecks,
    providerCalls: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    marketReads: 0,
    ppaSidecarReads: 0,
    portalReads: 0,
    outcome2024Reads: 1,
    holdout2025Reads: 0,
    frozenInputIntegrity: true,
    inputManifestSha256: inputManifestSha,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((a, b) => a.file.localeCompare(b.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_V3_CONFIRMATION_VERSION,
    scorerRepoSha: repoSha,
    status: result.status,
    inputManifestSha256: inputManifestSha,
    artifacts,
  });

  console.log(JSON.stringify({
    status: result.status,
    predictionCount: result.predictionRows.length,
    v3Metrics: result.v3Metrics,
    eloHfaMetrics: result.eloHfaMetrics,
    hfaMetrics: result.hfaMetrics,
    providerCalls: 0,
    marketReads: 0,
    outcome2024Reads: 1,
    holdout2025Reads: 0,
    databaseReads: false,
    databaseWrites: false,
  }, null, 2));

  if (result.status === 'HISTORICAL_V3_CONFIRMATION_INPUT_BLOCKED') {
    process.exitCode = 2;
  }
}

try {
  main();
} catch (error) {
  console.error('[historical-v3-confirmation] ' + sanitizeError(error));
  process.exit(1);
}
