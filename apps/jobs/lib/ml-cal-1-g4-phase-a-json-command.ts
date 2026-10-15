/**
 * ML-CAL-1 G4 Phase A JSON command surfaces (local review tooling).
 *
 * A) Setup with complete JSON result capture
 * B) Read-only anchored receipt/final-evidence evaluation
 *
 * F1–F5 repairs (this file only; accepted #256 library untouched):
 * F1: capture must sit outside the complete evidence tree (g4 base), not merely
 *     unequal to the two input filenames.
 * F2: exported runPhaseAJsonCommand validates opt-in/output before any clock/FS.
 * F3: durable JSON never claims ok/outputOk success; operationOk is separate.
 * F4: every refusal yields structured JSON diagnostics to the entrypoint.
 * F5: serialization/output exceptions close owned FDs and report residue.
 *
 * W4–W9 remain unimplemented. Import is passive.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  canonicalizePathForCompare,
  evaluatePhaseASetupReceiptForTerminalSuccess,
  g4EvidenceBaseFromOperatorUserRoot,
  requireAbsoluteDestination,
  runG4PhaseARetentionSetup,
  validateExistingAncestors,
  type MlCal1G4PhaseASetupResult,
  type MlCal1G4PhaseATerminalSuccessEval,
} from './ml-cal-1-g4-phase-a-retention-setup';
import { isSafeG4PreflightId, redactError } from './ml-cal-1-g4-pooler-preflight-fixture';

export const ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND =
  'ml-cal-1-g4-phase-a-json-command-v1' as const;

const SHA256_RE = /^[a-f0-9]{64}$/;

export type PhaseAJsonCommandName = 'setup' | 'evaluate';

export interface PhaseAJsonOutputChoice {
  stdout: boolean;
  captureFile: string | null;
}

export interface PhaseAJsonSetupRequest {
  command: 'setup';
  enabled: true;
  confirmSetup: true;
  mode: 'temp' | 'operator';
  destination: string;
  expectedDestination: string;
  probeId: string;
  handoffId: string;
  output: PhaseAJsonOutputChoice;
}

export interface PhaseAJsonEvaluateRequest {
  command: 'evaluate';
  receiptPath: string;
  finalEvidencePath: string;
  expectedReceiptSha256: string;
  expectedReceiptByteCount: number;
  expectedFinalEvidenceSha256: string;
  expectedFinalEvidenceByteCount: number;
  output: PhaseAJsonOutputChoice;
}

export type PhaseAJsonParsedRequest =
  | PhaseAJsonSetupRequest
  | PhaseAJsonEvaluateRequest;

export interface PhaseAJsonByteCountChecks {
  receiptByteCountMatch: boolean;
  finalEvidenceByteCountMatch: boolean;
  expectedReceiptByteCount: number;
  actualReceiptByteCount: number | null;
  expectedFinalEvidenceByteCount: number;
  actualFinalEvidenceByteCount: number | null;
  stableAcrossReread: boolean;
}

export interface PhaseAJsonCommandEnvelope {
  kind: typeof ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND;
  command: PhaseAJsonCommandName | null;
  /**
   * Full command success (operation + verified output). Durable serialized
   * payloads always leave this false; only the in-memory post-emit result may
   * set it true after channels succeed.
   */
  ok: boolean;
  /** Setup/evaluate+enrichment succeeded (independent of output delivery). */
  operationOk: boolean;
  setupSucceeded: boolean | null;
  evaluationSucceeded: boolean | null;
  /**
   * Output channels completed. Durable payloads always false; in-memory may
   * become true after verified delivery.
   */
  outputOk: boolean;
  reasons: string[];
  notes: string[];
  setup:
    | (MlCal1G4PhaseASetupResult & { finalEvidenceByteCount: number | null })
    | null;
  evaluation: MlCal1G4PhaseATerminalSuccessEval | null;
  byteCountChecks: PhaseAJsonByteCountChecks | null;
  capturePath: string | null;
  captureResidue: string | null;
  writtenPayloadSha256: string | null;
  writtenPayloadByteCount: number | null;
  setupInvoked: boolean;
  evaluatorInvoked: boolean;
  liveAccepted: false;
  approved: false;
  deployedPoolerProof: false;
}

export interface PhaseAJsonCommandResult {
  envelope: PhaseAJsonCommandEnvelope;
  exitCode: 0 | 1;
  /** Durable/serialized JSON text (ok/outputOk always false inside). */
  jsonText: string | null;
  stderrLines: string[];
}

export interface PhaseAJsonCommandDeps {
  runSetup?: typeof runG4PhaseARetentionSetup;
  evaluate?: typeof evaluatePhaseASetupReceiptForTerminalSuccess;
  writeStdout?: (text: string) => { ok: true } | { ok: false; reason: string };
  /** Test/injection hook for partial stdout writeSync behavior. */
  writeStdoutChunk?: (
    fd: number,
    buf: Buffer,
    offset: number,
    length: number
  ) => number;
  now?: () => Date;
  injectAfterSetupBeforeCaptureWrite?: boolean;
  injectCaptureCloseFailure?: boolean;
  injectCaptureReadbackFailure?: boolean;
  injectSerializeFailure?: boolean;
}

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function isSymlinkOrJunction(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return true;
  }
}

