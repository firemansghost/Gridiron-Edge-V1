/**
 * ML-CAL-1 G4 pooler preflight — fixture-only runner + package validator.
 *
 * Metadata-only TX sequencing against an injected mock adapter.
 * No Prisma client, real DB adapter, credentials, providers, or live mode.
 * Seals R-LOCAL-FS layout under fixture temporary roots only.
 *
 * Design: research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md
 * Design SHA-256 (git/LF canonical): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 * Prior CRLF working-tree report: d4d75759a1c347f81f84082f8963bb110760a32e24c0e832e70f5cceb692ca67
 * Base G5-PRE tip: 1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  sha256Utf8Bytes,
  stableStringify,
} from './ml-cal-1-lifecycle-binding';
import { isSafeG4ObservationId } from './ml-cal-1-lifecycle-binding-observer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA =
  'ml-cal-1-g4-pooler-preflight-package-fixture-v1' as const;

export const ML_CAL_1_G4_PREFLIGHT_PROVENANCE_SCHEMA =
  'ml-cal-1-g4-pooler-preflight-provenance-fixture-v1' as const;

export const ML_CAL_1_G4_PREFLIGHT_RUN_METADATA_KIND =
  'g4-pooler-preflight-run-metadata' as const;

export const ML_CAL_1_G4_PREFLIGHT_TX_EVIDENCE_KIND =
  'g4-pooler-preflight-tx-evidence' as const;

export const ML_CAL_1_G4_PREFLIGHT_DESIGN_KIND =
  'g4-pooler-preflight-design-correspondence' as const;

export const ML_CAL_1_G4_PREFLIGHT_PROVENANCE_KIND =
  'g4-pooler-preflight-fixture-provenance' as const;

export const ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256 =
  '55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f' as const;

export const ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP =
  '1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25' as const;

export const ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE =
  'R-LOCAL-FS' as const;

export const ML_CAL_1_G4_PREFLIGHT_SUBTREES = [
  'preflight',
  'observations',
  'staging',
  'review-handoff',
] as const;

const REQUIRED_EVIDENCE_MEMBERS = [
  'preflight-run-metadata.json',
  'preflight-tx-evidence.json',
  'design-correspondence.json',
  'PROVENANCE.json',
] as const;

const SECRETISH =
  /(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-+\/=]{8,}|ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+|postgres(ql)?:\/\/\S+)/i;

const OPERATOR_ROOT_HINT =
  /([\\/]ml-cal-1[\\/]g4([\\/]|$)|OPERATOR_RESEARCH_RETAIN_ROOT)/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MlCal1G4PreflightTxMetadata {
  transactionIsolation: string;
  transactionReadOnly: string;
  transactionTimestamp: string;
  serverClockDiagnostics?: Record<string, string>;
}

/** Metadata-only client — no business-table SELECT. */
export interface MlCal1G4PreflightTxClient {
  setTransactionReadOnly(): Promise<void>;
  queryTransactionMetadata(): Promise<MlCal1G4PreflightTxMetadata>;
}

export interface MlCal1G4PreflightTxAdapter {
  withRepeatableReadTransaction<T>(
    fn: (client: MlCal1G4PreflightTxClient) => Promise<T>
  ): Promise<T>;
}

export interface MlCal1G4PreflightMockConfig {
  isolation?: string;
  readOnly?: string;
  transactionTimestamp?: string;
  serverClockDiagnostics?: Record<string, string>;
  failOnSetReadOnly?: boolean;
  failOnMetadata?: boolean;
  loseTransactionAfterMetadata?: boolean;
  failOnTransactionOpen?: boolean;
  timeoutBeforeMetadata?: boolean;
  malformedMetadata?: boolean;
  /** Return non-object / wrong-typed metadata for type-gate tests. */
  invalidMetadataShape?: 'null' | 'array' | 'non_string_fields';
}

export type MlCal1G4PreflightMode = 'fixture' | 'live';

export interface MlCal1G4PreflightRunInput {
  mode: MlCal1G4PreflightMode;
  preflightId: string;
  /** Fixture temporary retain root only (must be under os.tmpdir()). */
  retainRoot: string;
  txAdapter: MlCal1G4PreflightTxAdapter;
  now: () => Date;
  poolerProfileName?: string;
  authorityId?: string;
}

export interface MlCal1G4PreflightRunResult {
  ok: boolean;
  reasons: string[];
  notes: string[];
  preflightId: string;
  liveAccepted: false;
  approved: false;
  fixtureProvenance: true;
  packageDir: string | null;
  packageManifestSha256: string | null;
  memberDigests: Record<string, { sha256: string; byteCount: number }> | null;
  preflightStartTime: string | null;
  preflightEndTime: string | null;
  dbTransactionTime: string | null;
  readMode: 'fixture_injected' | null;
  terminalSuccess: boolean;
}

export interface MlCal1G4PreflightValidateResult {
  ok: boolean;
  reasons: string[];
  terminalSuccess: boolean;
  liveAccepted: false;
  approved: false;
  fixtureProvenance: boolean;
  manifestSha256: string | null;
  dbTransactionTime: string | null;
}

export type MlCal1G4PreflightSealResult =
  | {
      ok: true;
      packageDir: string;
      manifestSha256: string;
      memberDigests: Record<string, { sha256: string; byteCount: number }>;
      reasons: [];
    }
  | { ok: false; reasons: string[] };

/** Test hooks for publication visibility / mid-stage failure injection. */
export interface MlCal1G4PreflightSealHooks {
  onStagingReady?: (info: {
    stagingDir: string;
    finalDir: string;
    claimDir: string;
  }) => void | Promise<void>;
  onClaimAcquired?: (info: {
    stagingDir: string;
    finalDir: string;
    claimDir: string;
  }) => void | Promise<void>;
  /** Fail closed before atomic rename; final path must stay absent. */
  injectFailure?: 'after_staging' | 'after_claim';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIso(d: Date): string {
  return d.toISOString();
}

export function redactError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]')
    .replace(/authorization\s*:\s*bearer\s+[^\s]+/gi, 'Authorization: [redacted]')
    .replace(/bearer\s+[a-z0-9._\-+\/=]{8,}/gi, 'Bearer [redacted]')
    .replace(
      /(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|password|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,
      '$1=[redacted]'
    )
    .slice(0, 240);
}

