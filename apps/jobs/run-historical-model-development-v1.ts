import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
  HISTORICAL_MODEL_DEFINITION_ID,
  buildStageASelection,
  fitFinalCandidateIfPassed,
  run2023Confirmation,
  type HistoricalModelDevelopmentInput,
  type StageAProvenance,
} from './src/research/historical-model-development-v1';

const CONFIRMATION =
  'RUN_2022_2023_HISTORICAL_MODEL_DEVELOPMENT_V1';

const FROZEN_FEATURE = {
  runId: 36489184409,
  artifactId: 11000651389,
  artifactName: 'historical-feature-v1-36489184409',
  zipSha256:
    '047220307750b755d1e6d626628802baf818dbd70ffde9252e63768e7a823ad2',
  builderRepoSha: '743738eea6dfd0852cf28c5941aa998be300b0c9',
  rootDir: '36489184409',
} as const;

const FROZEN_CORPUS = {
  runId: 36479515332,
  artifactId: 10997010171,
  artifactName: 'historical-development-corpus-v1-36479515332',
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  builderRepoSha: '3d553b0925f55321d53c3048544aa16a047e41c8',
  rootDir: '36479515332',
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
  market: 'evaluation/market_lines.json',
  gameFrames: 'predictive/game_frames.json',
  staticPriors: 'predictive/static_priors.json',
  advancedHistory: 'predictive/history_advanced.json',
  ppaHistory: 'predictive/history_ppa.json',
  historyEligibility: 'predictive/history_eligibility.json',
  portal2022: 'quarantine/transfer_portal_2022.json',
  portal2023: 'quarantine/transfer_portal_2023.json',
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  featureZip: string;
  corpusZip: string;
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
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!featureZip) throw new Error('feature_zip_required');
  if (!corpusZip) throw new Error('corpus_zip_required');
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return { featureZip, corpusZip, outputDir, confirm };
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

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_development_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_development_artifact_path');
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