function pathUnderOrEqual(candidateAbs: string, rootAbs: string): boolean {
  const cand = path.resolve(candidateAbs);
  const root = path.resolve(rootAbs);
  const rel = path.relative(root, cand);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function baseEnvelope(
  partial: Partial<PhaseAJsonCommandEnvelope> & { reasons: string[] }
): PhaseAJsonCommandEnvelope {
  const merged: PhaseAJsonCommandEnvelope = {
    kind: ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND,
    command: null,
    ok: false,
    operationOk: false,
    setupSucceeded: null,
    evaluationSucceeded: null,
    outputOk: false,
    notes: [],
    setup: null,
    evaluation: null,
    byteCountChecks: null,
    capturePath: null,
    captureResidue: null,
    writtenPayloadSha256: null,
    writtenPayloadByteCount: null,
    setupInvoked: false,
    evaluatorInvoked: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    ...partial,
  };
  merged.liveAccepted = false;
  merged.approved = false;
  merged.deployedPoolerProof = false;
  return merged;
}

/**
 * Durable payloads must never claim command/output completion (F3).
 */
function durableSerializeEnvelope(
  envelope: PhaseAJsonCommandEnvelope
): PhaseAJsonCommandEnvelope {
  return {
    ...envelope,
    ok: false,
    outputOk: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    notes: [
      ...envelope.notes,
      'durable_payload_ok_and_outputOk_forced_false',
      'command_success_requires_process_exit_0_after_verified_output',
    ],
  };
}

/**
 * F5: diagnostic fallback must never rethrow from a failing stdout writer.
 * Prefer stderr-only; optional stdout is best-effort and exception-swallowed.
 */
function attachStructuredDiagnostics(
  envelope: PhaseAJsonCommandEnvelope,
  stderrLines: string[],
  opts?: {
    alsoStdout?: boolean;
    deps?: PhaseAJsonCommandDeps;
    /** When true, never invoke deps.writeStdout (recovery after writer failure). */
    skipStdoutWriter?: boolean;
  }
): { jsonText: string; stderrLines: string[] } {
  const durable = durableSerializeEnvelope(envelope);
  let text: string;
  try {
    text = `${JSON.stringify(durable, null, 2)}\n`;
  } catch (e) {
    const fallback = `${JSON.stringify({
      kind: ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND,
      ok: false,
      outputOk: false,
      operationOk: false,
      reasons: [
        ...envelope.reasons,
        `diagnostic_serialize_failed:${redactError(e)}`,
      ],
      capturePath: envelope.capturePath,
      captureResidue: envelope.captureResidue,
      setupSucceeded: envelope.setupSucceeded,
      setupInvoked: envelope.setupInvoked,
      liveAccepted: false,
      approved: false,
      deployedPoolerProof: false,
    })}\n`;
    stderrLines.push(fallback);
    return { jsonText: fallback, stderrLines };
  }
  stderrLines.push(text);
  if (opts?.alsoStdout && !opts.skipStdoutWriter) {
    try {
      const w = (opts.deps?.writeStdout ?? defaultStdoutWrite)(text);
      if (w.ok === false) {
        stderrLines.push(w.reason);
      }
    } catch (e) {
      stderrLines.push(
        `stdout_diagnostic_emit_threw:${redactError(e)};stderr_only_fallback_kept`
      );
    }
  }
  return { jsonText: text, stderrLines };
}

function refusalResult(
  envelope: PhaseAJsonCommandEnvelope,
  stderrLines: string[] = [],
  opts?: {
    alsoStdout?: boolean;
    deps?: PhaseAJsonCommandDeps;
    skipStdoutWriter?: boolean;
  }
): PhaseAJsonCommandResult {
  const diag = attachStructuredDiagnostics(envelope, stderrLines, opts);
  return {
    envelope: { ...envelope, ok: false, outputOk: false },
    exitCode: 1,
    jsonText: diag.jsonText,
    stderrLines: diag.stderrLines,
  };
}

/**
 * Write every UTF-8 byte to an fd. Partial writes must be retried until complete.
 * Zero progress is a hard failure. Never report success for truncated payloads.
 */
export function writeAllUtf8ToFd(
  fd: number,
  text: string,
  writeChunk: (
    fd: number,
    buf: Buffer,
    offset: number,
    length: number
  ) => number = (f, b, o, l) => fs.writeSync(f, b, o, l)
): { ok: true; byteCount: number } | { ok: false; reason: string } {
  const buf = Buffer.from(text, 'utf8');
  let offset = 0;
  try {
    while (offset < buf.length) {
      const n = writeChunk(fd, buf, offset, buf.length - offset);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, reason: 'stdout_write_invalid_byte_count' };
      }
      if (n === 0) {
        return {
          ok: false,
          reason: `stdout_write_zero_progress_at_offset_${offset}_of_${buf.length}`,
        };
      }
      offset += n;
    }
    return { ok: true, byteCount: buf.length };
  } catch (e) {
    return {
      ok: false,
      reason: `stdout_write_failed_at_offset_${offset}_of_${buf.length}:${redactError(e)}`,
    };
  }
}

/**
 * Write stdout fully. Backpressure is irrelevant for writeSync loops.
 * A single partial writeSync result must not be treated as success.
 */
function defaultStdoutWrite(
  text: string,
  deps?: PhaseAJsonCommandDeps
): { ok: true } | { ok: false; reason: string } {
  try {
    const fd =
      typeof process.stdout.fd === 'number' ? process.stdout.fd : 1;
    const written = writeAllUtf8ToFd(
      fd,
      text,
      deps?.writeStdoutChunk ??
        ((f, b, o, l) => fs.writeSync(f, b, o, l))
    );
    if (written.ok === false) {
      return { ok: false, reason: written.reason };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `stdout_write_failed:${redactError(e)}` };
  }
}

/**
 * Infer `…/ml-cal-1/g4` evidence base from an artifact path, if present.
 */
export function inferG4EvidenceBaseFromArtifact(
  artifactAbs: string
): string | null {
  let walk = path.resolve(artifactAbs);
  for (;;) {
    const base = path.basename(walk);
    const parent = path.dirname(walk);
    if (base.toLowerCase() === 'g4' && path.basename(parent).toLowerCase() === 'ml-cal-1') {
      return walk;
    }
    if (parent === walk) break;
    walk = parent;
  }
  return null;
}

/**
 * F1: resolve physical identity of an existing evidence artifact.
 * Rejects symlink/junction components on the path and unresolved realpath.
 */
export function resolvePhysicalEvidenceArtifact(
  artifactPath: string
):
  | { ok: true; lexicalAbs: string; physicalAbs: string; physicalDir: string }
  | { ok: false; reasons: string[] } {
  const absReq = requireAbsoluteDestination(artifactPath);
  if (absReq.ok === false) {
    return { ok: false, reasons: [`artifact_${absReq.reason}`] };
  }
  const lexicalAbs = absReq.abs;
  if (!fs.existsSync(lexicalAbs)) {
    return { ok: false, reasons: ['artifact_missing'] };
  }
  const anc = validateExistingAncestors(lexicalAbs);
  if (!anc.ok) {
    return {
      ok: false,
      reasons: anc.reasons.map((r) => `artifact_${r}`),
    };
  }
  if (isSymlinkOrJunction(lexicalAbs)) {
    return { ok: false, reasons: ['artifact_path_symlink'] };
  }
  try {
    const physicalAbs = fs.realpathSync(lexicalAbs);
    if (isSymlinkOrJunction(physicalAbs)) {
      return { ok: false, reasons: ['artifact_physical_symlink'] };
    }
    return {
      ok: true,
      lexicalAbs,
      physicalAbs,
      physicalDir: path.dirname(physicalAbs),
    };
  } catch (e) {
    return {
      ok: false,
      reasons: [`artifact_identity_unresolved:${redactError(e)}`],
    };
  }
}