export function isSafeG4PreflightId(value: unknown): value is string {
  return isSafeG4ObservationId(value);
}

function hasEscapedPathComponents(p: string): boolean {
  const norm = path.normalize(p);
  return norm.split(path.sep).some((c) => c === '..');
}

function isSymlinkOrJunction(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return true;
  }
}

function tmpRootReal(): string {
  return fs.realpathSync(os.tmpdir());
}

/**
 * Fixture retain roots must resolve under os.tmpdir(), with no symlink/junction
 * root or ancestor escape, and must not target operator research destinations.
 * Validates before any filesystem mutation when `mustExist` is false.
 */
export function assertFixtureRetainRoot(retainRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  const reasons: string[] = [];
  if (typeof retainRoot !== 'string' || retainRoot.trim() === '') {
    return { ok: false, reasons: ['retain_root_empty'], root: '' };
  }
  if (hasEscapedPathComponents(retainRoot)) {
    return {
      ok: false,
      reasons: ['retain_root_path_escape'],
      root: path.resolve(retainRoot),
    };
  }
  if (OPERATOR_ROOT_HINT.test(retainRoot)) {
    return {
      ok: false,
      reasons: ['operator_retain_root_forbidden'],
      root: path.resolve(retainRoot),
    };
  }

  const resolved = path.resolve(retainRoot);
  let tmpReal: string;
  try {
    tmpReal = tmpRootReal();
  } catch (e) {
    return {
      ok: false,
      reasons: [`tmpdir_unusable:${redactError(e)}`],
      root: resolved,
    };
  }

  // Reject symlink/junction at the retain root itself (if present).
  if (isSymlinkOrJunction(resolved)) {
    return {
      ok: false,
      reasons: ['retain_root_symlink'],
      root: resolved,
    };
  }

  // Walk ancestors that exist; reject symlink/junction components.
  let cur = resolved;
  for (;;) {
    if (fs.existsSync(cur) && isSymlinkOrJunction(cur)) {
      reasons.push('ancestor_symlink');
      break;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
    try {
      const parentReal = fs.existsSync(parent)
        ? fs.realpathSync(parent)
        : parent;
      if (
        parentReal !== tmpReal &&
        !parentReal.startsWith(tmpReal + path.sep) &&
        parentReal !== path.parse(parentReal).root
      ) {
        // Allow climbing until tmp; once outside tmp and not root, stop walk.
        if (!resolved.startsWith(tmpReal + path.sep) && resolved !== tmpReal) {
          // checked below via realpath containment
        }
      }
    } catch {
      reasons.push('ancestor_unreadable');
      break;
    }
    if (fs.existsSync(parent)) {
      try {
        if (fs.realpathSync(parent) === tmpReal) break;
      } catch {
        break;
      }
    }
  }

  let rootReal: string;
  try {
    if (fs.existsSync(resolved)) {
      rootReal = fs.realpathSync(resolved);
    } else {
      // Ensure nearest existing ancestor is under tmp.
      let parent = path.dirname(resolved);
      while (!fs.existsSync(parent)) {
        const next = path.dirname(parent);
        if (next === parent) break;
        parent = next;
      }
      const parentReal = fs.realpathSync(parent);
      if (
        parentReal !== tmpReal &&
        !parentReal.startsWith(tmpReal + path.sep)
      ) {
        return {
          ok: false,
          reasons: ['retain_root_outside_tmpdir'],
          root: resolved,
        };
      }
      rootReal = path.join(parentReal, path.relative(parent, resolved));
      // Normalize join for non-existing leaf
      rootReal = path.resolve(parentReal, path.relative(parent, resolved));
    }
  } catch (e) {
    return {
      ok: false,
      reasons: [`retain_root_resolve_failed:${redactError(e)}`],
      root: resolved,
    };
  }

  if (rootReal !== tmpReal && !rootReal.startsWith(tmpReal + path.sep)) {
    reasons.push('retain_root_outside_tmpdir');
  }
  if (OPERATOR_ROOT_HINT.test(rootReal)) {
    reasons.push('operator_retain_root_forbidden');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    root: fs.existsSync(resolved) ? rootReal : resolved,
  };
}

function assertWithinRoot(root: string, candidate: string): string {
  const rootGate = assertFixtureRetainRoot(root);
  if (!rootGate.ok) {
    throw new Error(rootGate.reasons[0] ?? 'path_escape');
  }
  const rootAbs = path.resolve(root);
  let rootReal: string;
  try {
    rootReal = fs.existsSync(rootAbs)
      ? fs.realpathSync(rootAbs)
      : rootGate.root;
  } catch {
    throw new Error('path_escape');
  }
  if (hasEscapedPathComponents(candidate)) {
    throw new Error('path_escape');
  }
  const candAbs = path.resolve(candidate);
  if (isSymlinkOrJunction(candAbs)) {
    throw new Error('path_escape');
  }
  let candReal: string;
  try {
    if (fs.existsSync(candAbs)) {
      candReal = fs.realpathSync(candAbs);
    } else {
      const parent = path.dirname(candAbs);
      if (!fs.existsSync(parent)) {
        // Walk up to existing ancestor inside root
        let p = parent;
        while (!fs.existsSync(p)) {
          const n = path.dirname(p);
          if (n === p) throw new Error('path_escape');
          p = n;
        }
        const parentReal = fs.realpathSync(p);
        if (
          parentReal !== rootReal &&
          !parentReal.startsWith(rootReal + path.sep)
        ) {
          throw new Error('path_escape');
        }
        candReal = path.resolve(candAbs);
        if (
          candReal !== rootReal &&
          !candReal.startsWith(rootReal + path.sep)
        ) {
          throw new Error('path_escape');
        }
        return candReal;
      }
      if (isSymlinkOrJunction(parent)) {
        throw new Error('path_escape');
      }
      const parentReal = fs.realpathSync(parent);
      if (
        parentReal !== rootReal &&
        !parentReal.startsWith(rootReal + path.sep)
      ) {
        throw new Error('path_escape');
      }
      candReal = path.join(parentReal, path.basename(candAbs));
    }
  } catch {
    throw new Error('path_escape');
  }
  if (candReal !== rootReal && !candReal.startsWith(rootReal + path.sep)) {
    throw new Error('path_escape');
  }
  return candReal;
}

function pathHasSymlinkComponent(root: string, target: string): boolean {
  const rootAbs = path.resolve(root);
  const targetAbs = path.resolve(target);
  let cur = rootAbs;
  const rel = path.relative(rootAbs, targetAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return true;
  const parts = rel.split(path.sep).filter(Boolean);
  for (const part of parts) {
    cur = path.join(cur, part);
    try {
      const st = fs.lstatSync(cur);
      if (st.isSymbolicLink()) return true;
    } catch {
      // missing — ok while building
    }
  }
  return false;
}

function scanSecretish(text: string): boolean {
  return SECRETISH.test(text);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function parseJsonObject(
  bytes: Buffer,
  label: string
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, reason: `${label}_parse_failed` };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: `${label}_not_object` };
  }
  return { ok: true, value: parsed };
}

