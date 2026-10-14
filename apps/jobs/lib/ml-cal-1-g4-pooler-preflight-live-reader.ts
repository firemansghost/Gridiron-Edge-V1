/**
 * ML-CAL-1 G4 nonfixture P-PREFLIGHT package reader (F2 R1–R18).
 *
 * Pure read-only: no mutation, network, or DB. Import is passive.
 * Never promotes mock/probe/fixture packages to live acceptance.
 * externallyAnchored=true ONLY when caller supplies expectedManifestSha256.
 *
 * Design pin (git/LF): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ML_CAL_1_G4_PREFLIGHT_BASE_253_TIP,
  ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
  ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
  ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS,
  ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS,
} from './ml-cal-1-g4-pooler-preflight-real-adapter';
import {
  isSafeG4PreflightId,
  ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
  redactError,
} from './ml-cal-1-g4-pooler-preflight-fixture';
import {
  connectionDescriptorsEqual,
  ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
  ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_PROBE,
  ML_CAL_1_G4_PREFLIGHT_REQUIRED_MEMBERS,
  normalizeNonsecretConnectionDescriptor,
  type MlCal1G4NonsecretConnectionDescriptor,
  type MlCal1G4PreflightProvenanceClass,
} from './ml-cal-1-g4-pooler-preflight-live-runner';

const SECRETISH =
  /(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-+\/=]{8,}|ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+|postgres(ql)?:\/\/\S+)/i;

const ALLOWED_SCHEMAS = new Set<string>([
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_PROBE,
]);

export interface MlCal1G4NonfixtureReaderOptions {
  /** Logical final package ID; required for staging validation; compared to basename for final dirs. */
  expectedPreflightId?: string;
  /**
   * Independently supplied expected connection descriptor.
   * Reader never manufactures expected from sealed actual values.
   */
  expectedConnection?: MlCal1G4NonsecretConnectionDescriptor;
  /** External design pin when reviewer supplies it separately. */
  expectedDesignSha256?: string;
  /**
   * External expected PACKAGE_MANIFEST.sha256.
   * ONLY source that can set externallyAnchored=true.
   * Never derived from package or discovered HANDOFF.json.
   */
  expectedManifestSha256?: string;
  /** When true, packageDir may be a staging/copy-away path whose basename need not equal id. */
  allowStagingBasename?: boolean;
}