/**
 * Parse argv. No filesystem or clock activity.
 */
export function parsePhaseAJsonCommandArgv(
  argv: string[]
):
  | { ok: true; request: PhaseAJsonParsedRequest }
  | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const seen = new Set<string>();
  const raw: Record<string, string> = {};

  const known = new Set([
    'command',
    'enabled',
    'confirm-setup',
    'mode',
    'destination',
    'expected-destination',
    'probe-id',
    'handoff-id',
    'json-stdout',
    'json-capture-file',
    'receipt-path',
    'final-evidence-path',
    'expected-receipt-sha256',
    'expected-receipt-byte-count',
    'expected-final-evidence-sha256',
    'expected-final-evidence-byte-count',
  ]);

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      reasons.push(`unknown_positional:${arg}`);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq === -1) {
      reasons.push(`malformed_flag_missing_equals:${arg}`);
      continue;
    }
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    if (!known.has(key)) {
      reasons.push(`unknown_flag:${key}`);
      continue;
    }
    if (seen.has(key)) {
      reasons.push(`duplicate_flag:${key}`);
      continue;
    }
    seen.add(key);
    raw[key] = value;
  }

  if (reasons.length > 0) return { ok: false, reasons };

  if (raw.command !== 'setup' && raw.command !== 'evaluate') {
    return { ok: false, reasons: ['command_setup_or_evaluate_required'] };
  }

  let stdout = false;
  let captureFile: string | null = null;
  if (raw['json-stdout'] !== undefined) {
    if (raw['json-stdout'] !== 'true' && raw['json-stdout'] !== 'false') {
      return { ok: false, reasons: ['json_stdout_exact_boolean_required'] };
    }
    stdout = raw['json-stdout'] === 'true';
  }
  if (raw['json-capture-file'] !== undefined) {
    if (!raw['json-capture-file'].trim()) {
      return { ok: false, reasons: ['json_capture_file_empty'] };
    }
    captureFile = raw['json-capture-file'];
  }
  if (!stdout && !captureFile) {
    reasons.push(
      'output_choice_required_json_stdout_and_or_json_capture_file'
    );
  }
  if (raw['json-stdout'] === 'false' && !captureFile) {
    reasons.push('json_stdout_false_without_capture_file');
  }
  const output: PhaseAJsonOutputChoice = { stdout, captureFile };

  if (raw.command === 'setup') {
    for (const k of [
      'receipt-path',
      'final-evidence-path',
      'expected-receipt-sha256',
      'expected-receipt-byte-count',
      'expected-final-evidence-sha256',
      'expected-final-evidence-byte-count',
    ]) {
      if (raw[k] !== undefined) reasons.push(`conflicting_flag_for_setup:${k}`);
    }
    if (raw.enabled !== 'true') reasons.push('enabled_exact_true_required');
    if (raw['confirm-setup'] !== 'true') {
      reasons.push('confirm_setup_exact_true_required');
    }
    if (raw.mode !== 'temp' && raw.mode !== 'operator') {
      reasons.push('mode_temp_or_operator_required');
    }
    if (!raw.destination?.trim()) reasons.push('destination_required');
    if (!raw['expected-destination']?.trim()) {
      reasons.push('expected_destination_required');
    }
    if (!raw['probe-id'] || !isSafeG4PreflightId(raw['probe-id'])) {
      reasons.push('unsafe_or_missing_probe_id');
    }
    if (!raw['handoff-id'] || !isSafeG4PreflightId(raw['handoff-id'])) {
      reasons.push('unsafe_or_missing_handoff_id');
    }
    if (reasons.length > 0) return { ok: false, reasons };
    return {
      ok: true,
      request: {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: raw.mode as 'temp' | 'operator',
        destination: raw.destination,
        expectedDestination: raw['expected-destination'],
        probeId: raw['probe-id'],
        handoffId: raw['handoff-id'],
        output,
      },
    };
  }

  for (const k of [
    'enabled',
    'confirm-setup',
    'mode',
    'destination',
    'expected-destination',
    'probe-id',
    'handoff-id',
  ]) {
    if (raw[k] !== undefined) reasons.push(`conflicting_flag_for_evaluate:${k}`);
  }
  for (const k of [
    'receipt-path',
    'final-evidence-path',
    'expected-receipt-sha256',
    'expected-receipt-byte-count',
    'expected-final-evidence-sha256',
    'expected-final-evidence-byte-count',
  ] as const) {
    if (raw[k] === undefined) reasons.push(`missing_flag:${k}`);
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const receiptSha = raw['expected-receipt-sha256'].toLowerCase();
  const finalSha = raw['expected-final-evidence-sha256'].toLowerCase();
  if (!SHA256_RE.test(receiptSha)) {
    reasons.push('expected_receipt_sha256_invalid');
  }
  if (!SHA256_RE.test(finalSha)) {
    reasons.push('expected_final_evidence_sha256_invalid');
  }
  const receiptCountRaw = raw['expected-receipt-byte-count'];
  const finalCountRaw = raw['expected-final-evidence-byte-count'];
  if (!/^[1-9][0-9]*$/.test(receiptCountRaw)) {
    reasons.push('expected_receipt_byte_count_invalid');
  }
  if (!/^[1-9][0-9]*$/.test(finalCountRaw)) {
    reasons.push('expected_final_evidence_byte_count_invalid');
  }
  if (!raw['receipt-path'].trim() || !path.isAbsolute(raw['receipt-path'])) {
    reasons.push('receipt_path_absolute_required');
  }
  if (
    !raw['final-evidence-path'].trim() ||
    !path.isAbsolute(raw['final-evidence-path'])
  ) {
    reasons.push('final_evidence_path_absolute_required');
  }
  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    request: {
      command: 'evaluate',
      receiptPath: raw['receipt-path'],
      finalEvidencePath: raw['final-evidence-path'],
      expectedReceiptSha256: receiptSha,
      expectedReceiptByteCount: Number(receiptCountRaw),
      expectedFinalEvidenceSha256: finalSha,
      expectedFinalEvidenceByteCount: Number(finalCountRaw),
      output,
    },
  };
}

/**
 * F2: validate exported runtime requests before any clock/FS activity.
 */
