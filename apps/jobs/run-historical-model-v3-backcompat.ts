#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  type FinalCandidateState,
  type HistoricalModelDevelopmentInput,
} from './src/research/historical-model-development-v1';
import {
  HISTORICAL_MODEL_V3_DEFINITION_ID,
  auditHistoricalModelV3Backcompat,
  fitHistoricalModelV3,
} from './src/research/historical-model-v3';

const CONFIRMATION = 'BUILD_HISTORICAL_MODEL_V3_BACKCOMPAT';

const FROZEN_FEATURE = {
  runId: 36489184409,
  artifactId: 11000651389,
  artifactName: 'historical-feature-v1-36489184409',
  zipSha256:
    '047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2',
  builderRepoSha: '743738eea6dfd0852cf28c5941aa998be300b0c9',
} as const;

const FROZEN_CORPUS = {
  runId: 36479515332,
  artifactId: 10997010171,
  artifactName: 'historical-development-corpus-v1-36479515332',
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  builderRepoSha: '3d553b0925f55321d53c3048544aa16a047e41c8',
} as const;

const FROZEN_V1_MODEL = {
  runId: 36494166168,
  artifactId: 11002393824,
  artifactName: 'historical-model-development-v1-36494166168',
  zipSha256:
    'bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313',
  builderRepoSha: 'ed57d43ebbfd7b2fdbd68237ec7f41a3832d168f',
  candidateMember: 'candidate/final_candidate.json',
  candidateSha256:
    '8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53',
} as const;

const FEATURE_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  features: 'features/game_features.json',
} as const;

const CORPUS_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  outcomes: 'outcomes/outcomes.json',
} as const;

const V1_MODEL_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  candidate: FROZEN_V1_MODEL.candidateMember,
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  featureZip: string;
  corpusZip: string;
  v1ModelZip: string;
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
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++i];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const featureZip = values.get('--feature-zip') ?? '';
  const corpusZip = values.get('--corpus-zip') ?? '';
  const v1ModelZip = values.get('--v1-model-zip') ?? '';
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!featureZip) throw new Error('feature_zip_required');
  if (!corpusZip) throw new Error('corpus_zip_required');
  if (!v1ModelZip) throw new Error('v1_model_zip_required');
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return { featureZip, corpusZip, v1ModelZip, outputDir, confirm };
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
      maxBuffer: 128 * 1024 * 1024,
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

function manifestMap(
  manifest: JsonObject,
  expectedCount: number
): Map<string, JsonObject> {
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== expectedCount) {
    throw new Error('manifest_artifact_count_mismatch');
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
  const sha = typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';

  if (
    expectedBytes === null ||
    !/^[0-9a-f]{64}$/.test(sha) ||
    expectedBytes !== bytes.length ||
    sha256Bytes(bytes) !== sha
  ) {
    throw new Error(`manifest_member_mismatch:${member}`);
  }

  return sha;
}

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_v3_model_artifact_path');
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_v3_model_artifact_path');
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