function readInjectedClock(now: unknown):
  | { ok: true; date: Date; iso: string }
  | { ok: false; reason: string } {
  if (typeof now !== 'function') {
    return { ok: false, reason: 'injected_clock_not_function' };
  }
  let value: unknown;
  try {
    value = (now as () => unknown)();
  } catch (e) {
    return { ok: false, reason: `injected_clock_threw:${redactError(e)}` };
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return { ok: false, reason: 'injected_clock_invalid' };
  }
  if (!Number.isFinite(value.getTime())) {
    return { ok: false, reason: 'injected_clock_non_finite' };
  }
  return { ok: true, date: value, iso: value.toISOString() };
}

function validateRuntimeMetadata(meta: unknown): {
  ok: boolean;
  reasons: string[];
  value: MlCal1G4PreflightTxMetadata | null;
} {
  const reasons: string[] = [];
  if (meta === null || meta === undefined) {
    return { ok: false, reasons: ['transaction_metadata_missing'], value: null };
  }
  if (Array.isArray(meta)) {
    return { ok: false, reasons: ['transaction_metadata_not_object'], value: null };
  }
  if (!isPlainObject(meta)) {
    return { ok: false, reasons: ['transaction_metadata_not_object'], value: null };
  }
  const isolation = meta.transactionIsolation;
  const readOnly = meta.transactionReadOnly;
  const ts = meta.transactionTimestamp;
  if (typeof isolation !== 'string') {
    reasons.push('transaction_isolation_type_invalid');
  }
  if (typeof readOnly !== 'string') {
    reasons.push('transaction_read_only_type_invalid');
  }
  if (typeof ts !== 'string') {
    reasons.push('transaction_timestamp_type_invalid');
  }
  if (
    meta.serverClockDiagnostics !== undefined &&
    !isPlainObject(meta.serverClockDiagnostics)
  ) {
    reasons.push('server_clock_diagnostics_type_invalid');
  } else if (isPlainObject(meta.serverClockDiagnostics)) {
    for (const [k, v] of Object.entries(meta.serverClockDiagnostics)) {
      if (typeof k !== 'string' || typeof v !== 'string') {
        reasons.push('server_clock_diagnostics_entry_type_invalid');
        break;
      }
    }
  }
  if (reasons.length > 0) {
    return { ok: false, reasons, value: null };
  }
  return {
    ok: true,
    reasons: [],
    value: {
      transactionIsolation: isolation as string,
      transactionReadOnly: readOnly as string,
      transactionTimestamp: ts as string,
      serverClockDiagnostics: isPlainObject(meta.serverClockDiagnostics)
        ? (meta.serverClockDiagnostics as Record<string, string>)
        : undefined,
    },
  };
}

export function ensureRLocalFsLayout(retainRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  const gate = assertFixtureRetainRoot(retainRoot);
  if (!gate.ok) {
    return gate;
  }
  const reasons: string[] = [];
  const root = gate.root;
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      reasons: [`retain_root_unusable:${redactError(e)}`],
      root,
    };
  }
  // Re-check after create — refuse if root became a symlink.
  if (isSymlinkOrJunction(root)) {
    return { ok: false, reasons: ['retain_root_symlink'], root };
  }
  for (const sub of ML_CAL_1_G4_PREFLIGHT_SUBTREES) {
    const p = path.join(root, sub);
    try {
      assertWithinRoot(root, p);
      fs.mkdirSync(p, { recursive: true });
      if (pathHasSymlinkComponent(root, p) || isSymlinkOrJunction(p)) {
        reasons.push(`symlink_in_layout:${sub}`);
      }
      assertWithinRoot(root, p);
    } catch (e) {
      reasons.push(`layout_${sub}:${redactError(e)}`);
    }
  }
  const probe = path.join(root, 'staging', `.probe-${randomUUID()}`);
  try {
    assertWithinRoot(root, probe);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
  } catch (e) {
    reasons.push(`staging_not_writable:${redactError(e)}`);
  }
  return { ok: reasons.length === 0, reasons, root };
}

// ---------------------------------------------------------------------------
// Mock adapter (fixture)
// ---------------------------------------------------------------------------

