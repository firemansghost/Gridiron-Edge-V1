#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  auditHistoricalV3PreScoreInputs,
  fitHistoricalV3Baselines,
  HISTORICAL_V3_PRESCORE_VERSION,
} from './src/research/historical-v3-confirmation';
import type { HistoricalModelV3Candidate } from './src/research/historical-model-v3';
import type {
  HistoricalV3PredictiveGameInput,
  HistoricalV3PredictiveInputQa,
} from './src/research/historical-v3-predictive-inputs';

const CONFIRMATION = 'FREEZE_HISTORICAL_V3_2024_PRESCORE';

const FROZEN_FEATURE = {
  artifactId: 11000651389,
  zipSha256:
    '047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2',
  featureMember: 'features/game_features.json',
} as const;
const FROZEN_CORPUS = {
  artifactId: 10997010171,
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  outcomeMember: 'outcomes/outcomes.json',
} as const;
const FROZEN_V1_MODEL = {
  artifactId: 11002393824,
  zipSha256:
    'bb0a9233c4de18c317b35d13cc6bacefadc4e359fe4de8e52addad3ec523e313',
  candidateMember: 'candidate/final_candidate.json',
  candidateMemberSha256:
    '8c6f1d053ff85e401f8acda5cba9ace7f54e5aaee6d9b46117a3c4dd690f1a53',
} as const;
const FROZEN_2024_SNAPSHOT = {
  artifactId: 11008470975,
  zipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
} as const;
const FROZEN_V2_REJECTED = {
  artifactId: 11033760438,
  zipSha256:
    'cdfb0c533c8ae6ffc44a29b6929185fd30229a73e18f87635227e5b8ecc3237c',
  status: 'HISTORICAL_V2_SOURCE_EQUIVALENCE_REJECTED',
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  featureZip: string;
  corpusZip: string;
  v1ModelZip: string;
  v2RejectedZip: string;
  v3ModelZip: string;
  v3ModelZipSha256: string;
  resolutionZip: string;
  resolutionZipSha256: string;
  predictiveZip: string;
  predictiveZipSha256: string;
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
  const sha = (name: string): string => {
    const value = (values.get(name) ?? '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(value)) {
      throw new Error(`invalid_sha256:${name}`);
    }
    return value;
  };
  const required = (name: string): string => {
    const value = values.get(name) ?? '';
    if (!value) throw new Error(`required_argument:${name}`);
    return value;
  };

  const args: Args = {
    featureZip: required('--feature-zip'),
    corpusZip: required('--corpus-zip'),
    v1ModelZip: required('--v1-model-zip'),
    v2RejectedZip: required('--v2-rejected-zip'),
    v3ModelZip: required('--v3-model-zip'),
    v3ModelZipSha256: sha('--v3-model-zip-sha256'),
    resolutionZip: required('--resolution-zip'),
    resolutionZipSha256: sha('--resolution-zip-sha256'),
    predictiveZip: required('--predictive-zip'),
    predictiveZipSha256: sha('--predictive-zip-sha256'),
    outputDir: required('--output-dir'),
    confirm: required('--confirm'),
  };
  if (args.confirm !== CONFIRMATION) throw new Error('invalid_confirmation');
  return args;
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

function assertZip(
  filePath: string,
  expectedSha: string,
  label: string
): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label}_zip_missing`);
  }
  if (sha256File(resolved) !== expectedSha) {
    throw new Error(`${label}_zip_hash_mismatch`);
  }
  return resolved;
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

function archiveRoot(zipPath: string): string {
  const manifests = archiveEntries(zipPath).filter(
    (entry) => entry === 'manifest.json' || entry.endsWith('/manifest.json')
  );
  if (manifests.length !== 1) throw new Error('archive_root_ambiguous');
  const dir = path.posix.dirname(manifests[0]);
  return dir === '.' ? '' : dir;
}

function archiveRead(zipPath: string, root: string, member: string): Buffer {
  const full = root ? `${root}/${member}` : member;
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

function verifyMember(
  manifest: Map<string, JsonObject>,
  member: string,
  bytes: Buffer
): string {
  const entry = manifest.get(member);
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

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_prescore_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_prescore_artifact_path');
  }
  return resolved;
}

function writeBytesExclusive(
  outputDir: string,
  relativePath: string,
  bytes: Buffer
): ArtifactDigest {
  const full = safeOutputPath(outputDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes, { flag: 'wx' });
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

function readArtifactMember(
  zipPath: string,
  member: string,
  label: string
): { bytes: Buffer; sha256: string; manifest: JsonObject; report: JsonObject } {
  const root = archiveRoot(zipPath);
  const manifestBytes = archiveRead(zipPath, root, 'manifest.json');
  const reportBytes = archiveRead(zipPath, root, 'report.json');
  const manifest = jsonObject(manifestBytes, `${label}:manifest`);
  const report = jsonObject(reportBytes, `${label}:report`);
  const map = manifestMap(manifest);
  verifyMember(map, 'report.json', reportBytes);
  const bytes = archiveRead(zipPath, root, member);
  const sha256 = verifyMember(map, member, bytes);
  return { bytes, sha256, manifest, report };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const prefix of [
    'required_argument',
    'invalid_sha256',
    'invalid_confirmation',
    'feature_',
    'corpus_',
    'v1_model_',
    'v2_rejected_',
    'v3_model_',
    'resolution_',
    'predictive_',
    'archive_',
    'manifest_',
    'v3_prescore_',
    'v3_confirmation_',
    'invalid_',
    'json_',
    'unsafe_',
  ]) {
    if (message.startsWith(prefix)) return message.replace(/:.*/, '');
  }
  return 'historical_v3_prescore_freeze_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const featureZip = assertZip(
    args.featureZip,
    FROZEN_FEATURE.zipSha256,
    'feature'
  );
  const corpusZip = assertZip(
    args.corpusZip,
    FROZEN_CORPUS.zipSha256,
    'corpus'
  );
  const v1ModelZip = assertZip(
    args.v1ModelZip,
    FROZEN_V1_MODEL.zipSha256,
    'v1_model'
  );
  const v2RejectedZip = assertZip(
    args.v2RejectedZip,
    FROZEN_V2_REJECTED.zipSha256,
    'v2_rejected'
  );
  const v3ModelZip = assertZip(
    args.v3ModelZip,
    args.v3ModelZipSha256,
    'v3_model'
  );
  const resolutionZip = assertZip(
    args.resolutionZip,
    args.resolutionZipSha256,
    'resolution'
  );
  const predictiveZip = assertZip(
    args.predictiveZip,
    args.predictiveZipSha256,
    'predictive'
  );
  const outputDir = path.resolve(args.outputDir);
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');

  const feature = readArtifactMember(
    featureZip,
    FROZEN_FEATURE.featureMember,
    'feature'
  );
  const corpus = readArtifactMember(
    corpusZip,
    FROZEN_CORPUS.outcomeMember,
    'corpus'
  );
  const featureRows = jsonArray(feature.bytes, 'feature_rows');
  const outcomeRows = jsonArray(corpus.bytes, 'development_outcomes');

  const v1 = readArtifactMember(
    v1ModelZip,
    FROZEN_V1_MODEL.candidateMember,
    'v1_model'
  );
  if (v1.sha256 !== FROZEN_V1_MODEL.candidateMemberSha256) {
    throw new Error('v1_model_candidate_hash_mismatch');
  }

  const v2Root = archiveRoot(v2RejectedZip);
  const v2ManifestBytes = archiveRead(v2RejectedZip, v2Root, 'manifest.json');
  const v2ReportBytes = archiveRead(v2RejectedZip, v2Root, 'report.json');
  const v2Manifest = jsonObject(v2ManifestBytes, 'v2_rejected_manifest');
  const v2Report = jsonObject(v2ReportBytes, 'v2_rejected_report');
  const v2Map = manifestMap(v2Manifest);
  verifyMember(v2Map, 'report.json', v2ReportBytes);
  if (
    v2Manifest.status !== FROZEN_V2_REJECTED.status ||
    v2Report.status !== FROZEN_V2_REJECTED.status
  ) {
    throw new Error('v2_rejected_status_mismatch');
  }

  const v3Candidate = readArtifactMember(
    v3ModelZip,
    'candidate/v3_candidate.json',
    'v3_model'
  );
  const v3Root = archiveRoot(v3ModelZip);
  const v3BackcompatBytes = archiveRead(
    v3ModelZip,
    v3Root,
    'audit/v1_v3_backcompat.json'
  );
  const v3Map = manifestMap(v3Candidate.manifest);
  const v3BackcompatSha = verifyMember(
    v3Map,
    'audit/v1_v3_backcompat.json',
    v3BackcompatBytes
  );
  const v3Backcompat = jsonObject(v3BackcompatBytes, 'v3_backcompat');
  if (
    v3Candidate.manifest.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Candidate.report.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS' ||
    v3Backcompat.status !== 'HISTORICAL_V3_BACKCOMPAT_PASS'
  ) {
    throw new Error('v3_model_backcompat_not_pass');
  }
  const candidate = parseJson(
    v3Candidate.bytes,
    'v3_candidate'
  ) as HistoricalModelV3Candidate;

  const resolutionRoot = archiveRoot(resolutionZip);
  const resolutionManifestBytes = archiveRead(
    resolutionZip,
    resolutionRoot,
    'manifest.json'
  );
  const resolutionReportBytes = archiveRead(
    resolutionZip,
    resolutionRoot,
    'report.json'
  );
  const resolutionManifest = jsonObject(
    resolutionManifestBytes,
    'resolution_manifest'
  );
  const resolutionReport = jsonObject(
    resolutionReportBytes,
    'resolution_report'
  );
  const resolutionMap = manifestMap(resolutionManifest);
  verifyMember(resolutionMap, 'report.json', resolutionReportBytes);
  if (
    resolutionManifest.version !==
      'historical_v3_week_query_resolution_v1' ||
    resolutionManifest.status !== resolutionReport.status ||
    ![
      'HISTORICAL_V3_WEEK_QUERY_QUALIFIED',
      'HISTORICAL_V3_WEEK_QUERY_REJECTED',
    ].includes(String(resolutionReport.status))
  ) {
    throw new Error('resolution_identity_mismatch');
  }

  const predictive = readArtifactMember(
    predictiveZip,
    'predictive/v3_game_inputs.json',
    'predictive'
  );
  const predictiveRoot = archiveRoot(predictiveZip);
  const predictiveQaBytes = archiveRead(
    predictiveZip,
    predictiveRoot,
    'audit/source_gap_report.json'
  );
  const predictiveMap = manifestMap(predictive.manifest);
  const predictiveQaSha = verifyMember(
    predictiveMap,
    'audit/source_gap_report.json',
    predictiveQaBytes
  );
  if (
    predictive.manifest.version !== 'historical_v3_predictive_inputs_v1' ||
    predictive.manifest.status !== 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT' ||
    predictive.report.status !== 'HISTORICAL_V3_PREDICTIVE_INPUTS_BUILT' ||
    predictive.report.marketReads !== 0 ||
    predictive.report.outcomeScoringReads !== 0 ||
    predictive.report.holdout2025Reads !== 0 ||
    predictive.report.databaseReads !== false ||
    predictive.report.databaseWrites !== false
  ) {
    throw new Error('predictive_identity_mismatch');
  }

  const predictiveRows = jsonArray(
    predictive.bytes,
    'v3_predictive_rows'
  ) as HistoricalV3PredictiveGameInput[];
  const predictiveQa = parseJson(
    predictiveQaBytes,
    'v3_predictive_qa'
  ) as HistoricalV3PredictiveInputQa;

  const baselines = fitHistoricalV3Baselines({
    featureRows,
    outcomeRows,
  });
  const audit = auditHistoricalV3PreScoreInputs(
    predictiveRows,
    predictiveQa
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const artifacts: ArtifactDigest[] = [];
  const hfaDigest = writeJsonExclusive(
    outputDir,
    'baselines/hfa_only.json',
    baselines.hfaOnly
  );
  artifacts.push(hfaDigest);
  const eloDigest = writeJsonExclusive(
    outputDir,
    'baselines/elo_hfa.json',
    baselines.eloHfa
  );
  artifacts.push(eloDigest);
  const candidateCopyDigest = writeBytesExclusive(
    outputDir,
    'frozen/v3_candidate.json',
    v3Candidate.bytes
  );
  artifacts.push(candidateCopyDigest);
  const backcompatCopyDigest = writeBytesExclusive(
    outputDir,
    'frozen/v3_backcompat.json',
    v3BackcompatBytes
  );
  artifacts.push(backcompatCopyDigest);
  const predictiveCopyDigest = writeBytesExclusive(
    outputDir,
    'frozen/v3_predictive_inputs.json',
    predictive.bytes
  );
  artifacts.push(predictiveCopyDigest);
  const predictiveQaCopyDigest = writeBytesExclusive(
    outputDir,
    'frozen/v3_predictive_qa.json',
    predictiveQaBytes
  );
  artifacts.push(predictiveQaCopyDigest);

  const contractPath = path.resolve(
    process.cwd(),
    'research/historical/HISTORICAL_SOURCE_RESILIENT_CONFIRMATION_V3_CONTRACT.md'
  );
  if (!fs.existsSync(contractPath)) {
    throw new Error('v3_prescore_contract_missing');
  }
  const contractSha256 = sha256File(contractPath);
  const builderRepoSha = repoCommitSha();

  const preScoreState = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    status: 'HISTORICAL_V3_PRESCORE_FROZEN',
    contract: {
      path:
        'research/historical/HISTORICAL_SOURCE_RESILIENT_CONFIRMATION_V3_CONTRACT.md',
      sha256: contractSha256,
    },
    builderRepoSha,
    frozenSources: {
      feature: {
        ...FROZEN_FEATURE,
        featureMemberSha256: feature.sha256,
      },
      developmentCorpus: {
        ...FROZEN_CORPUS,
        outcomeMemberSha256: corpus.sha256,
      },
      v1Model: {
        ...FROZEN_V1_MODEL,
      },
      observed2024Snapshot: FROZEN_2024_SNAPSHOT,
      v2RejectedSource: FROZEN_V2_REJECTED,
      v3Model: {
        zipSha256: args.v3ModelZipSha256,
        candidateMemberSha256: v3Candidate.sha256,
        backcompatMemberSha256: v3BackcompatSha,
      },
      v3Resolution: {
        zipSha256: args.resolutionZipSha256,
        status: resolutionReport.status,
        manifestSha256: sha256Bytes(resolutionManifestBytes),
        reportSha256: sha256Bytes(resolutionReportBytes),
      },
      v3PredictiveInputs: {
        zipSha256: args.predictiveZipSha256,
        inputMemberSha256: predictive.sha256,
        qaMemberSha256: predictiveQaSha,
      },
    },
    canonical: {
      games: audit.canonicalGames,
      teams: audit.canonicalTeams,
      gameIds: audit.canonicalGameIds,
    },
    missingness: {
      static: audit.staticMissingnessCounts,
      naturalFormMissingSides: audit.naturalFormMissingSides,
      sourceGapFormSides: audit.sourceGapFormSides,
      sourceGapAffectedSides: audit.sourceGapAffectedSides,
    },
    baselineMembers: {
      hfaOnly: hfaDigest,
      eloHfa: eloDigest,
    },
    frozenMembers: {
      v3Candidate: candidateCopyDigest,
      v3Backcompat: backcompatCopyDigest,
      v3PredictiveInputs: predictiveCopyDigest,
      v3PredictiveQa: predictiveQaCopyDigest,
    },
    sourceMemberReadLedger: {
      feature: [FROZEN_FEATURE.featureMember],
      developmentCorpus: [FROZEN_CORPUS.outcomeMember],
      v1Model: [FROZEN_V1_MODEL.candidateMember],
      v2Rejected: ['manifest.json', 'report.json'],
      v3Model: [
        'manifest.json',
        'report.json',
        'candidate/v3_candidate.json',
        'audit/v1_v3_backcompat.json',
      ],
      v3Resolution: ['manifest.json', 'report.json'],
      v3PredictiveInputs: [
        'manifest.json',
        'report.json',
        'predictive/v3_game_inputs.json',
        'audit/source_gap_report.json',
      ],
      observed2024OutcomeMembers: [],
      marketMembers: [],
      holdout2025Members: [],
    },
    boundaries: {
      providerCalls: 0,
      marketReads: 0,
      outcome2024Reads: 0,
      outcomeScoringReads: 0,
      holdout2025Reads: 0,
      databaseReads: false,
      databaseWrites: false,
      prismaInvoked: false,
      modelPredictionsComputed: false,
    },
  };

  const freezeDigest = writeJsonExclusive(
    outputDir,
    'freeze/pre_score_state.json',
    preScoreState
  );
  artifacts.push(freezeDigest);

  const provenance = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    builderRepoSha,
    exactRepoSha: builderRepoSha,
    preScoreStateSha256: freezeDigest.sha256,
    contractSha256,
  };
  artifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', provenance)
  );

  const report = {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    mode: 'ARTIFACT_ONLY_V3_2024_PRESCORE_FREEZE',
    builderRepoSha,
    status: 'HISTORICAL_V3_PRESCORE_FROZEN',
    canonicalGames: audit.canonicalGames,
    canonicalTeams: audit.canonicalTeams,
    sourceGapFormSides: audit.sourceGapFormSides,
    preScoreStateSha256: freezeDigest.sha256,
    providerCalls: 0,
    marketReads: 0,
    outcome2024Reads: 0,
    outcomeScoringReads: 0,
    holdout2025Reads: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    modelPredictionsComputed: false,
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((left, right) => left.file.localeCompare(right.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_V3_PRESCORE_VERSION,
    builderRepoSha,
    status: 'HISTORICAL_V3_PRESCORE_FROZEN',
    preScoreStateSha256: freezeDigest.sha256,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        status: 'HISTORICAL_V3_PRESCORE_FROZEN',
        canonicalGames: audit.canonicalGames,
        canonicalTeams: audit.canonicalTeams,
        sourceGapFormSides: audit.sourceGapFormSides,
        preScoreStateSha256: freezeDigest.sha256,
        providerCalls: 0,
        marketReads: 0,
        outcome2024Reads: 0,
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
  console.error('[historical-v3-prescore] ' + sanitizeError(error));
  process.exit(1);
}