export function validateRuntimePhaseAJsonRequest(
  request: unknown
):
  | { ok: true; request: PhaseAJsonParsedRequest }
  | { ok: false; reasons: string[] } {
  if (request == null || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, reasons: ['runtime_request_not_object'] };
  }
  const r = request as Record<string, unknown>;
  if (r.command !== 'setup' && r.command !== 'evaluate') {
    return { ok: false, reasons: ['command_setup_or_evaluate_required'] };
  }

  const outputRaw = r.output;
  if (
    outputRaw == null ||
    typeof outputRaw !== 'object' ||
    Array.isArray(outputRaw)
  ) {
    return { ok: false, reasons: ['runtime_output_choice_required'] };
  }
  const o = outputRaw as Record<string, unknown>;
  const stdout = o.stdout === true;
  const captureFile =
    typeof o.captureFile === 'string' && o.captureFile.trim()
      ? o.captureFile
      : o.captureFile === null || o.captureFile === undefined
        ? null
        : null;
  if (o.captureFile !== undefined && o.captureFile !== null && typeof o.captureFile !== 'string') {
    return { ok: false, reasons: ['runtime_capture_file_invalid'] };
  }
  if (typeof o.captureFile === 'string' && !o.captureFile.trim()) {
    return { ok: false, reasons: ['json_capture_file_empty'] };
  }
  if (!stdout && !captureFile) {
    return {
      ok: false,
      reasons: ['output_choice_required_json_stdout_and_or_json_capture_file'],
    };
  }
  const output: PhaseAJsonOutputChoice = {
    stdout,
    captureFile: typeof o.captureFile === 'string' ? o.captureFile : null,
  };

  if (r.command === 'setup') {
    const reasons: string[] = [];
    if (r.enabled !== true) reasons.push('enabled_exact_true_required');
    if (r.confirmSetup !== true) reasons.push('confirm_setup_exact_true_required');
    if (r.mode !== 'temp' && r.mode !== 'operator') {
      reasons.push('mode_temp_or_operator_required');
    }
    if (typeof r.destination !== 'string' || !r.destination.trim()) {
      reasons.push('destination_required');
    }
    if (
      typeof r.expectedDestination !== 'string' ||
      !r.expectedDestination.trim()
    ) {
      reasons.push('expected_destination_required');
    }
    if (typeof r.probeId !== 'string' || !isSafeG4PreflightId(r.probeId)) {
      reasons.push('unsafe_or_missing_probe_id');
    }
    if (typeof r.handoffId !== 'string' || !isSafeG4PreflightId(r.handoffId)) {
      reasons.push('unsafe_or_missing_handoff_id');
    }
    if (reasons.length > 0) return { ok: false, reasons };
    return {
      ok: true,
      request: {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: r.mode as 'temp' | 'operator',
        destination: r.destination as string,
        expectedDestination: r.expectedDestination as string,
        probeId: r.probeId as string,
        handoffId: r.handoffId as string,
        output,
      },
    };
  }

  const reasons: string[] = [];
  if (typeof r.receiptPath !== 'string' || !path.isAbsolute(r.receiptPath)) {
    reasons.push('receipt_path_absolute_required');
  }
  if (
    typeof r.finalEvidencePath !== 'string' ||
    !path.isAbsolute(r.finalEvidencePath)
  ) {
    reasons.push('final_evidence_path_absolute_required');
  }
  const receiptSha =
    typeof r.expectedReceiptSha256 === 'string'
      ? r.expectedReceiptSha256.toLowerCase()
      : '';
  const finalSha =
    typeof r.expectedFinalEvidenceSha256 === 'string'
      ? r.expectedFinalEvidenceSha256.toLowerCase()
      : '';
  if (!SHA256_RE.test(receiptSha)) {
    reasons.push('expected_receipt_sha256_invalid');
  }
  if (!SHA256_RE.test(finalSha)) {
    reasons.push('expected_final_evidence_sha256_invalid');
  }
  if (
    typeof r.expectedReceiptByteCount !== 'number' ||
    !Number.isInteger(r.expectedReceiptByteCount) ||
    r.expectedReceiptByteCount < 1
  ) {
    reasons.push('expected_receipt_byte_count_invalid');
  }
  if (
    typeof r.expectedFinalEvidenceByteCount !== 'number' ||
    !Number.isInteger(r.expectedFinalEvidenceByteCount) ||
    r.expectedFinalEvidenceByteCount < 1
  ) {
    reasons.push('expected_final_evidence_byte_count_invalid');
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    request: {
      command: 'evaluate',
      receiptPath: r.receiptPath as string,
      finalEvidencePath: r.finalEvidencePath as string,
      expectedReceiptSha256: receiptSha,
      expectedReceiptByteCount: r.expectedReceiptByteCount as number,
      expectedFinalEvidenceSha256: finalSha,
      expectedFinalEvidenceByteCount: r.expectedFinalEvidenceByteCount as number,
      output,
    },
  };
}

/**
 * Capture path gates (Node-level). Creates nothing.
 * Outside entire operator USER root when provided.
 * Outside every evidenceTreeRoot (F1: complete g4 tree, not just filenames).
 */
export function validateCapturePath(input: {
  captureFile: string;
  operatorUserRoot: string | null;
  evidenceTreeRoots?: string[];
  protectedPaths?: string[];
}): { ok: true; abs: string } | { ok: false; reasons: string[] } {
  const absReq = requireAbsoluteDestination(input.captureFile);
  if (absReq.ok === false) {
    return { ok: false, reasons: [`capture_${absReq.reason}`] };
  }
  const abs = absReq.abs;
  const parent = path.dirname(abs);
  if (!fs.existsSync(parent)) {
    return { ok: false, reasons: ['capture_parent_missing'] };
  }
  if (isSymlinkOrJunction(parent)) {
    return { ok: false, reasons: ['capture_parent_symlink'] };
  }
  if (fs.existsSync(abs)) {
    return { ok: false, reasons: ['capture_path_exists'] };
  }
  const anc = validateExistingAncestors(abs);
  if (!anc.ok) {
    return { ok: false, reasons: anc.reasons.map((r) => `capture_${r}`) };
  }

  let captureResolved: string;
  try {
    const parentReal = fs.realpathSync(parent);
    captureResolved = path.join(parentReal, path.basename(abs));
  } catch (e) {
    return {
      ok: false,
      reasons: [`capture_identity_unresolved:${redactError(e)}`],
    };
  }

  if (input.operatorUserRoot) {
    const rootAbs = requireAbsoluteDestination(input.operatorUserRoot);
    if (rootAbs.ok === false) {
      return { ok: false, reasons: [`operator_root_${rootAbs.reason}`] };
    }
    if (
      pathUnderOrEqual(captureResolved, rootAbs.abs) ||
      pathUnderOrEqual(abs, rootAbs.abs)
    ) {
      return { ok: false, reasons: ['capture_inside_operator_user_root'] };
    }
    // Also forbid under derived g4 base even if somehow outside user root label mismatch.
    const g4 = g4EvidenceBaseFromOperatorUserRoot(rootAbs.abs);
    if (
      pathUnderOrEqual(captureResolved, g4) ||
      pathUnderOrEqual(abs, g4)
    ) {
      return { ok: false, reasons: ['capture_inside_evidence_tree'] };
    }
  }

  for (const root of input.evidenceTreeRoots ?? []) {
    if (!root) continue;
    const rootAbs = path.resolve(root);
    if (
      pathUnderOrEqual(captureResolved, rootAbs) ||
      pathUnderOrEqual(abs, rootAbs)
    ) {
      return { ok: false, reasons: ['capture_inside_evidence_tree'] };
    }
  }

  for (const p of input.protectedPaths ?? []) {
    if (!p) continue;
    try {
      const prot = path.resolve(p);
      if (
        canonicalizePathForCompare(prot) === canonicalizePathForCompare(abs) ||
        canonicalizePathForCompare(prot) ===
          canonicalizePathForCompare(captureResolved)
      ) {
        return { ok: false, reasons: ['capture_aliases_evidence_path'] };
      }
      if (fs.existsSync(prot)) {
        const protReal = fs.realpathSync(prot);
        if (
          canonicalizePathForCompare(protReal) ===
          canonicalizePathForCompare(captureResolved)
        ) {
          return { ok: false, reasons: ['capture_aliases_evidence_path'] };
        }
      }
    } catch (e) {
      return {
        ok: false,
        reasons: [`capture_protected_path_unresolved:${redactError(e)}`],
      };
    }
  }

  return { ok: true, abs: captureResolved };
}

