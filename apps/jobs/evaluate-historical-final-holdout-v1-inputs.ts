#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateHistoricalFinalHoldoutRequiredInputs,
  HISTORICAL_FINAL_HOLDOUT_V1_VERSION,
} from './src/research/historical-final-holdout-v1-preflight';
import type { HistoricalModelV3Candidate } from './src/research/historical-model-v3';

const CONFIRMATION =
  'EVALUATE_2025_HISTORICAL_FINAL_HOLDOUT_REQUIRED_INPUTS';

const FROZEN_2025_SNAPSHOT = {
  runId: 36433016296,
  artifactId: 10973848747,
  artifactName: 'historical-research-snapshot-v1-2025-36433016296',
  zipSha256:
    'fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22',
  sourceRepoSha: 'f17b6876ddc8d660ce6b5572ef8742f4e7f9cea7',
  providerCalls: 28,
} as const;

const FROZEN_V3 = {
  zipSha256:
    'dfa1bb276d6aa353bbf89db800c9185487f4b77b21f4b5b98d819d69b0ae1257',
  candidateMember: 'candidate/v3_candidate.json',
  candidateMemberSha256:
    'bae9d7962bfdbe6c268a627ba2e9be396c48f586f5c7b45d550c5a1bde3632fb',
  backcompatMember: 'audit/v1_v3_backcompat.json',
  backcompatMemberSha256:
    '8bb6b51af4fe67b168c5d0808c9a01c6f2289e61649f60ea64373265bb78d8e7',
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
    throw new Error('unsafe_final_holdout_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_final_holdout_artifact_path');
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

function historicalSnapshotBoundary(report: JsonObject): {
  prismaGenerateInvoked: boolean | null;
} {
  const execution = asObject(report.execution);
  if (!execution) throw new Error('snapshot_execution_metadata_missing');

  for (const key of [
    'databaseReads',
    'databaseWrites',
    'prismaClientInstantiated',
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

  return {
    prismaGenerateInvoked:
      typeof execution.prismaGenerateInvoked === 'boolean'
        ? execution.prismaGenerateInvoked
        : null,
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const prefix of [
    'archive_',
    'manifest_',
    'snapshot_',
    'v3_model_',
    'final_holdout_',
    'invalid_',
    'json_',
    'unsafe_',
  ]) {
    if (message.startsWith(prefix)) return message.replace(/:.*/, '');
  }
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
  ]);
  if (exact.has(message)) return message;
  return 'historical_final_holdout_v1_preflight_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const snapshotZip = path.resolve(args.snapshotZip);
  const v3ModelZip = path.resolve(args.v3ModelZip);
  const outputDir = path.resolve(args.outputDir);

  assertFile(
    snapshotZip,
    FROZEN_2025_SNAPSHOT.zipSha256,
    'snapshot_zip_missing',
    'snapshot_zip_hash_mismatch'
  );
  assertFile(
    v3ModelZip,
    args.v3ModelZipSha256,
    'v3_model_zip_missing',
    'v3_model_zip_hash_mismatch'
  );
  if (args.v3ModelZipSha256 !== FROZEN_V3.zipSha256) {
    throw new Error('v3_model_zip_contract_mismatch');
  }
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
  const snapshotManifest = jsonObject(
    snapshotManifestBytes,
    'snapshot_manifest'
  );
  const snapshotReport = jsonObject(snapshotReportBytes, 'snapshot_report');

  if (
    snapshotManifest.version !== 'historical_research_snapshot_v1' ||
    snapshotManifest.season !== 2025 ||
    snapshotManifest.repoCommitSha !== FROZEN_2025_SNAPSHOT.sourceRepoSha ||
    snapshotManifest.providerCalls !== FROZEN_2025_SNAPSHOT.providerCalls
  ) {
    throw new Error('snapshot_manifest_identity_mismatch');
  }
  if (
    snapshotReport.version !== 'historical_research_snapshot_v1' ||
    snapshotReport.mode !== 'RESEARCH_PREVIEW_ARTIFACT_ONLY' ||
    snapshotReport.season !== 2025 ||
    snapshotReport.repoCommitSha !== FROZEN_2025_SNAPSHOT.sourceRepoSha
  ) {
    throw new Error('snapshot_report_identity_mismatch');
  }
  const historicalBoundary = historicalSnapshotBoundary(snapshotReport);

  const provider = asObject(snapshotReport.provider);
  const calls = provider?.calls;
  if (
    !provider ||
    provider.name !== 'CFBD' ||
    provider.callsAttempted !== FROZEN_2025_SNAPSHOT.providerCalls ||
    provider.callsSucceeded !== FROZEN_2025_SNAPSHOT.providerCalls ||
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

  const snapshotMap = manifestMap(snapshotManifest);
  verifyManifestedBytes(snapshotMap, 'report.json', snapshotReportBytes);

  const snapshotReads: Record<string, number> = {};
  const readRequestRows = (requestId: string): unknown[] => {
    const allowed =
      requestId === 'games' ||
      requestId === 'talent' ||
      requestId === 'elo-preseason' ||
      /^elo-week-\d{2}$/.test(requestId);
    if (!allowed) {
      throw new Error(`snapshot_forbidden_request_read:${requestId}`);
    }
    const call = callById.get(requestId);
    const rawFile = call && typeof call.rawFile === 'string' ? call.rawFile : '';
    if (!rawFile) throw new Error(`snapshot_request_missing:${requestId}`);
    const bytes = archiveRead(snapshotZip, snapshotRoot, rawFile);
    verifyManifestedBytes(snapshotMap, rawFile, bytes);
    snapshotReads[requestId] = (snapshotReads[requestId] ?? 0) + 1;
    return jsonArray(bytes, `snapshot:${requestId}`);
  };

  const games = readRequestRows('games');
  const talentRows = readRequestRows('talent');
  const eloPreseasonRows = readRequestRows('elo-preseason');
  const eloByWeek: Record<number, unknown[]> = {};
  for (const requestId of callById.keys()) {
    const match = /^elo-week-(\d{2})$/.exec(requestId);
    if (!match) continue;
    eloByWeek[Number(match[1])] = readRequestRows(requestId);
  }

  for (const forbidden of [
    'lines',
    'ppa-games',
    'advanced-game-stats',
    'returning-production',
    'transfer-portal',
    'recruiting-teams-2022',
    'recruiting-teams-2023',
    'recruiting-teams-2024',
    'recruiting-teams-2025',
  ]) {
    if ((snapshotReads[forbidden] ?? 0) !== 0) {
      throw new Error(`snapshot_forbidden_request_opened:${forbidden}`);
    }
  }

  const v3Root = findArchiveRoot(v3ModelZip);
  const v3ManifestBytes = archiveRead(v3ModelZip, v3Root, 'manifest.json');
  const candidateBytes = archiveRead(
    v3ModelZip,
    v3Root,
    FROZEN_V3.candidateMember
  );
  const backcompatBytes = archiveRead(
    v3ModelZip,
    v3Root,
    FROZEN_V3.backcompatMember
  );
  const v3Manifest = jsonObject(v3ManifestBytes, 'v3_model_manifest');
  if (
    v3Manifest.version !== 'historical_model_v3_backcompat_v1' ||
    v3Manifest.modelDefinitionId !== 'historical_ridge_margin_v3' ||
    v3Manifest.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS'
  ) {
    throw new Error('v3_model_artifact_identity_mismatch');
  }
  const v3Map = manifestMap(v3Manifest);
  const candidateSha = verifyManifestedBytes(
    v3Map,
    FROZEN_V3.candidateMember,
    candidateBytes
  );
  const backcompatSha = verifyManifestedBytes(
    v3Map,
    FROZEN_V3.backcompatMember,
    backcompatBytes
  );
  if (
    candidateSha !== FROZEN_V3.candidateMemberSha256 ||
    backcompatSha !== FROZEN_V3.backcompatMemberSha256
  ) {
    throw new Error('v3_model_member_contract_mismatch');
  }

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
    FROZEN_V3.candidateMember
  ) as HistoricalModelV3Candidate;

  const result = evaluateHistoricalFinalHoldoutRequiredInputs({
    games,
    talentRows,
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
      'audit/required_input_preflight.json',
      result
    )
  );

  const builderRepoSha = repoCommitSha();
  const provenance = {
    version: HISTORICAL_FINAL_HOLDOUT_V1_VERSION,
    builderRepoSha,
    frozen2025Snapshot: {
      ...FROZEN_2025_SNAPSHOT,
      manifestSha256: sha256Bytes(snapshotManifestBytes),
      reportSha256: sha256Bytes(snapshotReportBytes),
      historicalCapturePrismaGenerateInvoked:
        historicalBoundary.prismaGenerateInvoked,
    },
    frozenV3: {
      ...FROZEN_V3,
      manifestSha256: sha256Bytes(v3ManifestBytes),
    },
    snapshotReads,
  };
  artifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', provenance)
  );

  const report = {
    version: HISTORICAL_FINAL_HOLDOUT_V1_VERSION,
    mode: 'ARTIFACT_ONLY_2025_FINAL_HOLDOUT_REQUIRED_INPUT_PREFLIGHT',
    builderRepoSha,
    status: result.status,
    season: 2025,
    canonicalGames: result.canonicalGames,
    canonicalTeams: result.canonicalTeams,
    teamSides: result.teamSides,
    blockerCount: result.blockers.length,
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
    snapshotReads,
    requiredInputQa: result,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((a, b) => a.file.localeCompare(b.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_FINAL_HOLDOUT_V1_VERSION,
    builderRepoSha,
    status: result.status,
    season: 2025,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        status: result.status,
        canonicalGames: result.canonicalGames,
        canonicalTeams: result.canonicalTeams,
        teamSides: result.teamSides,
        blockers: result.blockers,
        missingTalentTeams: result.missingTalentTeams,
        missingTalentSides: result.missingTalentSides,
        missingEloSides: result.missingEloSides,
        providerCalls: 0,
        marketReads: 0,
        ppaSidecarReads: 0,
        portalReads: 0,
        outcomeFieldsUsed: false,
        modelPredictionsComputed: false,
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
  console.error(
    '[historical-final-holdout-v1-preflight] ' + sanitizeError(error)
  );
  process.exit(1);
}