function manifestMap(manifest: JsonObject, expectedCount: number): Map<string, JsonObject> {
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

function seasonOf(raw: unknown): number | null {
  const obj = asObject(raw);
  return obj && typeof obj.season === 'number' ? obj.season : null;
}

function sourceCounts(
  reads: Record<string, number>,
  forbidden: string[]
): boolean {
  return forbidden.every((name) => (reads[name] ?? 0) === 0);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const keep = [
    'invalid_confirmation',
    'feature_zip_required',
    'corpus_zip_required',
    'output_dir_required',
    'output_dir_already_exists',
    'feature_zip_missing',
    'corpus_zip_missing',
    'feature_zip_hash_mismatch',
    'corpus_zip_hash_mismatch',
    'invalid_git_head_sha',
  ];
  if (keep.includes(message)) return message;
  if (/stage_a_/.test(message)) return message.replace(/:.*/, '');
  if (/development_/.test(message)) return message.replace(/:.*/, '');
  if (/manifest_/.test(message)) return message.replace(/:.*/, '');
  if (/archive_/.test(message)) return message.replace(/:.*/, '');
  if (/feature_/.test(message)) return message.replace(/:.*/, '');
  if (/outcome_/.test(message)) return message.replace(/:.*/, '');
  if (/scaler_/.test(message)) return message.replace(/:.*/, '');
  if (/linear_/.test(message) || /singular_/.test(message)) {
    return message.replace(/:.*/, '');
  }
  return 'historical_model_development_v1_failed';
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const featureZip = path.resolve(args.featureZip);
  const corpusZip = path.resolve(args.corpusZip);
  const outputDir = path.resolve(args.outputDir);

  if (!fs.existsSync(featureZip) || !fs.statSync(featureZip).isFile()) {
    throw new Error('feature_zip_missing');
  }
  if (!fs.existsSync(corpusZip) || !fs.statSync(corpusZip).isFile()) {
    throw new Error('corpus_zip_missing');
  }
  if (sha256File(featureZip) !== FROZEN_FEATURE.zipSha256) {
    throw new Error('feature_zip_hash_mismatch');
  }
  if (sha256File(corpusZip) !== FROZEN_CORPUS.zipSha256) {
    throw new Error('corpus_zip_hash_mismatch');
  }
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');
  fs.mkdirSync(outputDir, { recursive: true });

  const featureReads: Record<string, number> = {};
  const corpusReads: Record<string, number> = {};

  const readFeature = (member: string): Buffer => {
    featureReads[member] = (featureReads[member] ?? 0) + 1;
    return archiveRead(featureZip, FROZEN_FEATURE.rootDir, member);
  };
  const readCorpus = (member: string): Buffer => {
    const allowed = new Set([
      CORPUS_PATHS.manifest,
      CORPUS_PATHS.report,
      CORPUS_PATHS.provenance,
      CORPUS_PATHS.outcomes,
    ]);
    if (!allowed.has(member as never)) {
      throw new Error(`forbidden_corpus_member_read:${member}`);
    }
    corpusReads[member] = (corpusReads[member] ?? 0) + 1;
    return archiveRead(corpusZip, FROZEN_CORPUS.rootDir, member);
  };

  const featureManifestBytes = readFeature(FEATURE_PATHS.manifest);
  const featureReportBytes = readFeature(FEATURE_PATHS.report);
  const featureProvenanceBytes = readFeature(FEATURE_PATHS.provenance);
  const featureRowsBytes = readFeature(FEATURE_PATHS.features);

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

  const corpusManifestBytes = readCorpus(CORPUS_PATHS.manifest);
  const corpusReportBytes = readCorpus(CORPUS_PATHS.report);
  const corpusProvenanceBytes = readCorpus(CORPUS_PATHS.provenance);
  const outcomeBytes = readCorpus(CORPUS_PATHS.outcomes);

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

  const featureRows = jsonArray(featureRowsBytes, FEATURE_PATHS.features);
  const outcomeRows = jsonArray(outcomeBytes, CORPUS_PATHS.outcomes);

  const feature2022 = featureRows.filter((row) => seasonOf(row) === 2022);
  const outcome2022 = outcomeRows.filter((row) => seasonOf(row) === 2022);
  if (feature2022.length !== 734 || outcome2022.length !== 734) {
    throw new Error('stage_a_2022_source_count_mismatch');
  }

  const builderRepoSha = repoCommitSha();
  const provenance: StageAProvenance = {
    builderRepoSha,
    featureArtifact: {
      runId: FROZEN_FEATURE.runId,
      artifactId: FROZEN_FEATURE.artifactId,
      zipSha256: FROZEN_FEATURE.zipSha256,
      featureMemberSha256: featureMemberSha,
    },
    corpusOutcomeArtifact: {
      runId: FROZEN_CORPUS.runId,
      artifactId: FROZEN_CORPUS.artifactId,
      zipSha256: FROZEN_CORPUS.zipSha256,
      outcomeMemberSha256: outcomeMemberSha,
    },
  };

  const stageA = buildStageASelection(
    { featureRows: feature2022, outcomeRows: outcome2022 },
    provenance
  );

  const outputArtifacts: ArtifactDigest[] = [];
  outputArtifacts.push(
    writeJsonExclusive(outputDir, 'stage_a/stage_a_tuning_report.json', {
      protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
      primaryTuning: stageA.primaryTuning,
      eloBaselineTuning: stageA.eloBaselineTuning,
      hfaBaselineTuning: stageA.hfaBaselineTuning,
    })
  );
  const selectionDigest = writeJsonExclusive(
    outputDir,
    'stage_a/stage_a_selection.json',
    stageA
  );
  outputArtifacts.push(selectionDigest);
  outputArtifacts.push(
    writeBytesExclusive(
      outputDir,
      'stage_a/stage_a_selection.sha256',
      Buffer.from(
        `${selectionDigest.sha256}  stage_a_selection.json\n`,
        'utf8'
      )
    )
  );

  // Re-read the exact frozen Stage A bytes from disk before 2023 is scored.
  const frozenSelectionPath = safeOutputPath(
    outputDir,
    'stage_a/stage_a_selection.json'
  );
  const frozenSelectionBytes = fs.readFileSync(frozenSelectionPath);
  const frozenSelectionSha = sha256Bytes(frozenSelectionBytes);
  if (frozenSelectionSha !== selectionDigest.sha256) {
    throw new Error('stage_a_selection_rehash_mismatch');
  }
  const frozenStageA = parseJson(
    frozenSelectionBytes,
    'stage_a/stage_a_selection.json'
  ) as typeof stageA;

  const forbiddenCorpusMembers = [
    CORPUS_PATHS.market,
    CORPUS_PATHS.gameFrames,
    CORPUS_PATHS.staticPriors,
    CORPUS_PATHS.advancedHistory,
    CORPUS_PATHS.ppaHistory,
    CORPUS_PATHS.historyEligibility,
    CORPUS_PATHS.portal2022,
    CORPUS_PATHS.portal2023,
  ];
  const leakageClear = sourceCounts(corpusReads, forbiddenCorpusMembers);

  const fullInput: HistoricalModelDevelopmentInput = {
    featureRows,
    outcomeRows,
  };
  const confirmation = run2023Confirmation(
    fullInput,
    frozenStageA,
    frozenSelectionSha,
    leakageClear
  );
  outputArtifacts.push(
    writeJsonExclusive(
      outputDir,
      'confirmation/confirmation_report.json',
      confirmation
    )
  );
  outputArtifacts.push(
    writeJsonExclusive(outputDir, 'confirmation/baselines.json', {
      stageASelectionSha256: frozenSelectionSha,
      hfaBaseline2023: {
        state: confirmation.hfaBaselineModelState2022,
        metrics: confirmation.hfaBaselineMetrics2023,
        predictions: confirmation.hfaBaselinePredictions2023,
      },
      eloBaseline2023: {
        state: confirmation.eloBaselineModelState2022,
        metrics: confirmation.eloBaselineMetrics2023,
        predictions: confirmation.eloBaselinePredictions2023,
      },
    })
  );

  const finalCandidate = fitFinalCandidateIfPassed(
    fullInput,
    frozenStageA,
    confirmation
  );
  if (finalCandidate) {
    outputArtifacts.push(
      writeJsonExclusive(
        outputDir,
        'candidate/final_candidate.json',
        finalCandidate
      )
    );
  }

  const sourceProvenance = {
    protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
    modelDefinitionId: HISTORICAL_MODEL_DEFINITION_ID,
    builderRepoSha,
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
  };
  outputArtifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', sourceProvenance)
  );

  const report = {
    protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
    modelDefinitionId: HISTORICAL_MODEL_DEFINITION_ID,
    mode: 'ARTIFACT_ONLY_OFFLINE_MODEL_DEVELOPMENT',
    builderRepoSha,
    stageASelectionSha256: frozenSelectionSha,
    selectedPrimaryLambda: frozenStageA.selectedPrimaryLambda,
    selectedEloBaselineLambda: frozenStageA.selectedEloBaselineLambda,
    confirmationStatus: confirmation.status,
    finalCandidateEmitted: finalCandidate !== null,
    sourceProviderCalls: 0,
    databaseReads: false,
    databaseWrites: false,
    prismaInvoked: false,
    marketReads: corpusReads[CORPUS_PATHS.market] ?? 0,
    rawCorpusPredictiveReads:
      (corpusReads[CORPUS_PATHS.gameFrames] ?? 0) +
      (corpusReads[CORPUS_PATHS.staticPriors] ?? 0) +
      (corpusReads[CORPUS_PATHS.advancedHistory] ?? 0) +
      (corpusReads[CORPUS_PATHS.ppaHistory] ?? 0) +
      (corpusReads[CORPUS_PATHS.historyEligibility] ?? 0),
    quarantineReads:
      (corpusReads[CORPUS_PATHS.portal2022] ?? 0) +
      (corpusReads[CORPUS_PATHS.portal2023] ?? 0),
    featureSourceReadCounts: featureReads,
    corpusSourceReadCounts: corpusReads,
    developmentSeasons: [2022, 2023],
    validation2024Included: false,
    holdout2025Included: false,
    marketOptimizationInvoked: false,
    bettingMetricsInvoked: false,
    gateChecks: confirmation.gateChecks,
    primaryMetrics2023: confirmation.primaryMetrics2023,
    eloBaselineMetrics2023: confirmation.eloBaselineMetrics2023,
    hfaBaselineMetrics2023: confirmation.hfaBaselineMetrics2023,
  };
  outputArtifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  outputArtifacts.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : 0
  );
  const manifest = {
    protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
    modelDefinitionId: HISTORICAL_MODEL_DEFINITION_ID,
    builderRepoSha,
    stageASelectionSha256: frozenSelectionSha,
    artifacts: outputArtifacts,
  };
  writeJsonExclusive(outputDir, 'manifest.json', manifest);

  console.log(
    JSON.stringify(
      {
        qaPass: true,
        protocolId: HISTORICAL_MODEL_DEVELOPMENT_V1_PROTOCOL,
        builderRepoSha,
        selectedPrimaryLambda: frozenStageA.selectedPrimaryLambda,
        selectedEloBaselineLambda: frozenStageA.selectedEloBaselineLambda,
        stageASelectionSha256: frozenSelectionSha,
        confirmationStatus: confirmation.status,
        finalCandidateEmitted: finalCandidate !== null,
        primaryMae2023: confirmation.primaryMetrics2023.mae,
        eloBaselineMae2023: confirmation.eloBaselineMetrics2023.mae,
        hfaBaselineMae2023: confirmation.hfaBaselineMetrics2023.mae,
        primaryRmse2023: confirmation.primaryMetrics2023.rmse,
        eloBaselineRmse2023: confirmation.eloBaselineMetrics2023.rmse,
        marketReads: report.marketReads,
        rawCorpusPredictiveReads: report.rawCorpusPredictiveReads,
        quarantineReads: report.quarantineReads,
        sourceProviderCalls: 0,
        databaseReads: false,
        databaseWrites: false,
        validation2024Included: false,
        holdout2025Included: false,
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
  console.error('[historical-model-development-v1] ' + sanitizeError(error));
  process.exit(1);
}