export interface MlCal1G4NonfixtureReaderResult {
  ok: boolean;
  reasons: string[];
  internallyConsistent: boolean;
  externallyAnchored: boolean;
  targetBound: boolean;
  provenanceClass: MlCal1G4PreflightProvenanceClass | null;
  liveAccepted: false;
  approved: false;
  deployedPoolerProof: false;
  terminalSuccess: boolean;
  manifestSha256: string | null;
  preflightId: string | null;
  rejected: boolean;
}

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function scanSecretish(text: string): boolean {
  return SECRETISH.test(text);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseJsonObject(
  bytes: Buffer,
  label: string
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  try {
    const text = bytes.toString('utf8');
    if (scanSecretish(text)) {
      return { ok: false, reason: `${label}_secretish` };
    }
    const v = JSON.parse(text) as unknown;
    if (!isPlainObject(v)) {
      return { ok: false, reason: `${label}_not_object` };
    }
    return { ok: true, value: v };
  } catch {
    return { ok: false, reason: `${label}_json_parse_failed` };
  }
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function asProvenanceClass(
  v: unknown
): MlCal1G4PreflightProvenanceClass | null {
  if (v === 'mock' || v === 'live' || v === 'probe') return v;
  return null;
}

/**
 * Validate a sealed nonfixture preflight package (mock/live/probe schemas).
 * Fail-closed on any short-circuit or unsupported evaluator path.
 */
export function readG4NonfixturePreflightPackage(
  packageDir: string,
  options: MlCal1G4NonfixtureReaderOptions = {}
): MlCal1G4NonfixtureReaderResult {
  const reasons: string[] = [];
  const fail = (
    extra: string[] = [],
    partial: Partial<MlCal1G4NonfixtureReaderResult> = {}
  ): MlCal1G4NonfixtureReaderResult => ({
    ok: false,
    reasons: [...new Set([...reasons, ...extra])],
    internallyConsistent: false,
    externallyAnchored: false,
    targetBound: false,
    provenanceClass: null,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    terminalSuccess: false,
    manifestSha256: null,
    preflightId: null,
    rejected: true,
    ...partial,
  });

  if (typeof packageDir !== 'string' || !packageDir.trim()) {
    return fail(['package_dir_empty']);
  }
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    return fail(['package_dir_missing']);
  }
  try {
    if (fs.lstatSync(packageDir).isSymbolicLink()) {
      return fail(['package_dir_symlink']);
    }
  } catch (e) {
    return fail([`package_dir_unreadable:${redactError(e)}`]);
  }

  // R1: required members exactly once; reject unexpected paths / duplicates
  let entries: string[];
  try {
    entries = fs.readdirSync(packageDir);
  } catch (e) {
    return fail([`package_dir_readdir:${redactError(e)}`]);
  }
  const allow = new Set<string>(ML_CAL_1_G4_PREFLIGHT_REQUIRED_MEMBERS);
  const seen = new Set<string>();
  for (const name of entries) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return fail([`unsafe_member_path:${name}`]);
    }
    if (seen.has(name)) {
      return fail([`duplicate_member:${name}`]);
    }
    seen.add(name);
    const full = path.join(packageDir, name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(full);
    } catch (e) {
      return fail([`member_unreadable:${name}:${redactError(e)}`]);
    }
    if (st.isSymbolicLink()) {
      return fail([`member_symlink:${name}`]);
    }
    if (st.isDirectory()) {
      // copy-away may nest <id>/ — only when allowStagingBasename and single safe dir
      if (
        options.allowStagingBasename &&
        isSafeG4PreflightId(name) &&
        options.expectedPreflightId === name
      ) {
        return readG4NonfixturePreflightPackage(full, {
          ...options,
          allowStagingBasename: false,
          expectedPreflightId: name,
        });
      }
      return fail([`unexpected_directory_member:${name}`]);
    }
    if (!allow.has(name)) {
      if (name === 'HANDOFF.json' || name.toLowerCase() === 'handoff.json') {
        // Discovered handoff is never a trust anchor; ignore for anchoring but reject as unexpected member
        return fail(['unexpected_handoff_member']);
      }
      return fail([`unexpected_member:${name}`]);
    }
  }
  for (const req of ML_CAL_1_G4_PREFLIGHT_REQUIRED_MEMBERS) {
    if (!seen.has(req)) {
      return fail([`member_missing:${req}`]);
    }
  }

  const manifestBytes = fs.readFileSync(
    path.join(packageDir, 'PACKAGE_MANIFEST.json')
  );
  const manifestShaFile = fs
    .readFileSync(path.join(packageDir, 'PACKAGE_MANIFEST.sha256'), 'utf8')
    .trim()
    .toLowerCase();
  const recomputedManifestSha = sha256Buffer(manifestBytes);
  if (recomputedManifestSha !== manifestShaFile) {
    return fail(['manifest_sha_file_mismatch']);
  }
  if (scanSecretish(manifestBytes.toString('utf8'))) {
    return fail(['manifest_secretish']);
  }

  const manifestParsed = parseJsonObject(manifestBytes, 'manifest');
  if (manifestParsed.ok === false) {
    return fail([manifestParsed.reason]);
  }
  const manifest = manifestParsed.value;

  if (
    typeof manifest.schemaVersion !== 'string' ||
    !ALLOWED_SCHEMAS.has(manifest.schemaVersion)
  ) {
    reasons.push('manifest_schema_unsupported');
  }
  if (manifest.kind !== 'g4-pooler-preflight-package') {
    reasons.push('manifest_kind_mismatch');
  }
  if (
    typeof manifest.preflightId !== 'string' ||
    !isSafeG4PreflightId(manifest.preflightId)
  ) {
    reasons.push('manifest_preflight_id_invalid');
  }
  const preflightId =
    typeof manifest.preflightId === 'string' ? manifest.preflightId : '';

  // R: package ID agrees across basename / manifest / members
  const basename = path.basename(path.resolve(packageDir));
  if (!options.allowStagingBasename) {
    if (basename !== preflightId) {
      reasons.push('package_basename_id_mismatch');
    }
  }
  if (options.expectedPreflightId != null) {
    if (
      typeof options.expectedPreflightId !== 'string' ||
      !isSafeG4PreflightId(options.expectedPreflightId)
    ) {
      return fail(['expected_preflight_id_invalid']);
    }
    if (options.expectedPreflightId !== preflightId) {
      reasons.push('expected_preflight_id_mismatch');
    }
  }

  if (manifest.liveAccepted !== false) reasons.push('live_accepted_forbidden');
  if (manifest.approved !== false) reasons.push('approved_forbidden');
  if (manifest.deployedPoolerProof !== false) {
    reasons.push('deployed_pooler_proof_forbidden');
  }
  if (manifest.credentialsPresent !== false) {
    reasons.push('credentials_present_forbidden');
  }
  if (manifest.fixtureProvenance === true) {
    reasons.push('fixture_provenance_forbidden_in_nonfixture');
  }
  if (manifest.terminalSuccess !== true) {
    reasons.push('terminal_success_missing');
  }
  if (manifest.retentionProfile !== ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE) {
    reasons.push('retention_profile_mismatch');
  }
  if (manifest.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN) {
    reasons.push('manifest_design_pin_mismatch');
  }
  if (manifest.base254Tip !== ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP) {
    reasons.push('manifest_base254_mismatch');
  }
  if (manifest.base253Tip !== ML_CAL_1_G4_PREFLIGHT_BASE_253_TIP) {
    reasons.push('manifest_base253_mismatch');
  }

  const provenanceClass = asProvenanceClass(manifest.provenanceClass);
  if (!provenanceClass) {
    reasons.push('manifest_provenance_class_invalid');
  } else {
    const expectedSchema =
      provenanceClass === 'live'
        ? ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE
        : provenanceClass === 'probe'
          ? ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_PROBE
          : ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK;
    if (manifest.schemaVersion !== expectedSchema) {
      reasons.push('provenance_schema_class_mismatch');
    }
    if (provenanceClass === 'mock' && manifest.mockProvenance !== true) {
      reasons.push('mock_provenance_flag_required');
    }
    if (provenanceClass === 'probe' && manifest.probeProvenance !== true) {
      reasons.push('probe_provenance_flag_required');
    }
    if (provenanceClass !== 'mock' && manifest.mockProvenance === true) {
      reasons.push('mock_flag_on_non_mock');
    }
    if (provenanceClass !== 'probe' && manifest.probeProvenance === true) {
      reasons.push('probe_flag_on_non_probe');
    }
  }

  const memberDigests = manifest.memberDigests;
  if (!isPlainObject(memberDigests)) {
    return fail(['manifest_member_digests_missing']);
  }

  // R2: every member exact byte count/digest; no reserialize for digests
  for (const name of ML_CAL_1_G4_PREFLIGHT_REQUIRED_MEMBERS) {
    if (name === 'PACKAGE_MANIFEST.json' || name === 'PACKAGE_MANIFEST.sha256') {
      continue;
    }
    const meta = memberDigests[name];
    if (
      !isPlainObject(meta) ||
      typeof meta.sha256 !== 'string' ||
      typeof meta.byteCount !== 'number'
    ) {
      reasons.push(`digest_entry_missing:${name}`);
      continue;
    }
    const bytes = fs.readFileSync(path.join(packageDir, name));
    if (bytes.length !== meta.byteCount) {
      reasons.push(`bytecount_mismatch:${name}`);
    }
    if (sha256Buffer(bytes) !== String(meta.sha256).toLowerCase()) {
      reasons.push(`digest_mismatch:${name}`);
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      reasons.push(`secretish:${name}`);
    }
  }

  // Also verify manifest self-entries if present (self-hash outside digest map preferred)
  for (const name of ['PACKAGE_MANIFEST.json', 'PACKAGE_MANIFEST.sha256'] as const) {
    const meta = memberDigests[name];
    if (isPlainObject(meta) && typeof meta.sha256 === 'string') {
      const bytes = fs.readFileSync(path.join(packageDir, name));
      if (bytes.length !== meta.byteCount) {
        reasons.push(`bytecount_mismatch:${name}`);
      }
      if (sha256Buffer(bytes) !== String(meta.sha256).toLowerCase()) {
        reasons.push(`digest_mismatch:${name}`);
      }
    }
  }

  const runParsed = parseJsonObject(
    fs.readFileSync(path.join(packageDir, 'preflight-run-metadata.json')),
    'run_metadata'
  );
  const txParsed = parseJsonObject(
    fs.readFileSync(path.join(packageDir, 'preflight-tx-evidence.json')),
    'tx_evidence'
  );
  const designParsed = parseJsonObject(
    fs.readFileSync(path.join(packageDir, 'design-correspondence.json')),
    'design_correspondence'
  );
  const provenanceParsed = parseJsonObject(
    fs.readFileSync(path.join(packageDir, 'PROVENANCE.json')),
    'provenance'
  );
  if (runParsed.ok === false) reasons.push(runParsed.reason);
  if (txParsed.ok === false) reasons.push(txParsed.reason);
  if (designParsed.ok === false) reasons.push(designParsed.reason);
  if (provenanceParsed.ok === false) reasons.push(provenanceParsed.reason);
  if (
    runParsed.ok === false ||
    txParsed.ok === false ||
    designParsed.ok === false ||
    provenanceParsed.ok === false
  ) {
    return fail([]);
  }

  const runMeta = runParsed.value;
  const txEvidence = txParsed.value;
  const design = designParsed.value;
  const provenance = provenanceParsed.value;

  if (runMeta.kind !== 'g4-pooler-preflight-run-metadata') {
    reasons.push('run_metadata_kind_mismatch');
  }
  if (txEvidence.kind !== 'g4-pooler-preflight-tx-evidence') {
    reasons.push('tx_evidence_kind_mismatch');
  }
  if (design.kind !== 'g4-pooler-preflight-design-correspondence') {
    reasons.push('design_kind_mismatch');
  }
  if (provenance.kind !== 'g4-pooler-preflight-provenance') {
    reasons.push('provenance_kind_mismatch');
  }

  for (const [label, obj] of [
    ['run_metadata', runMeta],
    ['tx_evidence', txEvidence],
    ['design_correspondence', design],
    ['provenance', provenance],
  ] as const) {
    if (obj.preflightId !== preflightId) {
      reasons.push(`${label}_preflight_id_mismatch`);
    }
  }

  // Strict provenance agreement + cross-class veto
  const classes = [
    asProvenanceClass(runMeta.provenanceClass),
    asProvenanceClass(txEvidence.provenanceClass),
    asProvenanceClass(design.provenanceClass),
    asProvenanceClass(provenance.provenanceClass),
    provenanceClass,
  ];
  if (classes.some((c) => c == null)) {
    reasons.push('provenance_class_missing');
  } else if (new Set(classes).size !== 1) {
    reasons.push('provenance_class_contradiction');
  }

  if (runMeta.terminalSuccess !== true) {
    reasons.push('run_metadata_terminal_success_missing');
  }
  if (runMeta.transactionCompleted !== true) {
    reasons.push('run_metadata_transaction_incomplete');
  }
  if (txEvidence.transactionCompleted !== true) {
    reasons.push('tx_evidence_transaction_incomplete');
  }
  for (const [label, obj] of [
    ['run_metadata', runMeta],
    ['tx_evidence', txEvidence],
    ['provenance', provenance],
    ['manifest', manifest],
  ] as const) {
    if (obj.liveAccepted !== false) reasons.push(`${label}_live_accepted`);
    if (obj.approved !== false) reasons.push(`${label}_approved_forbidden`);
    if (
      'deployedPoolerProof' in obj &&
      (obj as { deployedPoolerProof?: unknown }).deployedPoolerProof !== false
    ) {
      reasons.push(`${label}_deployed_pooler_proof`);
    }
  }
  if (runMeta.credentialsPresent !== false) {
    reasons.push('run_metadata_credentials_present');
  }
  if (runMeta.fixtureProvenance === true || provenance.fixtureProvenance === true) {
    reasons.push('fixture_class_in_nonfixture_package');
  }
  if (runMeta.businessDataWrites !== 0) reasons.push('business_writes_nonzero');
  if (runMeta.providerCalls !== 0) reasons.push('provider_calls_nonzero');
  if (runMeta.databaseObservedRole !== 'UNVERIFIED') {
    reasons.push('database_observed_role_not_unverified');
  }
  if (txEvidence.databaseObservedRole !== 'UNVERIFIED') {
    reasons.push('tx_database_observed_role_not_unverified');
  }
  if (runMeta.adapterKind !== ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND) {
    reasons.push('run_adapter_kind_mismatch');
  }
  if (txEvidence.adapterKind !== ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND) {
    reasons.push('tx_adapter_kind_mismatch');
  }
  if (runMeta.runnerKind !== ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND) {
    reasons.push('runner_kind_mismatch');
  }
  if (design.runnerKind !== ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND) {
    reasons.push('design_runner_kind_mismatch');
  }
  if (runMeta.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN) {
    reasons.push('run_design_pin_mismatch');
  }
  if (txEvidence.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN) {
    reasons.push('tx_design_pin_mismatch');
  }
  if (design.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN) {
    reasons.push('design_pin_mismatch');
  }
  if (
    typeof runMeta.runnerCommitSha !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(runMeta.runnerCommitSha)
  ) {
    reasons.push('runner_commit_invalid');
  }
  if (txEvidence.runnerCommitSha !== runMeta.runnerCommitSha) {
    reasons.push('tx_run_commit_mismatch');
  }
  if (design.runnerCommitSha !== runMeta.runnerCommitSha) {
    reasons.push('design_run_commit_mismatch');
  }

  // TX options exact
  const checkOpts = (opts: unknown, label: string) => {
    if (!isPlainObject(opts)) {
      reasons.push(`${label}_options_missing`);
      return;
    }
    if (opts.isolationLevel !== 'RepeatableRead') {
      reasons.push(`${label}_isolation_level`);
    }
    if (opts.maxWait !== ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS) {
      reasons.push(`${label}_max_wait`);
    }
    if (opts.timeout !== ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS) {
      reasons.push(`${label}_timeout`);
    }
  };
  checkOpts(runMeta.transactionOptions, 'run');
  checkOpts(txEvidence.transactionOptions, 'tx');

  if (
    String(runMeta.transactionIsolation || '').toLowerCase() !==
    'repeatable read'
  ) {
    reasons.push('run_metadata_isolation_invalid');
  }
  if (String(runMeta.transactionReadOnly || '').toLowerCase() !== 'on') {
    reasons.push('run_metadata_read_only_invalid');
  }
  if (
    String(txEvidence.transactionIsolation || '').toLowerCase() !==
    'repeatable read'
  ) {
    reasons.push('tx_evidence_isolation_invalid');
  }
  if (String(txEvidence.transactionReadOnly || '').toLowerCase() !== 'on') {
    reasons.push('tx_evidence_read_only_invalid');
  }
  if (txEvidence.transactionIsolation !== runMeta.transactionIsolation) {
    reasons.push('tx_run_isolation_mismatch');
  }
  if (txEvidence.transactionReadOnly !== runMeta.transactionReadOnly) {
    reasons.push('tx_run_read_only_mismatch');
  }
  if (txEvidence.transactionTimestamp !== runMeta.dbTransactionTime) {
    reasons.push('tx_run_timestamp_mismatch');
  }

  const tDb = parseIsoMs(runMeta.dbTransactionTime);
  const tStart = parseIsoMs(runMeta.preflightStartTime);
  const tEnd = parseIsoMs(runMeta.preflightEndTime);
  if (tDb == null) reasons.push('db_transaction_time_invalid');
  if (tStart == null) reasons.push('preflight_start_invalid');
  if (tEnd == null) reasons.push('preflight_end_invalid');
  if (
    tDb != null &&
    tStart != null &&
    tEnd != null &&
    !(tStart <= tDb && tDb <= tEnd)
  ) {
    reasons.push('db_transaction_time_out_of_bounds');
  }
  if (tStart != null && tEnd != null && tStart > tEnd) {
    reasons.push('preflight_clock_reversed');
  }

  // Target binding — expected must be independently supplied
  let targetBound = false;
  if (options.expectedConnection) {
    const expected = normalizeNonsecretConnectionDescriptor(
      options.expectedConnection
    );
    const sealedExpected = runMeta.expectedConnection;
    const sealedActual = runMeta.actualConnection;
    if (!isPlainObject(sealedExpected) || !isPlainObject(sealedActual)) {
      reasons.push('sealed_connection_missing');
    } else {
      const se = normalizeNonsecretConnectionDescriptor(
        sealedExpected as unknown as MlCal1G4NonsecretConnectionDescriptor
      );
      const sa = normalizeNonsecretConnectionDescriptor(
        sealedActual as unknown as MlCal1G4NonsecretConnectionDescriptor
      );
      if (!connectionDescriptorsEqual(expected, se)) {
        reasons.push('expected_connection_mismatch_vs_caller');
      }
      if (!connectionDescriptorsEqual(se, sa)) {
        reasons.push('sealed_expected_actual_mismatch');
      }
      if (
        connectionDescriptorsEqual(expected, se) &&
        connectionDescriptorsEqual(se, sa) &&
        runMeta.targetBound === true
      ) {
        targetBound = true;
      } else if (runMeta.targetBound === true) {
        reasons.push('target_bound_flag_without_match');
      }
    }
  } else {
    // Without external expected, sealed self-consistency only — not independent targetBound
    if (runMeta.targetBound === true) {
      // Internally claimed; do not elevate without caller expected
      const sealedExpected = runMeta.expectedConnection;
      const sealedActual = runMeta.actualConnection;
      if (isPlainObject(sealedExpected) && isPlainObject(sealedActual)) {
        const se = normalizeNonsecretConnectionDescriptor(
          sealedExpected as unknown as MlCal1G4NonsecretConnectionDescriptor
        );
        const sa = normalizeNonsecretConnectionDescriptor(
          sealedActual as unknown as MlCal1G4NonsecretConnectionDescriptor
        );
        if (!connectionDescriptorsEqual(se, sa)) {
          reasons.push('sealed_expected_actual_mismatch');
        }
      }
    }
    targetBound = false;
  }

  if (options.expectedDesignSha256 != null) {
    if (
      typeof options.expectedDesignSha256 !== 'string' ||
      options.expectedDesignSha256.toLowerCase() !==
        ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN
    ) {
      reasons.push('external_design_pin_mismatch');
    }
  }

  // External anchor — never from package or handoff
  let externallyAnchored = false;
  if (options.expectedManifestSha256 != null) {
    if (
      typeof options.expectedManifestSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(options.expectedManifestSha256)
    ) {
      reasons.push('external_manifest_sha_invalid');
    } else if (
      options.expectedManifestSha256.toLowerCase() !== recomputedManifestSha
    ) {
      reasons.push('external_manifest_sha_mismatch');
    } else {
      externallyAnchored = true;
    }
  }

  // Live schema packages: never return live proof acceptance
  if (provenanceClass === 'live') {
    // Validation of adversarial live-schema bytes may pass internal checks,
    // but liveAccepted/approved/deployed remain false forever here.
    if (manifest.liveAccepted === true) {
      reasons.push('live_schema_cannot_self_accept');
    }
  }
  if (provenanceClass === 'probe') {
    reasons.push('probe_package_not_tx_success');
  }

  // Cross-class: fixture schema forever fixture — reject if sneaked in
  if (
    typeof manifest.schemaVersion === 'string' &&
    manifest.schemaVersion.includes('fixture')
  ) {
    reasons.push('fixture_schema_in_nonfixture_reader');
  }

  const uniq = [...new Set(reasons)];
  if (uniq.length > 0) {
    return fail(uniq, {
      provenanceClass,
      manifestSha256: recomputedManifestSha,
      preflightId: preflightId || null,
      targetBound: false,
      externallyAnchored: false,
    });
  }

  // Mock/probe readers validate their schemas but cannot return live proof
  const internallyConsistent = true;
  if (externallyAnchored && options.expectedManifestSha256 == null) {
    return fail(['external_anchor_without_caller_digest']);
  }

  return {
    ok: true,
    reasons: [],
    internallyConsistent,
    externallyAnchored,
    targetBound,
    provenanceClass,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    terminalSuccess: true,
    manifestSha256: recomputedManifestSha,
    preflightId,
    rejected: false,
  };
}