function assertZip(
  filePath: string,
  expectedSha: string,
  missingCode: string,
  hashCode: string
): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(missingCode);
  }
  if (sha256File(filePath) !== expectedSha) {
    throw new Error(hashCode);
  }
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const exact = new Set([
    'invalid_confirmation',
    'feature_zip_required',
    'corpus_zip_required',
    'v1_model_zip_required',
    'output_dir_required',
    'feature_zip_missing',
    'corpus_zip_missing',
    'v1_model_zip_missing',
    'feature_zip_hash_mismatch',
    'corpus_zip_hash_mismatch',
    'v1_model_zip_hash_mismatch',
    'output_dir_already_exists',
    'invalid_git_head_sha',
    'archive_list_failed',
    'archive_root_ambiguous',
  ]);
  if (exact.has(message)) return message;

  for (const prefix of [
    'archive_',
    'manifest_',
    'feature_',
    'corpus_',
    'v1_model_',
    'candidate_',
    'v3_',
    'development_',
    'outcome_',
    'unexpected_',
    'dynamic_',
  ]) {
    if (message.startsWith(prefix)) return message.replace(/:.*/, '');
  }

  return 'historical_v3_model_backcompat_failed';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const featureZip = path.resolve(args.featureZip);
  const corpusZip = path.resolve(args.corpusZip);
  const v1ModelZip = path.resolve(args.v1ModelZip);
  const outputDir = path.resolve(args.outputDir);

  assertZip(
    featureZip,
    FROZEN_FEATURE.zipSha256,
    'feature_zip_missing',
    'feature_zip_hash_mismatch'
  );
  assertZip(
    corpusZip,
    FROZEN_CORPUS.zipSha256,
    'corpus_zip_missing',
    'corpus_zip_hash_mismatch'
  );
  assertZip(
    v1ModelZip,
    FROZEN_V1_MODEL.zipSha256,
    'v1_model_zip_missing',
    'v1_model_zip_hash_mismatch'
  );

  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceReads: Record<string, number> = {};
  const countRead = (key: string) => {
    sourceReads[key] = (sourceReads[key] ?? 0) + 1;
  };

  const featureRoot = findArchiveRoot(featureZip);
  const featureRead = (member: string): Buffer => {
    const allowed = new Set(Object.values(FEATURE_PATHS));
    if (!allowed.has(member as never)) {
      throw new Error(`feature_forbidden_member_read:${member}`);
    }
    countRead(`feature:${member}`);
    return archiveRead(featureZip, featureRoot, member);
  };

  const featureManifestBytes = featureRead(FEATURE_PATHS.manifest);
  const featureReportBytes = featureRead(FEATURE_PATHS.report);
  const featureProvenanceBytes = featureRead(FEATURE_PATHS.provenance);
  const featureRowsBytes = featureRead(FEATURE_PATHS.features);

  const featureManifest = jsonObject(featureManifestBytes, FEATURE_PATHS.manifest);
  const featureReport = jsonObject(featureReportBytes, FEATURE_PATHS.report);
  const featureProvenance = jsonObject(
    featureProvenanceBytes,
    FEATURE_PATHS.provenance
  );

  if (
    featureManifest.version !== 'historical_feature_v1' ||
    featureManifest.builderRepoSha !== FROZEN_FEATURE.builderRepoSha ||
    featureReport.version !== 'historical_feature_v1' ||
    featureReport.qaPass !== true ||
    featureReport.modelFittingInvoked !== false ||
    featureProvenance.version !== 'historical_feature_v1'
  ) {
    throw new Error('feature_artifact_identity_mismatch');
  }

  const featureArtifacts = manifestMap(featureManifest, 3);
  const featureMemberSha = verifyManifestedBytes(
    featureArtifacts,
    FEATURE_PATHS.features,
    featureRowsBytes
  );

  const corpusRoot = findArchiveRoot(corpusZip);
  const corpusRead = (member: string): Buffer => {
    const allowed = new Set(Object.values(CORPUS_PATHS));
    if (!allowed.has(member as never)) {
      throw new Error(`corpus_forbidden_member_read:${member}`);
    }
    countRead(`corpus:${member}`);
    return archiveRead(corpusZip, corpusRoot, member);
  };

  const corpusManifestBytes = corpusRead(CORPUS_PATHS.manifest);
  const corpusReportBytes = corpusRead(CORPUS_PATHS.report);
  const corpusProvenanceBytes = corpusRead(CORPUS_PATHS.provenance);
  const outcomeBytes = corpusRead(CORPUS_PATHS.outcomes);

  const corpusManifest = jsonObject(corpusManifestBytes, CORPUS_PATHS.manifest);
  const corpusReport = jsonObject(corpusReportBytes, CORPUS_PATHS.report);
  const corpusProvenance = jsonObject(
    corpusProvenanceBytes,
    CORPUS_PATHS.provenance
  );

  if (
    corpusManifest.version !== 'historical_development_corpus_v1' ||
    corpusManifest.builderRepoSha !== FROZEN_CORPUS.builderRepoSha ||
    corpusReport.version !== 'historical_development_corpus_v1' ||
    corpusReport.qaPass !== true ||
    corpusProvenance.version !== 'historical_development_corpus_v1'
  ) {
    throw new Error('corpus_artifact_identity_mismatch');
  }

  const corpusArtifacts = manifestMap(corpusManifest, 11);
  const outcomeMemberSha = verifyManifestedBytes(
    corpusArtifacts,
    CORPUS_PATHS.outcomes,
    outcomeBytes
  );

  const v1Root = findArchiveRoot(v1ModelZip);
  const v1Read = (member: string): Buffer => {
    const allowed = new Set(Object.values(V1_MODEL_PATHS));
    if (!allowed.has(member as never)) {
      throw new Error(`v1_model_forbidden_member_read:${member}`);
    }
    countRead(`v1model:${member}`);
    return archiveRead(v1ModelZip, v1Root, member);
  };

  const v1ManifestBytes = v1Read(V1_MODEL_PATHS.manifest);
  const v1ReportBytes = v1Read(V1_MODEL_PATHS.report);
  const v1ProvenanceBytes = v1Read(V1_MODEL_PATHS.provenance);
  const v1CandidateBytes = v1Read(V1_MODEL_PATHS.candidate);

  const v1Manifest = jsonObject(v1ManifestBytes, V1_MODEL_PATHS.manifest);
  const v1Report = jsonObject(v1ReportBytes, V1_MODEL_PATHS.report);
  const v1Provenance = jsonObject(v1ProvenanceBytes, V1_MODEL_PATHS.provenance);

  if (
    v1Manifest.protocolId !== 'historical_model_development_tuning_protocol_v1' ||
    v1Manifest.modelDefinitionId !== 'historical_ridge_margin_v1' ||
    v1Manifest.builderRepoSha !== FROZEN_V1_MODEL.builderRepoSha ||
    v1Report.protocolId !== 'historical_model_development_tuning_protocol_v1' ||
    v1Report.modelDefinitionId !== 'historical_ridge_margin_v1' ||
    v1Report.confirmationStatus !== 'DEVELOPMENT_CONFIRMATION_PASS' ||
    v1Report.finalCandidateEmitted !== true ||
    v1Provenance.protocolId !==
      'historical_model_development_tuning_protocol_v1'
  ) {
    throw new Error('v1_model_artifact_identity_mismatch');
  }

  const v1Artifacts = manifestMap(v1Manifest, 8);
  const v1CandidateSha = verifyManifestedBytes(
    v1Artifacts,
    V1_MODEL_PATHS.candidate,
    v1CandidateBytes
  );
  if (v1CandidateSha !== FROZEN_V1_MODEL.candidateSha256) {
    throw new Error('v1_model_candidate_hash_mismatch');
  }

  const input: HistoricalModelDevelopmentInput = {
    featureRows: jsonArray(featureRowsBytes, FEATURE_PATHS.features),
    outcomeRows: jsonArray(outcomeBytes, CORPUS_PATHS.outcomes),
  };
  const frozenV1Candidate = parseJson(
    v1CandidateBytes,
    V1_MODEL_PATHS.candidate
  ) as FinalCandidateState;

  const v3Candidate = fitHistoricalModelV3(input);
  const backcompat = auditHistoricalModelV3Backcompat(
    input,
    frozenV1Candidate,
    v3Candidate
  );

  const artifacts: ArtifactDigest[] = [];
  artifacts.push(
    writeJsonExclusive(outputDir, 'candidate/v3_candidate.json', v3Candidate)
  );
  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'audit/v1_v3_backcompat.json',
      backcompat
    )
  );

  const repoSha = repoCommitSha();
  const provenance = {
    version: 'historical_model_v3_backcompat_v1',
    modelDefinitionId: HISTORICAL_MODEL_V3_DEFINITION_ID,
    builderRepoSha: repoSha,
    featureArtifact: {
      ...FROZEN_FEATURE,
      featureMemberSha256: featureMemberSha,
      manifestSha256: sha256Bytes(featureManifestBytes),
      reportSha256: sha256Bytes(featureReportBytes),
      provenanceSha256: sha256Bytes(featureProvenanceBytes),
    },
    corpusOutcomeArtifact: {
      ...FROZEN_CORPUS,
      outcomeMemberSha256: outcomeMemberSha,
      manifestSha256: sha256Bytes(corpusManifestBytes),
      reportSha256: sha256Bytes(corpusReportBytes),
      provenanceSha256: sha256Bytes(corpusProvenanceBytes),
    },
    frozenV1ModelArtifact: {
      ...FROZEN_V1_MODEL,
      candidateMemberSha256: v1CandidateSha,
      manifestSha256: sha256Bytes(v1ManifestBytes),
      reportSha256: sha256Bytes(v1ReportBytes),
      provenanceSha256: sha256Bytes(v1ProvenanceBytes),
    },
  };
  artifacts.push(writeJsonExclusive(outputDir, 'source_provenance.json', provenance));

  const report = {
    version: 'historical_model_v3_backcompat_v1',
    mode: 'ARTIFACT_ONLY_OFFLINE_V3_MODEL_BACKCOMPAT',
    builderRepoSha: repoSha,
    modelDefinitionId: HISTORICAL_MODEL_V3_DEFINITION_ID,
    status: backcompat.status,
    developmentGames: backcompat.developmentGames,
    providerCalls: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    marketReads: 0,
    rawHistoricalPredictiveReads: 0,
    portalReads: 0,
    validation2024Reads: 0,
    holdout2025Reads: 0,
    sourceReads,
    gateChecks: backcompat.gateChecks,
    maxAbsolutePredictionDifference:
      backcompat.maxAbsolutePredictionDifference,
    maxAbsoluteSharedCoefficientDifference:
      backcompat.maxAbsoluteSharedCoefficientDifference,
    maxAbsoluteSharedScalerDifference:
      backcompat.maxAbsoluteSharedScalerDifference,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((a, b) => a.file.localeCompare(b.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: 'historical_model_v3_backcompat_v1',
    modelDefinitionId: HISTORICAL_MODEL_V3_DEFINITION_ID,
    builderRepoSha: repoSha,
    status: backcompat.status,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        status: backcompat.status,
        developmentGames: backcompat.developmentGames,
        maxAbsolutePredictionDifference:
          backcompat.maxAbsolutePredictionDifference,
        maxAbsoluteSharedCoefficientDifference:
          backcompat.maxAbsoluteSharedCoefficientDifference,
        maxAbsoluteSharedScalerDifference:
          backcompat.maxAbsoluteSharedScalerDifference,
        providerCalls: 0,
        marketReads: 0,
        validation2024Reads: 0,
        holdout2025Reads: 0,
        databaseReads: false,
        databaseWrites: false,
      },
      null,
      2
    )
  );

  if (backcompat.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`[historical-v3-model] ${sanitizeError(error)}`);
  process.exitCode = 1;
});