function reserveCaptureFile(
  abs: string
):
  | { ok: true; abs: string; fd: number }
  | { ok: false; reasons: string[] } {
  try {
    if (fs.existsSync(abs)) {
      return { ok: false, reasons: ['capture_path_exists'] };
    }
    const fd = fs.openSync(abs, 'wx');
    return { ok: true, abs, fd };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'EEXIST') {
      return { ok: false, reasons: ['capture_path_exists'] };
    }
    return { ok: false, reasons: [`capture_open_failed:${redactError(e)}`] };
  }
}

function closeFdQuiet(fd: number | null | undefined): void {
  if (fd == null) return;
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }
}

function writeThroughReservedFd(
  fd: number,
  abs: string,
  text: string,
  deps: PhaseAJsonCommandDeps
):
  | { ok: true; sha256: string; byteCount: number }
  | {
      ok: false;
      reasons: string[];
      sha256: string | null;
      byteCount: number | null;
    } {
  const buf = Buffer.from(text, 'utf8');
  try {
    if (deps.injectAfterSetupBeforeCaptureWrite) {
      closeFdQuiet(fd);
      return {
        ok: false,
        reasons: ['inject_failure_after_setup_before_capture_write'],
        sha256: null,
        byteCount: null,
      };
    }
    let offset = 0;
    while (offset < buf.length) {
      const n = fs.writeSync(fd, buf, offset, buf.length - offset);
      if (!Number.isFinite(n) || n < 0) {
        closeFdQuiet(fd);
        return {
          ok: false,
          reasons: ['capture_write_invalid_byte_count'],
          sha256: null,
          byteCount: null,
        };
      }
      if (n === 0) {
        closeFdQuiet(fd);
        return {
          ok: false,
          reasons: [`capture_write_zero_progress_at_offset_${offset}`],
          sha256: null,
          byteCount: null,
        };
      }
      offset += n;
    }
    if (deps.injectCaptureCloseFailure) {
      closeFdQuiet(fd);
      return {
        ok: false,
        reasons: ['inject_capture_close_failure'],
        sha256: null,
        byteCount: null,
      };
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (e) {
    closeFdQuiet(fd);
    return {
      ok: false,
      reasons: [`capture_write_failed:${redactError(e)}`],
      sha256: null,
      byteCount: null,
    };
  }

  if (deps.injectCaptureReadbackFailure) {
    return {
      ok: false,
      reasons: ['inject_capture_readback_failure'],
      sha256: null,
      byteCount: null,
    };
  }

  try {
    const retained = fs.readFileSync(abs);
    const sha = sha256Buffer(retained);
    if (!retained.equals(buf)) {
      return {
        ok: false,
        reasons: ['capture_readback_mismatch'],
        sha256: sha,
        byteCount: retained.length,
      };
    }
    return { ok: true, sha256: sha, byteCount: retained.length };
  } catch (e) {
    return {
      ok: false,
      reasons: [`capture_readback_failed:${redactError(e)}`],
      sha256: null,
      byteCount: null,
    };
  }
}

function enrichFinalEvidenceByteCount(setup: MlCal1G4PhaseASetupResult): {
  setup: MlCal1G4PhaseASetupResult & { finalEvidenceByteCount: number | null };
  reasons: string[];
} {
  const reasons: string[] = [];
  let finalEvidenceByteCount: number | null = null;

  if (setup.finalEvidencePath && setup.finalEvidenceSha256) {
    try {
      if (isSymlinkOrJunction(setup.finalEvidencePath)) {
        reasons.push('final_evidence_bytecount_path_symlink');
      } else {
        const bytes = fs.readFileSync(setup.finalEvidencePath);
        const sha = sha256Buffer(bytes);
        if (sha !== setup.finalEvidenceSha256.toLowerCase()) {
          reasons.push('final_evidence_bytecount_digest_mismatch');
        } else {
          finalEvidenceByteCount = bytes.length;
        }
      }
    } catch (e) {
      reasons.push(`final_evidence_bytecount_read_failed:${redactError(e)}`);
    }
  } else if (setup.ok) {
    reasons.push('final_evidence_bytecount_missing_path_or_digest');
  }

  if (setup.setupReceiptPath && setup.setupReceiptSha256) {
    try {
      if (!isSymlinkOrJunction(setup.setupReceiptPath)) {
        const bytes = fs.readFileSync(setup.setupReceiptPath);
        const sha = sha256Buffer(bytes);
        if (sha !== setup.setupReceiptSha256.toLowerCase()) {
          reasons.push('setup_receipt_enrichment_digest_mismatch');
        } else if (
          setup.setupReceiptByteCount != null &&
          setup.setupReceiptByteCount !== bytes.length
        ) {
          reasons.push('setup_receipt_enrichment_bytecount_mismatch');
        }
      }
    } catch (e) {
      reasons.push(`setup_receipt_enrichment_read_failed:${redactError(e)}`);
    }
  }

  return { setup: { ...setup, finalEvidenceByteCount }, reasons };
}

/**
 * Emit durable JSON (ok/outputOk forced false). In-memory result may set
 * ok/outputOk true only after all requested channels succeed.
 */
function emitDurableJson(input: {
  operationEnvelope: PhaseAJsonCommandEnvelope;
  output: PhaseAJsonOutputChoice;
  reserved: { abs: string; fd: number } | null;
  deps: PhaseAJsonCommandDeps;
  stderrLines: string[];
}): PhaseAJsonCommandResult {
  const channelReasons: string[] = [];
  let reserved = input.reserved;
  let capturePath = reserved?.abs ?? input.operationEnvelope.capturePath;
  let captureResidue: string | null = null;

  let text: string;
  try {
    if (input.deps.injectSerializeFailure) {
      throw new Error('inject_serialize_failure');
    }
    const durable = durableSerializeEnvelope({
      ...input.operationEnvelope,
      capturePath,
      ok: false,
      outputOk: false,
    });
    text = `${JSON.stringify(durable, null, 2)}\n`;
  } catch (e) {
    closeFdQuiet(reserved?.fd);
    if (reserved?.abs) {
      captureResidue = reserved.abs;
      capturePath = reserved.abs;
    }
    reserved = null;
    const envelope = baseEnvelope({
      ...input.operationEnvelope,
      reasons: [
        ...input.operationEnvelope.reasons,
        `serialize_failed:${redactError(e)}`,
      ],
      notes: [
        ...input.operationEnvelope.notes,
        'serialize_exception_owned_capture_closed',
      ],
      capturePath,
      captureResidue,
      ok: false,
      outputOk: false,
      operationOk: input.operationEnvelope.operationOk,
    });
    return refusalResult(envelope, input.stderrLines);
  }

  const textSha = sha256Buffer(Buffer.from(text, 'utf8'));
  const textBytes = Buffer.byteLength(text, 'utf8');

  let captureOk = !input.output.captureFile;
  let stdoutOk = !input.output.stdout;

  if (reserved) {
    const abs = reserved.abs;
    const w = writeThroughReservedFd(reserved.fd, abs, text, input.deps);
    reserved = null;
    capturePath = abs;
    if (w.ok === false) {
      captureOk = false;
      channelReasons.push(...w.reasons);
      captureResidue = abs;
      input.stderrLines.push(
        `capture_failed owned_path=${abs}; setupSucceeded=${String(input.operationEnvelope.setupSucceeded)}; operationOk=${String(input.operationEnvelope.operationOk)}`
      );
      input.stderrLines.push('stderr_json_fallback_begin');
      // Fallback must also refuse command success claims (F3).
      input.stderrLines.push(text);
      input.stderrLines.push('stderr_json_fallback_end');
    } else {
      captureOk = true;
    }
  }

  if (input.output.stdout) {
    try {
      const writer =
        input.deps.writeStdout ??
        ((t: string) => defaultStdoutWrite(t, input.deps));
      const w = writer(text);
      if (w.ok === false) {
        stdoutOk = false;
        channelReasons.push(w.reason);
        input.stderrLines.push(`stdout_emit_failed:${w.reason}`);
        input.stderrLines.push('stderr_json_fallback_begin');
        input.stderrLines.push(text);
        input.stderrLines.push('stderr_json_fallback_end');
      } else {
        stdoutOk = true;
      }
    } catch (e) {
      // F5: do not re-invoke the failing writer; keep stderr-only fallback.
      stdoutOk = false;
      const reason = `stdout_emit_threw:${redactError(e)}`;
      channelReasons.push(reason);
      input.stderrLines.push(reason);
      input.stderrLines.push('stderr_json_fallback_begin');
      input.stderrLines.push(text);
      input.stderrLines.push('stderr_json_fallback_end');
    }
  }

  const outputOk = captureOk && stdoutOk && channelReasons.length === 0;
  const commandOk = input.operationEnvelope.operationOk && outputOk;

  // In-memory envelope may claim success; durable text does not.
  const memoryEnvelope = baseEnvelope({
    ...input.operationEnvelope,
    capturePath,
    captureResidue,
    writtenPayloadSha256: textSha,
    writtenPayloadByteCount: textBytes,
    outputOk,
    ok: commandOk,
    reasons: [...input.operationEnvelope.reasons, ...channelReasons],
    notes: [
      ...input.operationEnvelope.notes,
      `capture_emitted=${captureOk}`,
      `stdout_emitted=${stdoutOk}`,
      'durable_json_keeps_ok_and_outputOk_false',
    ],
  });

  return {
    envelope: memoryEnvelope,
    exitCode: commandOk ? 0 : 1,
    jsonText: text,
    stderrLines: input.stderrLines,
  };
}

function runSetupCommand(
  request: PhaseAJsonSetupRequest,
  deps: PhaseAJsonCommandDeps
): PhaseAJsonCommandResult {
  const stderrLines: string[] = [];
  let reserved: { abs: string; fd: number } | null = null;
  let setupInvoked = false;
  let setupSucceededAfterException: boolean | null = null;

  try {
    const expectedAbs = requireAbsoluteDestination(request.expectedDestination);
    const actualAbs = requireAbsoluteDestination(request.destination);
    if (expectedAbs.ok === false || actualAbs.ok === false) {
      return refusalResult(
        baseEnvelope({
          command: 'setup',
          reasons: [
            ...(expectedAbs.ok === false
              ? [`expected_${expectedAbs.reason}`]
              : []),
            ...(actualAbs.ok === false ? [`actual_${actualAbs.reason}`] : []),
          ],
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }
    if (
      canonicalizePathForCompare(expectedAbs.abs) !==
      canonicalizePathForCompare(actualAbs.abs)
    ) {
      return refusalResult(
        baseEnvelope({
          command: 'setup',
          reasons: ['operator_root_binding_mismatch'],
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }

    if (request.output.captureFile) {
      const cap = validateCapturePath({
        captureFile: request.output.captureFile,
        operatorUserRoot: actualAbs.abs,
        evidenceTreeRoots: [
          g4EvidenceBaseFromOperatorUserRoot(actualAbs.abs),
        ],
      });
      if (cap.ok === false) {
        return refusalResult(
          baseEnvelope({
            command: 'setup',
            reasons: cap.reasons,
            setupInvoked: false,
          }),
          stderrLines,
          { alsoStdout: request.output.stdout, deps }
        );
      }
      const res = reserveCaptureFile(cap.abs);
      if (res.ok === false) {
        return refusalResult(
          baseEnvelope({
            command: 'setup',
            reasons: res.reasons,
            setupInvoked: false,
            capturePath: cap.abs,
          }),
          stderrLines,
          { alsoStdout: request.output.stdout, deps }
        );
      }
      reserved = { abs: res.abs, fd: res.fd };
    }

    const runSetup = deps.runSetup ?? runG4PhaseARetentionSetup;
    setupInvoked = true;
    const setupRaw = runSetup({
      enabled: true,
      confirmSetup: true,
      mode: request.mode,
      expectedOperatorUserRoot: expectedAbs.abs,
      actualOperatorUserRoot: actualAbs.abs,
      probeId: request.probeId,
      handoffId: request.handoffId,
      now: deps.now ?? (() => new Date()),
    });
    setupSucceededAfterException = setupRaw.ok === true;
    const enriched = enrichFinalEvidenceByteCount(setupRaw);
    const setupSucceeded = setupRaw.ok === true;
    const enrichFail = enriched.reasons.length > 0 && setupSucceeded;
    const operationOk = setupSucceeded && !enrichFail;

    const operationEnvelope = baseEnvelope({
      command: 'setup',
      ok: false,
      outputOk: false,
      operationOk,
      setupSucceeded,
      reasons: [
        ...setupRaw.reasons,
        ...(enrichFail ? enriched.reasons : []),
      ],
      notes: [
        ...setupRaw.notes,
        'json_command_setup_capture_v1',
        'w4_w9_not_implemented_by_this_command',
        'windows_physical_volume_cloud_acl_unproven',
      ],
      setup: enriched.setup,
      capturePath: reserved?.abs ?? null,
      setupInvoked: true,
    });

    return emitDurableJson({
      operationEnvelope,
      output: request.output,
      reserved,
      deps,
      stderrLines,
    });
  } catch (e) {
    const residue = reserved?.abs ?? null;
    closeFdQuiet(reserved?.fd);
    return refusalResult(
      baseEnvelope({
        command: 'setup',
        reasons: [`setup_command_exception:${redactError(e)}`],
        notes: [
          'exception_path_owned_capture_closed',
          'diagnostic_skip_stdout_writer_after_exception',
        ],
        capturePath: residue,
        captureResidue: residue,
        setupInvoked,
        setupSucceeded: setupSucceededAfterException,
        operationOk: false,
      }),
      stderrLines,
      // F5: never retry a throwing stdout writer from its failure handler.
      { alsoStdout: false, skipStdoutWriter: true, deps }
    );
  }
}

function runEvaluateCommand(
  request: PhaseAJsonEvaluateRequest,
  deps: PhaseAJsonCommandDeps
): PhaseAJsonCommandResult {
  const stderrLines: string[] = [];
  let reserved: { abs: string; fd: number } | null = null;

  try {
    const receiptAbs = requireAbsoluteDestination(request.receiptPath);
    const finalAbs = requireAbsoluteDestination(request.finalEvidencePath);
    if (receiptAbs.ok === false || finalAbs.ok === false) {
      return refusalResult(
        baseEnvelope({
          command: 'evaluate',
          reasons: [
            ...(receiptAbs.ok === false
              ? [`receipt_${receiptAbs.reason}`]
              : []),
            ...(finalAbs.ok === false ? [`final_${finalAbs.reason}`] : []),
          ],
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }

    // F1: missing receipt/final must refuse BEFORE capture reservation so a
    // capture path inside an existing G4 tree cannot be created on miss.
    const missingInputReasons: string[] = [];
    if (!fs.existsSync(receiptAbs.abs)) {
      missingInputReasons.push('receipt_missing');
    }
    if (!fs.existsSync(finalAbs.abs)) {
      missingInputReasons.push('final_evidence_missing');
    }
    if (missingInputReasons.length > 0) {
      return refusalResult(
        baseEnvelope({
          command: 'evaluate',
          reasons: missingInputReasons,
          notes: [
            'missing_evidence_inputs_refused_before_capture_reservation',
          ],
          evaluatorInvoked: false,
          setupInvoked: false,
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }

    // F1: resolve physical identities before capture reservation. Reject
    // symlink/junction components on existing input paths; protect physical roots.
    const evidenceTrees = new Set<string>();
    const protectedPhysical: string[] = [];

    const receiptPhys = resolvePhysicalEvidenceArtifact(receiptAbs.abs);
    if (receiptPhys.ok === false) {
      return refusalResult(
        baseEnvelope({
          command: 'evaluate',
          reasons: receiptPhys.reasons.map((r) => `receipt_${r}`),
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }
    const receiptPhysicalAbs = receiptPhys.physicalAbs;
    protectedPhysical.push(receiptPhys.physicalAbs);
    evidenceTrees.add(receiptPhys.physicalDir);
    {
      const g4 = inferG4EvidenceBaseFromArtifact(receiptPhys.physicalAbs);
      if (g4) {
        try {
          evidenceTrees.add(fs.realpathSync(g4));
        } catch {
          evidenceTrees.add(path.resolve(g4));
        }
      }
    }

    const finalPhys = resolvePhysicalEvidenceArtifact(finalAbs.abs);
    if (finalPhys.ok === false) {
      return refusalResult(
        baseEnvelope({
          command: 'evaluate',
          reasons: finalPhys.reasons.map((r) => `final_${r}`),
        }),
        stderrLines,
        { alsoStdout: request.output.stdout, deps }
      );
    }
    const finalPhysicalAbs = finalPhys.physicalAbs;
    protectedPhysical.push(finalPhys.physicalAbs);
    evidenceTrees.add(finalPhys.physicalDir);
    {
      const g4 = inferG4EvidenceBaseFromArtifact(finalPhys.physicalAbs);
      if (g4) {
        try {
          evidenceTrees.add(fs.realpathSync(g4));
        } catch {
          evidenceTrees.add(path.resolve(g4));
        }
      }
    }

    if (request.output.captureFile) {
      const cap = validateCapturePath({
        captureFile: request.output.captureFile,
        operatorUserRoot: null,
        evidenceTreeRoots: [...evidenceTrees],
        protectedPaths: [
          receiptAbs.abs,
          finalAbs.abs,
          receiptPhysicalAbs,
          finalPhysicalAbs,
          ...protectedPhysical,
        ],
      });
      if (cap.ok === false) {
        return refusalResult(
          baseEnvelope({
            command: 'evaluate',
            reasons: cap.reasons,
          }),
          stderrLines,
          { alsoStdout: request.output.stdout, deps }
        );
      }
      // Capture must also not land under any physical evidence root after resolve.
      for (const root of evidenceTrees) {
        if (pathUnderOrEqual(cap.abs, root)) {
          return refusalResult(
            baseEnvelope({
              command: 'evaluate',
              reasons: ['capture_inside_evidence_tree'],
            }),
            stderrLines,
            { alsoStdout: request.output.stdout, deps }
          );
        }
      }
      const res = reserveCaptureFile(cap.abs);
      if (res.ok === false) {
        return refusalResult(
          baseEnvelope({
            command: 'evaluate',
            reasons: res.reasons,
            capturePath: cap.abs,
          }),
          stderrLines,
          { alsoStdout: request.output.stdout, deps }
        );
      }
      reserved = { abs: res.abs, fd: res.fd };
    }

    const evaluate =
      deps.evaluate ?? evaluatePhaseASetupReceiptForTerminalSuccess;
    const evaluation = evaluate({
      receiptPath: receiptPhysicalAbs,
      finalEvidencePath: finalPhysicalAbs,
      externalAnchor: {
        expectedReceiptSha256: request.expectedReceiptSha256,
        expectedFinalEvidenceSha256: request.expectedFinalEvidenceSha256,
      },
    });

    const byteCountChecks: PhaseAJsonByteCountChecks = {
      receiptByteCountMatch:
        evaluation.receiptByteCount === request.expectedReceiptByteCount,
      finalEvidenceByteCountMatch:
        evaluation.finalEvidenceByteCount ===
        request.expectedFinalEvidenceByteCount,
      expectedReceiptByteCount: request.expectedReceiptByteCount,
      actualReceiptByteCount: evaluation.receiptByteCount,
      expectedFinalEvidenceByteCount: request.expectedFinalEvidenceByteCount,
      actualFinalEvidenceByteCount: evaluation.finalEvidenceByteCount,
      stableAcrossReread: false,
    };

    const rereadReasons: string[] = [];
    try {
      const rBytes = fs.readFileSync(receiptPhysicalAbs);
      const fBytes = fs.readFileSync(finalPhysicalAbs);
      const rSha = sha256Buffer(rBytes);
      const fSha = sha256Buffer(fBytes);
      if (rSha !== (evaluation.receiptSha256 ?? '')) {
        rereadReasons.push('receipt_changed_across_readback');
      }
      if (fSha !== (evaluation.finalEvidenceSha256 ?? '')) {
        rereadReasons.push('final_evidence_changed_across_readback');
      }
      if (rBytes.length !== evaluation.receiptByteCount) {
        rereadReasons.push('receipt_bytecount_changed_across_readback');
      }
      if (fBytes.length !== evaluation.finalEvidenceByteCount) {
        rereadReasons.push('final_evidence_bytecount_changed_across_readback');
      }
      if (rBytes.length !== request.expectedReceiptByteCount) {
        byteCountChecks.receiptByteCountMatch = false;
      }
      if (fBytes.length !== request.expectedFinalEvidenceByteCount) {
        byteCountChecks.finalEvidenceByteCountMatch = false;
      }
      byteCountChecks.stableAcrossReread = rereadReasons.length === 0;
    } catch (e) {
      rereadReasons.push(`reread_failed:${redactError(e)}`);
      byteCountChecks.stableAcrossReread = false;
    }

    const countReasons: string[] = [];
    if (!byteCountChecks.receiptByteCountMatch) {
      countReasons.push('external_receipt_byte_count_mismatch');
    }
    if (!byteCountChecks.finalEvidenceByteCountMatch) {
      countReasons.push('external_final_evidence_byte_count_mismatch');
    }

    const evaluationSucceeded =
      evaluation.ok === true &&
      evaluation.terminalSuccess === true &&
      evaluation.internallyConsistent === true &&
      evaluation.externallyAnchored === true &&
      byteCountChecks.receiptByteCountMatch &&
      byteCountChecks.finalEvidenceByteCountMatch &&
      byteCountChecks.stableAcrossReread &&
      rereadReasons.length === 0;

    const operationEnvelope = baseEnvelope({
      command: 'evaluate',
      ok: false,
      outputOk: false,
      operationOk: evaluationSucceeded,
      evaluationSucceeded,
      reasons: [...evaluation.reasons, ...countReasons, ...rereadReasons],
      notes: [
        'json_command_evaluate_readonly_v1',
        'caller_must_retain_anchors_independently',
        'anchored_evaluation_is_not_research_approval',
        'w4_w9_not_implemented_by_this_command',
      ],
      evaluation,
      byteCountChecks,
      capturePath: reserved?.abs ?? null,
      evaluatorInvoked: true,
    });

    return emitDurableJson({
      operationEnvelope,
      output: request.output,
      reserved,
      deps,
      stderrLines,
    });
  } catch (e) {
    const residue = reserved?.abs ?? null;
    closeFdQuiet(reserved?.fd);
    return refusalResult(
      baseEnvelope({
        command: 'evaluate',
        reasons: [`evaluate_command_exception:${redactError(e)}`],
        notes: [
          'exception_path_owned_capture_closed',
          'diagnostic_skip_stdout_writer_after_exception',
        ],
        capturePath: residue,
        captureResidue: residue,
      }),
      stderrLines,
      { alsoStdout: false, skipStdoutWriter: true, deps }
    );
  }
}

/**
 * Exported runner. Validates runtime request (F2) before any clock/FS.
 */
export function runPhaseAJsonCommand(
  request: unknown,
  deps: PhaseAJsonCommandDeps = {}
): PhaseAJsonCommandResult {
  const validated = validateRuntimePhaseAJsonRequest(request);
  if (validated.ok === false) {
    return refusalResult(
      baseEnvelope({
        reasons: validated.reasons,
        notes: [
          'runtime_validation_failed_no_operation_no_capture_reservation',
        ],
      }),
      []
    );
  }
  if (validated.request.command === 'setup') {
    return runSetupCommand(validated.request, deps);
  }
  return runEvaluateCommand(validated.request, deps);
}

/**
 * Argv entry. Parse failures: no FS/clock/capture reservation.
 */
export function mainPhaseAJsonCommandFromArgv(
  argv: string[],
  deps: PhaseAJsonCommandDeps = {}
): PhaseAJsonCommandResult {
  const parsed = parsePhaseAJsonCommandArgv(argv);
  if (parsed.ok === false) {
    const wantsStdout = argv.some((a) => a === '--json-stdout=true');
    return refusalResult(
      baseEnvelope({
        reasons: parsed.reasons,
        notes: ['parse_failed_no_operation_no_capture_reservation'],
      }),
      [],
      { alsoStdout: wantsStdout, deps }
    );
  }
  return runPhaseAJsonCommand(parsed.request, deps);
}