export function createMockPreflightTxAdapter(
  config: MlCal1G4PreflightMockConfig = {}
): MlCal1G4PreflightTxAdapter {
  return {
    async withRepeatableReadTransaction(fn) {
      if (config.failOnTransactionOpen) {
        throw new Error('transaction_open_failed');
      }
      let readOnlySet = false;
      let aborted = false;
      let metadataReturned = false;
      const client: MlCal1G4PreflightTxClient = {
        async setTransactionReadOnly() {
          if (config.failOnSetReadOnly) {
            aborted = true;
            throw new Error('set_transaction_read_only_failed');
          }
          readOnlySet = true;
        },
        async queryTransactionMetadata() {
          if (aborted) throw new Error('transaction_lost');
          if (!readOnlySet) {
            throw new Error('read_only_not_set_before_metadata');
          }
          if (config.timeoutBeforeMetadata) {
            aborted = true;
            throw new Error('transaction_metadata_timeout');
          }
          if (config.failOnMetadata) {
            aborted = true;
            throw new Error('transaction_metadata_failed');
          }
          if (config.invalidMetadataShape === 'null') {
            metadataReturned = true;
            return null as unknown as MlCal1G4PreflightTxMetadata;
          }
          if (config.invalidMetadataShape === 'array') {
            metadataReturned = true;
            return ['repeatable read'] as unknown as MlCal1G4PreflightTxMetadata;
          }
          if (config.invalidMetadataShape === 'non_string_fields') {
            metadataReturned = true;
            return {
              transactionIsolation: 1,
              transactionReadOnly: true,
              transactionTimestamp: { t: 1 },
            } as unknown as MlCal1G4PreflightTxMetadata;
          }
          if (config.malformedMetadata) {
            metadataReturned = true;
            return {
              transactionIsolation: '',
              transactionReadOnly: '',
              transactionTimestamp: 'not-a-timestamp',
            };
          }
          const ts =
            config.transactionTimestamp ?? '2026-10-13T18:00:05.000Z';
          metadataReturned = true;
          if (config.loseTransactionAfterMetadata) {
            aborted = true;
          }
          return {
            transactionIsolation: config.isolation ?? 'repeatable read',
            transactionReadOnly: config.readOnly ?? 'on',
            transactionTimestamp: ts,
            serverClockDiagnostics: config.serverClockDiagnostics ?? {
              clock_timestamp: ts,
            },
          };
        },
      };
      const result = await fn(client);
      // F4: transaction-loss after metadata must reject completion.
      if (config.loseTransactionAfterMetadata && metadataReturned) {
        throw new Error('transaction_lost_after_metadata');
      }
      if (aborted && !metadataReturned) {
        throw new Error('transaction_lost');
      }
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// Seal / publish — verified staging dir, separate claim, atomic rename
// ---------------------------------------------------------------------------

function memberDigestsOf(
  members: Record<string, Buffer>
): Record<string, { sha256: string; byteCount: number }> {
  const out: Record<string, { sha256: string; byteCount: number }> = {};
  for (const [name, bytes] of Object.entries(members)) {
    out[name] = { sha256: sha256Buffer(bytes), byteCount: bytes.length };
  }
  return out;
}

function verifyMembersAgainstDigests(
  dir: string,
  digests: Record<string, { sha256: string; byteCount: number }>
): string[] {
  const reasons: string[] = [];
  for (const [name, meta] of Object.entries(digests)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) {
      reasons.push(`member_missing:${name}`);
      continue;
    }
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) {
      reasons.push(`member_symlink:${name}`);
      continue;
    }
    const bytes = fs.readFileSync(p);
    if (bytes.length !== meta.byteCount) {
      reasons.push(`member_bytecount_mismatch:${name}`);
    }
    if (sha256Buffer(bytes) !== meta.sha256.toLowerCase()) {
      reasons.push(`member_digest_mismatch:${name}`);
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      reasons.push(`member_secretish:${name}`);
    }
  }
  return reasons;
}

function claimDirExclusiveSync(claimDir: string): void {
  fs.mkdirSync(claimDir);
}

async function claimDirExclusiveAsync(claimDir: string): Promise<void> {
  await fs.promises.mkdir(claimDir);
}

function prepareSealMembers(input: {
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
}):
  | {
      ok: true;
      allMembers: Record<string, Buffer>;
      allDigests: Record<string, { sha256: string; byteCount: number }>;
      digests: Record<string, { sha256: string; byteCount: number }>;
      manifestSha256: string;
      manifestBytes: Buffer;
    }
  | { ok: false; reasons: string[] } {
  for (const [name, bytes] of Object.entries(input.members)) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return { ok: false, reasons: [`unsafe_member_name:${name}`] };
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      return { ok: false, reasons: [`member_secretish:${name}`] };
    }
  }
  const digests = memberDigestsOf(input.members);
  const manifestCore = {
    schemaVersion: ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA,
    kind: 'g4-pooler-preflight-package',
    preflightId: input.preflightId,
    sealedAt: input.sealedAt,
    liveAccepted: false as const,
    approved: false as const,
    credentialsPresent: false as const,
    fixtureProvenance: true as const,
    terminalSuccess: true as const,
    retentionProfile: ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
    memberDigests: digests,
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256,
    baseG5PreTip: ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP,
  };
  const manifestBytes = Buffer.from(
    `${stableStringify(manifestCore)}\n`,
    'utf8'
  );
  const manifestSha256 = sha256Buffer(manifestBytes);
  if (scanSecretish(manifestBytes.toString('utf8'))) {
    return { ok: false, reasons: ['manifest_secretish'] };
  }
  const allMembers: Record<string, Buffer> = {
    ...input.members,
    'PACKAGE_MANIFEST.json': manifestBytes,
    'PACKAGE_MANIFEST.sha256': Buffer.from(`${manifestSha256}\n`, 'utf8'),
  };
  return {
    ok: true,
    allMembers,
    allDigests: memberDigestsOf(allMembers),
    digests,
    manifestSha256,
    manifestBytes,
  };
}

function sealSuccess(
  finalDir: string,
  prepared: Extract<ReturnType<typeof prepareSealMembers>, { ok: true }>
): MlCal1G4PreflightSealResult {
  return {
    ok: true,
    packageDir: finalDir,
    manifestSha256: prepared.manifestSha256,
    memberDigests: {
      ...prepared.digests,
      'PACKAGE_MANIFEST.json': {
        sha256: prepared.manifestSha256,
        byteCount: prepared.manifestBytes.length,
      },
      'PACKAGE_MANIFEST.sha256':
        prepared.allDigests['PACKAGE_MANIFEST.sha256'],
    },
    reasons: [],
  };
}

