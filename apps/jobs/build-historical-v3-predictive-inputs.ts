#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildHistoricalV3PredictiveInputs,
  HISTORICAL_V3_PREDICTIVE_INPUT_VERSION,
} from './src/research/historical-v3-predictive-inputs';
import type { HistoricalModelV3Candidate } from './src/research/historical-model-v3';

const CONFIRMATION = 'BUILD_2024_HISTORICAL_V3_PREDICTIVE_INPUTS';

const FROZEN_2024_SNAPSHOT = {
  runId: 36508377627,
  artifactId: 11008470975,
  artifactName: 'historical-research-snapshot-v1-2024-36508377627',
  zipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  sourceRepoSha: 'e1b27f6c5681f6ab4f8d24e50f88e387c64657a7',
  providerCalls: 28,
} as const;

const V3_MODEL_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  candidate: 'candidate/v3_candidate.json',
  backcompat: 'audit/v1_v3_backcompat.json',
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  snapshotZip: string;
  v3ModelZip: string;
  v3ModelZipSha256: string;
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

  const snapshotZip = values.get('--snapshot-zip') ?? '';
  const v3ModelZip = values.get('--v3-model-zip') ?? '';
  const v3ModelZipSha256 = (
    values.get('--v3-model-zip-sha256') ?? ''
  ).toLowerCase();
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!snapshotZip) throw new Error('snapshot_zip_required');
  if (!v3ModelZip) throw new Error('v3_model_zip_required');
  if (!/^[0-9a-f]{64}$/.test(v3ModelZipSha256)) {
    throw new Error('v3_model_zip_sha256_required');
  }
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return {
    snapshotZip,
    v3ModelZip,
    v3ModelZipSha256,
    outputDir,
    confirm,
  };
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
  const fullMember = rootDir ? `${rootDir}/${member}` : member;
  try {
    return execFileSync('unzip', ['-p', zipPath, fullMember], {
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
    !/^[0-9a-f]{64}$/.test(expectedSha) ||
    bytes.length !== expectedBytes ||
    sha256Bytes(bytes) !== expectedSha
  ) {
    throw new Error(`manifest_member_mismatch:${member}`);
  }
  return expectedSha;
}

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_v3_predictive_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_v3_predictive_artifact_path');
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

function requireNoMutationExecution(report: JsonObject): void {
  const execution = asObject(report.execution);
  if (!execution) throw new Error('snapshot_execution_metadata_missing');
  for (const key of [
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
  ]) {
    if (execution[key] !== false) {
      throw new Error(`snapshot_execution_boundary_failed:${key}`);
    }
  }
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const exact = new Set([
    'invalid_confirmation',
    'snapshot_zip_required',
    'v3_model_zip_required',
    'v3_model_zip_sha256_required',
    'output_dir_required',
    'snapshot_zip_missing',
    'snapshot_zip_hash_mismatch',
    'v3_model_zip_missing',
    'v3_model_zip_hash_mismatch',
    'output_dir_already_exists',
    'invalid_git_head_sha',
    'archive_list_failed',
    'archive_root_ambiguous',
  ]);
  if (exact.has(message)) return message;
  for (const prefix of [
    'archive_',
    'manifest_',
    'snapshot_',
    'v3_model_',
    'v3_predictive_',
    'duplicate_',
    'invalid_',
    'json_',
  ]) {
    if (message.startsWith(prefix)) return message.replace(/:.*/, '');
  }
  return 'historical_v3_predictive_input_build_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const snapshotZip = path.resolve(args.snapshotZip);
  const v3ModelZip = path.resolve(args.v3ModelZip);
  const outputDir = path.resolve(args.outputDir);

  assertFile(
    snapshotZip,
    FROZEN_2024_SNAPSHOT.zipSha256,
    'snapshot_zip_missing',
    'snapshot_zip_hash_mismatch'
  );
  assertFile(
    v3ModelZip,
    args.v3ModelZipSha256,
    'v3_model_zip_missing',
    'v3_model_zip_hash_mismatch'
  );

  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');

  const snapshotRoot = findArchiveRoot(snapshotZip);
  const snapshotManifestBytes = archiveRead(
    snapshotZip,
    snapshotRoot,
    'manifest.json'
  );
  const snapshotReportBytes = archiveRead(
    snapshotZip,
    snapshotRoot,
    'report.json'
  );
  const snapshotManifest = jsonObject(snapshotManifestBytes, 'snapshot_manifest');
  const snapshotReport = jsonObject(snapshotReportBytes, 'snapshot_report');

  if (
    snapshotManifest.version !== 'historical_research_snapshot_v1' ||
    snapshotManifest.season !== 2024 ||
    snapshotManifest.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha ||
    snapshotManifest.providerCalls !== FROZEN_2024_SNAPSHOT.providerCalls
  ) {
    throw new Error('snapshot_manifest_identity_mismatch');
  }
  if (
    snapshotReport.version !== 'historical_research_snapshot_v1' ||
    snapshotReport.mode !== 'RESEARCH_PREVIEW_ARTIFACT_ONLY' ||
    snapshotReport.season !== 2024 ||
    snapshotReport.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha
  ) {
    throw new Error('snapshot_report_identity_mismatch');
  }
  requireNoMutationExecution(snapshotReport);

  const provider = asObject(snapshotReport.provider);
  const calls = provider?.calls;
  if (
    !provider ||
    provider.name !== 'CFBD' ||
    provider.callsAttempted !== FROZEN_2024_SNAPSHOT.providerCalls ||
    provider.callsSucceeded !== FROZEN_2024_SNAPSHOT.providerCalls ||
    !Array.isArray(calls)
  ) {
    throw new Error('snapshot_provider_accounting_mismatch');
  }

  const callById = new Map<string, JsonObject>();
  for (const raw of calls) {
    const call = asObject(raw);
    const requestId =
      call && typeof call.requestId === 'string' ? call.requestId : '';
    if (!call || !requestId || callById.has(requestId)) {
      throw new Error('snapshot_call_identity_invalid');
    }
    if (call.ok !== true || call.httpStatus !== 200) {
      throw new Error(`snapshot_call_not_successful:${requestId}`);
    }
    callById.set(requestId, call);
  }

  const snapshotReads: Record<string, number> = {};
  const readRequestRows = (requestId: string): unknown[] => {
    const allowed =
      requestId === 'games' ||
      requestId === 'advanced-game-stats' ||
      requestId === 'talent' ||
      requestId === 'returning-production' ||
      requestId === 'elo-preseason' ||
      /^recruiting-teams-202[1-4]$/.test(requestId) ||
      /^elo-week-\d{2}$/.test(requestId);
    if (!allowed) {
      throw new Error(`snapshot_forbidden_request_read:${requestId}`);
    }

    const call = callById.get(requestId);
    const rawFile = call && typeof call.rawFile === 'string' ? call.rawFile : '';
    if (!rawFile) throw new Error(`snapshot_request_missing:${requestId}`);
    snapshotReads[requestId] = (snapshotReads[requestId] ?? 0) + 1;
    return jsonArray(
      archiveRead(snapshotZip, snapshotRoot, rawFile),
      `snapshot:${requestId}`
    );
  };

  const games = readRequestRows('games');
  const advancedBulkRows = readRequestRows('advanced-game-stats');
  const talentRows = readRequestRows('talent');
  const returningProductionRows = readRequestRows('returning-production');
  const recruitingByYear: Record<number, unknown[]> = {};
  for (const year of [2021, 2022, 2023, 2024]) {
    recruitingByYear[year] = readRequestRows(`recruiting-teams-${year}`);
  }
  const eloPreseasonRows = readRequestRows('elo-preseason');
  const eloByWeek: Record<number, unknown[]> = {};
  for (const requestId of callById.keys()) {
    const match = /^elo-week-(\d{2})$/.exec(requestId);
    if (!match) continue;
    eloByWeek[Number(match[1])] = readRequestRows(requestId);
  }

  for (const forbidden of ['lines', 'ppa-games', 'transfer-portal']) {
    if ((snapshotReads[forbidden] ?? 0) !== 0) {
      throw new Error(`snapshot_forbidden_request_opened:${forbidden}`);
    }
  }

  const v3Root = findArchiveRoot(v3ModelZip);
  const modelReads: Record<string, number> = {};
  const readModel = (member: string): Buffer => {
    const allowed = new Set(Object.values(V3_MODEL_PATHS));
    if (!allowed.has(member as never)) {
      throw new Error(`v3_model_forbidden_member_read:${member}`);
    }
    modelReads[member] = (modelReads[member] ?? 0) + 1;
    return archiveRead(v3ModelZip, v3Root, member);
  };

  const v3ManifestBytes = readModel(V3_MODEL_PATHS.manifest);
  const v3ReportBytes = readModel(V3_MODEL_PATHS.report);
  const v3ProvenanceBytes = readModel(V3_MODEL_PATHS.provenance);
  const candidateBytes = readModel(V3_MODEL_PATHS.candidate);
  const backcompatBytes = readModel(V3_MODEL_PATHS.backcompat);

  const v3Manifest = jsonObject(v3ManifestBytes, 'v3_model_manifest');
  const v3Report = jsonObject(v3ReportBytes, 'v3_model_report');
  const v3Provenance = jsonObject(v3ProvenanceBytes, 'v3_model_provenance');
  if (
    v3Manifest.version !== 'historical_model_v3_backcompat_v1' ||
    v3Manifest.modelDefinitionId !== 'historical_ridge_margin_v3' ||
    v3Manifest.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Report.version !== 'historical_model_v3_backcompat_v1' ||
    v3Report.modelDefinitionId !== 'historical_ridge_margin_v3' ||
    v3Report.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Report.providerCalls !== 0 ||
    v3Report.marketReads !== 0 ||
    v3Report.validation2024Reads !== 0 ||
    v3Report.holdout2025Reads !== 0 ||
    v3Report.databaseReads !== false ||
    v3Report.databaseWrites !== false ||
    v3Report.prismaInvoked !== false ||
    v3Provenance.version !== 'historical_model_v3_backcompat_v1'
  ) {
    throw new Error('v3_model_artifact_identity_mismatch');
  }

  const modelManifest = manifestMap(v3Manifest);
  const candidateSha = verifyManifestedBytes(
    modelManifest,
    V3_MODEL_PATHS.candidate,
    candidateBytes
  );
  const backcompatSha = verifyManifestedBytes(
    modelManifest,
    V3_MODEL_PATHS.backcompat,
    backcompatBytes
  );
  const backcompat = jsonObject(backcompatBytes, 'v3_backcompat');
  if (
    backcompat.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    !asObject(backcompat.gateChecks) ||
    Object.values(asObject(backcompat.gateChecks)!).some(
      (value) => value !== true
    )
  ) {
    throw new Error('v3_model_backcompat_gate_invalid');
  }

  const candidate = parseJson(
    candidateBytes,
    V3_MODEL_PATHS.candidate
  ) as HistoricalModelV3Candidate;

  const built = buildHistoricalV3PredictiveInputs({
    games,
    advancedBulkRows,
    recoveryAdvancedRows: [],
    talentRows,
    returningProductionRows,
    recruitingByYear,
    eloPreseasonRows,
    eloByWeek,
    candidate,
    backcompatStatus: 'HISTORICAL_V3_BACKCOMPAT_PASS',
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const artifacts: ArtifactDigest[] = [];
  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'predictive/v3_game_inputs.json',
      built.rows
    )
  );
  artifacts.push(
    writeJsonExclusive(outputDir, 'audit/source_gap_report.json', built.qa)
  );

  const builderRepoSha = repoCommitSha();
  const provenance = {
    version: HISTORICAL_V3_PREDICTIVE_INPUT_VERSION,
    builderRepoSha,
    frozen2024Snapshot: {
      ...FROZEN_2024_SNAPSHOT,
      manifestSha256: sha256Bytes(snapshotManifestBytes),
      reportSha256: sha256Bytes(snapshotReportBytes),
    },
    v3ModelArtifact: {
      zipSha256: args.v3ModelZipSha256,
      candidateMember: V3_MODEL_PATHS.candidate,
      candidateMemberSha256: candidateSha,
      backcompatMember: V3_MODEL_PATHS.backcompat,
      backcompatMemberSha256: backcompatSha,
      manifestSha256: sha256Bytes(v3ManifestBytes),
      reportSha256: sha256Bytes(v3ReportBytes),
      provenanceSha256: sha256Bytes(v3ProvenanceBytes),
    },
    recoveryArtifactUsed: false,
    recoveryRowsUsed: 0,
  };
  artifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', provenance)
  );

  const report = {
    version: HISTORICAL_V3_PREDICTIVE_INPUT_VERSION,
    mode: 'ARTIFACT_ONLY_OFFLINE_2024_V3_PREDICTIVE_INPUT_BUILD',
    builderRepoSha,
    status: 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT',
    season: 2024,
    canonicalGames: built.qa.canonicalGames,
    canonicalTeams: built.qa.canonicalTeams,
    teamSides: built.qa.teamSides,
    providerCalls: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    marketReads: 0,
    ppaSidecarReads: 0,
    portalReads: 0,
    outcomeFieldsUsed: false,
    outcomeScoringReads: 0,
    modelPredictionsComputed: false,
    holdout2025Reads: 0,
    recoveryArtifactUsed: false,
    recoveryRowsUsed: 0,
    snapshotReads,
    modelReads,
    qa: built.qa,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((left, right) => left.file.localeCompare(right.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_V3_PREDICTIVE_INPUT_VERSION,
    builderRepoSha,
    status: 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT',
    season: 2024,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        status: 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT',
        canonicalGames: built.qa.canonicalGames,
        canonicalTeams: built.qa.canonicalTeams,
        teamSides: built.qa.teamSides,
        sourceGapFormSides: built.qa.sourceGapFormSides,
        naturalNoPriorFormSides: built.qa.naturalNoPriorFormSides,
        recoveryArtifactUsed: false,
        providerCalls: 0,
        marketReads: 0,
        ppaSidecarReads: 0,
        portalReads: 0,
        outcomeFieldsUsed: false,
        modelPredictionsComputed: false,
        holdout2025Reads: 0,
        databaseReads: false,
        databaseWrites: false,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error('[historical-v3-predictive] ' + sanitizeError(error));
  process.exit(1);
}