/** @internal Exported for negative tests (wrong subtree / hooks). */
export function sealPreflightPackage(input: {
  retainRoot: string;
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
  subtree?: 'preflight' | 'observations';
  hooks?: MlCal1G4PreflightSealHooks;
}): MlCal1G4PreflightSealResult {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  if ((input.subtree ?? 'preflight') === 'observations') {
    return { ok: false, reasons: ['wrong_subtree_observations'] };
  }
  const gate = assertFixtureRetainRoot(input.retainRoot);
  if (!gate.ok) {
    return { ok: false, reasons: gate.reasons };
  }
  const root = gate.root;
  const preflightRoot = path.join(root, 'preflight');
  const stagingRoot = path.join(root, 'staging');
  const finalDir = path.join(preflightRoot, input.preflightId);
  const claimDir = path.join(stagingRoot, `.claim-${input.preflightId}`);
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.preflightId}-${randomUUID()}`
  );

  try {
    assertWithinRoot(root, finalDir);
    assertWithinRoot(root, stagingDir);
    assertWithinRoot(root, claimDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }

  if (
    pathHasSymlinkComponent(root, preflightRoot) ||
    pathHasSymlinkComponent(root, stagingRoot)
  ) {
    return { ok: false, reasons: ['symlink_in_layout_root'] };
  }

  if (fs.existsSync(finalDir)) {
    if (isSymlinkOrJunction(finalDir)) {
      return { ok: false, reasons: ['preflight_dest_symlink'] };
    }
    return { ok: false, reasons: ['preflight_package_exists'] };
  }

  const prepared = prepareSealMembers(input);
  if (prepared.ok === false) {
    return { ok: false, reasons: prepared.reasons };
  }

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const [name, bytes] of Object.entries(prepared.allMembers)) {
      const p = path.join(stagingDir, name);
      assertWithinRoot(root, p);
      fs.writeFileSync(p, bytes);
    }
    const stagedReasons = verifyMembersAgainstDigests(
      stagingDir,
      prepared.allDigests
    );
    if (stagedReasons.length > 0) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false, reasons: stagedReasons.map((r) => `staged_${r}`) };
    }

    const hookInfo = { stagingDir, finalDir, claimDir };
    if (input.hooks?.onStagingReady) {
      void input.hooks.onStagingReady(hookInfo);
    }
    if (input.hooks?.injectFailure === 'after_staging') {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false, reasons: ['inject_failure_after_staging'] };
    }

    // Exclusive ownership lock — separate from final package path.
    try {
      claimDirExclusiveSync(claimDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      if (code === 'EEXIST') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`publish_claim_failed:${redactError(e)}`],
      };
    }

    try {
      if (input.hooks?.onClaimAcquired) {
        void input.hooks.onClaimAcquired(hookInfo);
      }
      if (input.hooks?.injectFailure === 'after_claim') {
        return { ok: false, reasons: ['inject_failure_after_claim'] };
      }
      // Final path must still be absent — never expose incomplete package.
      if (fs.existsSync(finalDir)) {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      // Atomic publish of the complete verified staging directory.
      fs.renameSync(stagingDir, finalDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`atomic_publish_failed:${redactError(e)}`],
      };
    } finally {
      try {
        fs.rmSync(claimDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {
        /* ignore */
      }
    }

    if (!fs.existsSync(finalDir)) {
      return { ok: false, reasons: ['atomic_publish_missing_final'] };
    }
    const publishedReasons = verifyMembersAgainstDigests(
      finalDir,
      prepared.allDigests
    );
    if (publishedReasons.length > 0) {
      return {
        ok: false,
        reasons: publishedReasons.map((r) => `published_${r}`),
      };
    }
    return sealSuccess(finalDir, prepared);
  } catch (e) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(claimDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, reasons: [`seal_failed:${redactError(e)}`] };
  }
}

export async function sealPreflightPackageAsync(input: {
  retainRoot: string;
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
  subtree?: 'preflight' | 'observations';
  hooks?: MlCal1G4PreflightSealHooks;
}): Promise<MlCal1G4PreflightSealResult> {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  if ((input.subtree ?? 'preflight') === 'observations') {
    return { ok: false, reasons: ['wrong_subtree_observations'] };
  }
  const gate = assertFixtureRetainRoot(input.retainRoot);
  if (!gate.ok) {
    return { ok: false, reasons: gate.reasons };
  }
  const root = gate.root;
  const preflightRoot = path.join(root, 'preflight');
  const stagingRoot = path.join(root, 'staging');
  const finalDir = path.join(preflightRoot, input.preflightId);
  const claimDir = path.join(stagingRoot, `.claim-${input.preflightId}`);
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.preflightId}-${randomUUID()}`
  );
  try {
    assertWithinRoot(root, finalDir);
    assertWithinRoot(root, stagingDir);
    assertWithinRoot(root, claimDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }
  if (
    pathHasSymlinkComponent(root, preflightRoot) ||
    pathHasSymlinkComponent(root, stagingRoot)
  ) {
    return { ok: false, reasons: ['symlink_in_layout_root'] };
  }
  if (fs.existsSync(finalDir)) {
    if (isSymlinkOrJunction(finalDir)) {
      return { ok: false, reasons: ['preflight_dest_symlink'] };
    }
    return { ok: false, reasons: ['preflight_package_exists'] };
  }
  const prepared = prepareSealMembers(input);
  if (prepared.ok === false) {
    return { ok: false, reasons: prepared.reasons };
  }

  try {
    await fs.promises.mkdir(stagingDir, { recursive: true });
    for (const [name, bytes] of Object.entries(prepared.allMembers)) {
      const p = path.join(stagingDir, name);
      assertWithinRoot(root, p);
      await fs.promises.writeFile(p, bytes);
    }
    const stagedReasons = verifyMembersAgainstDigests(
      stagingDir,
      prepared.allDigests
    );
    if (stagedReasons.length > 0) {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      return { ok: false, reasons: stagedReasons.map((r) => `staged_${r}`) };
    }
    const hookInfo = { stagingDir, finalDir, claimDir };
    if (input.hooks?.onStagingReady) {
      await input.hooks.onStagingReady(hookInfo);
    }
    if (input.hooks?.injectFailure === 'after_staging') {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      return { ok: false, reasons: ['inject_failure_after_staging'] };
    }
    await Promise.resolve();
    try {
      await claimDirExclusiveAsync(claimDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      if (code === 'EEXIST') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`publish_claim_failed:${redactError(e)}`],
      };
    }
    try {
      if (input.hooks?.onClaimAcquired) {
        await input.hooks.onClaimAcquired(hookInfo);
      }
      if (input.hooks?.injectFailure === 'after_claim') {
        return { ok: false, reasons: ['inject_failure_after_claim'] };
      }
      if (fs.existsSync(finalDir)) {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      await fs.promises.rename(stagingDir, finalDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`atomic_publish_failed:${redactError(e)}`],
      };
    } finally {
      try {
        await fs.promises.rm(claimDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(stagingDir)) {
          await fs.promises.rm(stagingDir, { recursive: true, force: true });
        }
      } catch {
        /* ignore */
      }
    }
    if (!fs.existsSync(finalDir)) {
      return { ok: false, reasons: ['atomic_publish_missing_final'] };
    }
    const publishedReasons = verifyMembersAgainstDigests(
      finalDir,
      prepared.allDigests
    );
    if (publishedReasons.length > 0) {
      return {
        ok: false,
        reasons: publishedReasons.map((r) => `published_${r}`),
      };
    }
    return sealSuccess(finalDir, prepared);
  } catch (e) {
    try {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      await fs.promises.rm(claimDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, reasons: [`seal_failed:${redactError(e)}`] };
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runG4FixturePreflight(
  input: MlCal1G4PreflightRunInput
): Promise<MlCal1G4PreflightRunResult> {
  const notes: string[] = [];
  const reasons: string[] = [];
  let preflightStartTime: string | null = null;
  let preflightEndTime: string | null = null;
  let dbTransactionTime: string | null = null;
  const baseFail = (
    extra: string[]
  ): MlCal1G4PreflightRunResult => ({
    ok: false,
    reasons: [...new Set([...reasons, ...extra])],
    notes,
    preflightId:
      typeof input.preflightId === 'string' ? input.preflightId : '',
    liveAccepted: false,
    approved: false,
    fixtureProvenance: true,
    packageDir: null,
    packageManifestSha256: null,
    memberDigests: null,
    preflightStartTime,
    preflightEndTime,
    dbTransactionTime,
    readMode: 'fixture_injected',
    terminalSuccess: false,
  });

  if (input.mode !== 'fixture') {
    return baseFail(['live_mode_refused']);
  }
  if (!isSafeG4PreflightId(input.preflightId)) {
    return baseFail(['unsafe_preflight_id']);
  }

  const layout = ensureRLocalFsLayout(input.retainRoot);
  if (!layout.ok) {
    return baseFail(['retain_destination_unusable', ...layout.reasons]);
  }

  const startClock = readInjectedClock(input.now);
  if (startClock.ok === false) {
    return baseFail([startClock.reason]);
  }
  preflightStartTime = startClock.iso;

  let metaRaw: unknown = null;
  try {
    await input.txAdapter.withRepeatableReadTransaction(async (client) => {
      await client.setTransactionReadOnly();
      metaRaw = await client.queryTransactionMetadata();
    });
  } catch (e) {
    const endClock = readInjectedClock(input.now);
    if (endClock.ok) preflightEndTime = endClock.iso;
    return baseFail([`adapter_failed:${redactError(e)}`]);
  }

  const endClock = readInjectedClock(input.now);
  if (endClock.ok === false) {
    return baseFail([endClock.reason]);
  }
  preflightEndTime = endClock.iso;

  const typed = validateRuntimeMetadata(metaRaw);
  if (!typed.ok || !typed.value) {
    return baseFail(typed.reasons);
  }
  const meta = typed.value;

  const isolation = meta.transactionIsolation.toLowerCase();
  const readOnly = meta.transactionReadOnly.toLowerCase();
  if (isolation !== 'repeatable read') {
    reasons.push('isolation_not_repeatable_read');
  }
  if (readOnly !== 'on') {
    reasons.push('transaction_not_read_only');
  }

  const tDb = parseIsoMs(meta.transactionTimestamp);
  if (tDb == null) {
    reasons.push('db_transaction_time_invalid');
  } else {
    dbTransactionTime = meta.transactionTimestamp;
  }
  const tStart = parseIsoMs(preflightStartTime);
  const tEnd = parseIsoMs(preflightEndTime);
  if (tDb != null && tStart != null && tEnd != null) {
    if (!(tStart <= tDb && tDb <= tEnd)) {
      reasons.push('db_transaction_time_out_of_bounds');
    }
  } else if (tDb != null) {
    reasons.push('preflight_host_time_invalid');
  }

  if (reasons.length > 0) {
    return baseFail([]);
  }

  const runMetadata = {
    kind: ML_CAL_1_G4_PREFLIGHT_RUN_METADATA_KIND,
    preflightId: input.preflightId,
    authorityId: input.authorityId ?? 'fixture-authority',
    poolerProfileName: input.poolerProfileName ?? 'fixture-pooler-profile',
    preflightStartTime,
    preflightEndTime,
    dbTransactionTime,
    transactionIsolation: meta.transactionIsolation,
    transactionReadOnly: meta.transactionReadOnly,
    businessDataWrites: 0,
    providerCalls: 0,
    readMode: 'fixture_injected',
    terminalSuccess: true,
    liveAccepted: false,
    approved: false,
    fixtureProvenance: true,
  };
  const txEvidence = {
    kind: ML_CAL_1_G4_PREFLIGHT_TX_EVIDENCE_KIND,
    preflightId: input.preflightId,
    transactionIsolation: meta.transactionIsolation,
    transactionReadOnly: meta.transactionReadOnly,
    transactionTimestamp: meta.transactionTimestamp,
    serverClockDiagnostics: meta.serverClockDiagnostics ?? {},
    connectionStringPresent: false,
  };
  const designCorrespondence = {
    kind: ML_CAL_1_G4_PREFLIGHT_DESIGN_KIND,
    preflightId: input.preflightId,
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256,
    baseG5PreTip: ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP,
    retentionProfile: ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
    note: 'fixture-only preflight proof — not deployed pooler acceptance',
  };
  const provenance = {
    schemaVersion: ML_CAL_1_G4_PREFLIGHT_PROVENANCE_SCHEMA,
    kind: ML_CAL_1_G4_PREFLIGHT_PROVENANCE_KIND,
    preflightId: input.preflightId,
    fixtureProvenance: true,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
  };

  const members: Record<string, Buffer> = {
    'preflight-run-metadata.json': Buffer.from(
      `${stableStringify(runMetadata)}\n`,
      'utf8'
    ),
    'preflight-tx-evidence.json': Buffer.from(
      `${stableStringify(txEvidence)}\n`,
      'utf8'
    ),
    'design-correspondence.json': Buffer.from(
      `${stableStringify(designCorrespondence)}\n`,
      'utf8'
    ),
    'PROVENANCE.json': Buffer.from(`${stableStringify(provenance)}\n`, 'utf8'),
  };

  const sealed = sealPreflightPackage({
    retainRoot: layout.root,
    preflightId: input.preflightId,
    members,
    sealedAt: preflightEndTime,
  });

  if (!sealed.ok) {
    return baseFail(sealed.reasons);
  }

  return {
    ok: true,
    reasons: [],
    notes,
    preflightId: input.preflightId,
    liveAccepted: false,
    approved: false,
    fixtureProvenance: true,
    packageDir: sealed.packageDir,
    packageManifestSha256: sealed.manifestSha256,
    memberDigests: sealed.memberDigests,
    preflightStartTime,
    preflightEndTime,
    dbTransactionTime,
    readMode: 'fixture_injected',
    terminalSuccess: true,
  };
}

// ---------------------------------------------------------------------------
// Validator / reader (fail closed; no in-place repair)
// ---------------------------------------------------------------------------

export function validateG4PreflightPackage(
  packageDir: string
): MlCal1G4PreflightValidateResult {
  const reasons: string[] = [];
  const fail = (
    extra: string[] = []
  ): MlCal1G4PreflightValidateResult => ({
    ok: false,
    reasons: [...new Set([...reasons, ...extra])],
    terminalSuccess: false,
    liveAccepted: false,
    approved: false,
    fixtureProvenance: false,
    manifestSha256: null,
    dbTransactionTime: null,
  });

  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    return fail(['package_dir_missing']);
  }
  try {
    if (fs.lstatSync(packageDir).isSymbolicLink()) {
      return fail(['package_dir_symlink']);
    }
  } catch {
    return fail(['package_dir_unreadable']);
  }

  const required = [
    ...REQUIRED_EVIDENCE_MEMBERS,
    'PACKAGE_MANIFEST.json',
    'PACKAGE_MANIFEST.sha256',
  ];
  const parsedMembers: Record<string, Record<string, unknown>> = {};
  for (const name of required) {
    const p = path.join(packageDir, name);
    if (!fs.existsSync(p)) return fail([`member_missing:${name}`]);
    if (fs.lstatSync(p).isSymbolicLink()) {
      return fail([`member_symlink:${name}`]);
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

  const manifestParsed = parseJsonObject(manifestBytes, 'manifest');
  if (manifestParsed.ok === false) {
    return fail([manifestParsed.reason]);
  }
  const manifest = manifestParsed.value;

  if (manifest.schemaVersion !== ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA) {
    reasons.push('manifest_schema_mismatch');
  }
  if (manifest.kind !== 'g4-pooler-preflight-package') {
    reasons.push('manifest_kind_mismatch');
  }
  if (typeof manifest.preflightId !== 'string' || !isSafeG4PreflightId(manifest.preflightId)) {
    reasons.push('manifest_preflight_id_invalid');
  }
  if (manifest.liveAccepted !== false) {
    reasons.push('live_accepted_forbidden');
  }
  if (manifest.approved !== false) {
    reasons.push('approved_forbidden');
  }
  if (manifest.credentialsPresent !== false) {
    reasons.push('credentials_present_forbidden');
  }
  if (manifest.fixtureProvenance !== true) {
    reasons.push('fixture_provenance_required');
  }
  if (manifest.terminalSuccess !== true) {
    reasons.push('terminal_success_missing');
  }
  if (manifest.retentionProfile !== ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE) {
    reasons.push('retention_profile_mismatch');
  }
  if (manifest.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256) {
    reasons.push('manifest_design_pin_mismatch');
  }
  if (manifest.baseG5PreTip !== ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP) {
    reasons.push('manifest_base_tip_mismatch');
  }

  const memberDigests = manifest.memberDigests;
  if (!isPlainObject(memberDigests)) {
    return fail(['manifest_member_digests_missing']);
  }

  for (const name of REQUIRED_EVIDENCE_MEMBERS) {
    const meta = memberDigests[name];
    if (!isPlainObject(meta) || typeof meta.sha256 !== 'string' || typeof meta.byteCount !== 'number') {
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
    const parsed = parseJsonObject(
      bytes,
      name.replace(/\.json$/, '').replace(/-/g, '_')
    );
    if (parsed.ok === false) {
      reasons.push(parsed.reason);
    } else {
      parsedMembers[name] = parsed.value;
    }
  }

  // Prefer structured labels for known members
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
  const preflightId =
    typeof manifest.preflightId === 'string' ? manifest.preflightId : '';

  if (runMeta.kind !== ML_CAL_1_G4_PREFLIGHT_RUN_METADATA_KIND) {
    reasons.push('run_metadata_kind_mismatch');
  }
  if (txEvidence.kind !== ML_CAL_1_G4_PREFLIGHT_TX_EVIDENCE_KIND) {
    reasons.push('tx_evidence_kind_mismatch');
  }
  if (design.kind !== ML_CAL_1_G4_PREFLIGHT_DESIGN_KIND) {
    reasons.push('design_kind_mismatch');
  }
  if (provenance.kind !== ML_CAL_1_G4_PREFLIGHT_PROVENANCE_KIND) {
    reasons.push('provenance_kind_mismatch');
  }
  if (provenance.schemaVersion !== ML_CAL_1_G4_PREFLIGHT_PROVENANCE_SCHEMA) {
    reasons.push('provenance_schema_mismatch');
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

  if (runMeta.terminalSuccess !== true) {
    reasons.push('run_metadata_terminal_success_missing');
  }
  if (runMeta.liveAccepted !== false) {
    reasons.push('run_metadata_live_accepted');
  }
  if (runMeta.approved !== false) {
    reasons.push('run_metadata_approved_forbidden');
  }
  if (runMeta.fixtureProvenance !== true) {
    reasons.push('run_metadata_fixture_provenance_required');
  }
  if (runMeta.businessDataWrites !== 0) {
    reasons.push('business_writes_nonzero');
  }
  if (runMeta.providerCalls !== 0) {
    reasons.push('provider_calls_nonzero');
  }
  if (
    String(runMeta.transactionIsolation || '').toLowerCase() !==
    'repeatable read'
  ) {
    reasons.push('run_metadata_isolation_invalid');
  }
  if (String(runMeta.transactionReadOnly || '').toLowerCase() !== 'on') {
    reasons.push('run_metadata_read_only_invalid');
  }

  // Cross-check transaction evidence against run metadata
  if (txEvidence.transactionIsolation !== runMeta.transactionIsolation) {
    reasons.push('tx_run_isolation_mismatch');
  }
  if (txEvidence.transactionReadOnly !== runMeta.transactionReadOnly) {
    reasons.push('tx_run_read_only_mismatch');
  }
  if (txEvidence.transactionTimestamp !== runMeta.dbTransactionTime) {
    reasons.push('tx_run_timestamp_mismatch');
  }
  if (txEvidence.connectionStringPresent !== false) {
    reasons.push('tx_evidence_connection_string_forbidden');
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

  if (design.designSha256 !== ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256) {
    reasons.push('design_pin_mismatch');
  }
  if (design.baseG5PreTip !== ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP) {
    reasons.push('base_tip_mismatch');
  }
  if (design.retentionProfile !== ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE) {
    reasons.push('design_retention_mismatch');
  }

  if (provenance.fixtureProvenance !== true) {
    reasons.push('provenance_fixture_required');
  }
  if (provenance.deployedPoolerProof !== false) {
    reasons.push('deployed_pooler_proof_forbidden');
  }
  if (provenance.liveAccepted !== false) {
    reasons.push('provenance_live_accepted');
  }
  if (provenance.approved !== false) {
    reasons.push('provenance_approved_forbidden');
  }

  const dbTime =
    typeof runMeta.dbTransactionTime === 'string'
      ? runMeta.dbTransactionTime
      : null;
  const tDb = parseIsoMs(dbTime);
  const tStart = parseIsoMs(
    typeof runMeta.preflightStartTime === 'string'
      ? runMeta.preflightStartTime
      : null
  );
  const tEnd = parseIsoMs(
    typeof runMeta.preflightEndTime === 'string'
      ? runMeta.preflightEndTime
      : null
  );
  if (tDb == null) {
    reasons.push('db_transaction_time_invalid');
  } else if (
    tStart == null ||
    tEnd == null ||
    !(tStart <= tDb && tDb <= tEnd)
  ) {
    reasons.push('db_transaction_time_out_of_bounds');
  }

  if (
    manifest.liveAccepted === true ||
    runMeta.liveAccepted === true ||
    provenance.liveAccepted === true ||
    provenance.deployedPoolerProof === true
  ) {
    reasons.push('fixture_cannot_become_live');
  }

  if (reasons.length > 0) {
    return fail([]);
  }

  return {
    ok: true,
    reasons: [],
    terminalSuccess: true,
    liveAccepted: false,
    approved: false,
    fixtureProvenance: true,
    manifestSha256: recomputedManifestSha,
    dbTransactionTime: dbTime,
  };
}

/** Copy-away verification helper for tests — containment enforced. */
export function copyPreflightPackageAway(
  packageDir: string,
  destDir: string,
  retainRoot?: string
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const rootGuess =
    retainRoot ??
    path.dirname(path.dirname(path.resolve(packageDir)));
  const gate = assertFixtureRetainRoot(rootGuess);
  if (!gate.ok) {
    return { ok: false, reasons: gate.reasons };
  }
  const root = gate.root;
  try {
    assertWithinRoot(root, packageDir);
    assertWithinRoot(root, destDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }
  if (isSymlinkOrJunction(destDir) || pathHasSymlinkComponent(root, destDir)) {
    return { ok: false, reasons: ['handoff_dest_symlink'] };
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(packageDir)) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      reasons.push(`unsafe_member_name:${name}`);
      continue;
    }
    const src = path.join(packageDir, name);
    const dst = path.join(destDir, name);
    try {
      assertWithinRoot(root, src);
      assertWithinRoot(root, dst);
    } catch {
      reasons.push(`path_escape:${name}`);
      continue;
    }
    if (fs.lstatSync(src).isSymbolicLink()) {
      reasons.push(`symlink:${name}`);
      continue;
    }
    fs.copyFileSync(src, dst);
    const a = fs.readFileSync(src);
    const b = fs.readFileSync(dst);
    if (!a.equals(b)) reasons.push(`copy_mismatch:${name}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export { sha256Buffer as sha256HexBytes, sha256Utf8Bytes };
