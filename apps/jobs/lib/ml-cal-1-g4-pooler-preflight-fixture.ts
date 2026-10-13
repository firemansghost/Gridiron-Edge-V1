/**
 * ML-CAL-1 G4 pooler preflight — fixture-only runner + package validator.
 *
 * Metadata-only TX sequencing against an injected mock adapter.
 * No Prisma client, real DB adapter, credentials, providers, or live mode.
 * Seals R-LOCAL-FS layout under a caller-supplied test root only.
 *
 * Design: research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md
 * Design SHA-256 (git/LF canonical): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 * Prior CRLF working-tree report: d4d75759a1c347f81f84082f8963bb110760a32e24c0e832e70f5cceb692ca67
 * Base G5-PRE tip: 1683ce36fbb5a981a2b3ba3d8a9b90ea8da37f25
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
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

const SECRETISH =
  /(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{8,}|ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+|postgres(ql)?:\/\/\S+)/i;

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
  /** Simulate adapter timeout / abort before metadata returns. */
  failOnTransactionOpen?: boolean;
  timeoutBeforeMetadata?: boolean;
  malformedMetadata?: boolean;
}

export type MlCal1G4PreflightMode = 'fixture' | 'live';

export interface MlCal1G4PreflightRunInput {
  /** Must be 'fixture'. Any other value is refused. */
  mode: MlCal1G4PreflightMode;
  preflightId: string;
  /** Absolute or relative test retain root (temp). Never operator research root. */
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

function redactError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, '[redacted]')
    .replace(
      /(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL|password|api[_-]?key)\s*[:=]\s*\S+/gi,
      '$1=[redacted]'
    )
    .slice(0, 240);
}

export function isSafeG4PreflightId(value: unknown): value is string {
  return isSafeG4ObservationId(value);
}

function assertWithinRoot(root: string, candidate: string): string {
  const rootReal = fs.realpathSync(path.resolve(root));
  const candAbs = path.resolve(candidate);
  // Reject if any ancestor of candidate (within root walk) is a symlink/junction
  // by resolving realpath and requiring containment.
  let candReal: string;
  try {
    if (fs.existsSync(candAbs)) {
      candReal = fs.realpathSync(candAbs);
    } else {
      // Ensure parent is real and contained; candidate itself must not be a symlink path escape
      const parent = path.dirname(candAbs);
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

export function ensureRLocalFsLayout(retainRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  const reasons: string[] = [];
  const root = path.resolve(retainRoot);
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      reasons: [`retain_root_unusable:${redactError(e)}`],
      root,
    };
  }
  for (const sub of ML_CAL_1_G4_PREFLIGHT_SUBTREES) {
    const p = path.join(root, sub);
    try {
      fs.mkdirSync(p, { recursive: true });
      if (pathHasSymlinkComponent(root, p)) {
        reasons.push(`symlink_in_layout:${sub}`);
      }
      assertWithinRoot(root, p);
    } catch (e) {
      reasons.push(`layout_${sub}:${redactError(e)}`);
    }
  }
  // Writability probe under staging
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
          if (config.malformedMetadata) {
            return {
              transactionIsolation: '',
              transactionReadOnly: '',
              transactionTimestamp: 'not-a-timestamp',
            };
          }
          if (config.loseTransactionAfterMetadata) {
            aborted = true;
          }
          const ts =
            config.transactionTimestamp ?? '2026-10-13T18:00:05.000Z';
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
      return fn(client);
    },
  };
}

// ---------------------------------------------------------------------------
// Seal / publish
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

function claimPreflightDirExclusiveSync(finalDir: string): void {
  fs.mkdirSync(finalDir);
}

async function claimPreflightDirExclusiveAsync(finalDir: string): Promise<void> {
  await fs.promises.mkdir(finalDir);
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

/** @internal Exported for negative tests (wrong subtree). */
export function sealPreflightPackage(input: {
  retainRoot: string;
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
  /** Default preflight. observations is always rejected. */
  subtree?: 'preflight' | 'observations';
}): MlCal1G4PreflightSealResult {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  const subtree = input.subtree ?? 'preflight';
  if (subtree === 'observations') {
    return { ok: false, reasons: ['wrong_subtree_observations'] };
  }
  const root = path.resolve(input.retainRoot);
  const preflightRoot = path.join(root, 'preflight');
  const stagingRoot = path.join(root, 'staging');
  const finalDir = path.join(preflightRoot, input.preflightId);
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.preflightId}-${randomUUID()}`
  );

  try {
    assertWithinRoot(root, finalDir);
    assertWithinRoot(root, stagingDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }

  if (pathHasSymlinkComponent(root, preflightRoot)) {
    return { ok: false, reasons: ['symlink_in_preflight_root'] };
  }

  if (fs.existsSync(finalDir)) {
    try {
      if (fs.lstatSync(finalDir).isSymbolicLink()) {
        return { ok: false, reasons: ['preflight_dest_symlink'] };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, reasons: ['preflight_package_exists'] };
  }

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
  const allDigests = memberDigestsOf(allMembers);

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const [name, bytes] of Object.entries(allMembers)) {
      const p = path.join(stagingDir, name);
      assertWithinRoot(root, p);
      fs.writeFileSync(p, bytes);
    }
    const stagedReasons = verifyMembersAgainstDigests(stagingDir, allDigests);
    if (stagedReasons.length > 0) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return { ok: false, reasons: stagedReasons.map((r) => `staged_${r}`) };
    }

    // Exclusive claim + atomic publish (race-safe: exactly one mkdir winner).
    // Prefer async claim when available via sealPreflightPackageAsync.
    try {
      claimPreflightDirExclusiveSync(finalDir);
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

    for (const [name, bytes] of Object.entries(allMembers)) {
      const dest = path.join(finalDir, name);
      assertWithinRoot(root, dest);
      // wx exclusive create — refuse overwrite inside claimed dir
      const fd = fs.openSync(dest, 'wx');
      try {
        fs.writeSync(fd, bytes);
      } finally {
        fs.closeSync(fd);
      }
    }
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }

    const publishedReasons = verifyMembersAgainstDigests(finalDir, allDigests);
    if (publishedReasons.length > 0) {
      // Preserve sealed evidence — do not repair in place.
      return {
        ok: false,
        reasons: publishedReasons.map((r) => `published_${r}`),
      };
    }

    return {
      ok: true,
      packageDir: finalDir,
      manifestSha256,
      memberDigests: {
        ...digests,
        'PACKAGE_MANIFEST.json': {
          sha256: manifestSha256,
          byteCount: manifestBytes.length,
        },
        'PACKAGE_MANIFEST.sha256': allDigests['PACKAGE_MANIFEST.sha256'],
      },
      reasons: [],
    };
  } catch (e) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, reasons: [`seal_failed:${redactError(e)}`] };
  }
}

/**
 * Async seal — same rules as sealPreflightPackage, but exclusive claim uses
 * fs.promises.mkdir so concurrent callers can race fairly.
 */
export async function sealPreflightPackageAsync(input: {
  retainRoot: string;
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
  subtree?: 'preflight' | 'observations';
}): Promise<MlCal1G4PreflightSealResult> {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  if ((input.subtree ?? 'preflight') === 'observations') {
    return { ok: false, reasons: ['wrong_subtree_observations'] };
  }
  const root = path.resolve(input.retainRoot);
  const preflightRoot = path.join(root, 'preflight');
  const stagingRoot = path.join(root, 'staging');
  const finalDir = path.join(preflightRoot, input.preflightId);
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.preflightId}-${randomUUID()}`
  );
  try {
    assertWithinRoot(root, finalDir);
    assertWithinRoot(root, stagingDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }
  if (pathHasSymlinkComponent(root, preflightRoot)) {
    return { ok: false, reasons: ['symlink_in_preflight_root'] };
  }
  if (fs.existsSync(finalDir)) {
    try {
      if (fs.lstatSync(finalDir).isSymbolicLink()) {
        return { ok: false, reasons: ['preflight_dest_symlink'] };
      }
    } catch {
      /* ignore */
    }
    return { ok: false, reasons: ['preflight_package_exists'] };
  }
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
  const allMembers: Record<string, Buffer> = {
    ...input.members,
    'PACKAGE_MANIFEST.json': manifestBytes,
    'PACKAGE_MANIFEST.sha256': Buffer.from(`${manifestSha256}\n`, 'utf8'),
  };
  const allDigests = memberDigestsOf(allMembers);
  try {
    await fs.promises.mkdir(stagingDir, { recursive: true });
    for (const [name, bytes] of Object.entries(allMembers)) {
      const p = path.join(stagingDir, name);
      assertWithinRoot(root, p);
      await fs.promises.writeFile(p, bytes);
    }
    const stagedReasons = verifyMembersAgainstDigests(stagingDir, allDigests);
    if (stagedReasons.length > 0) {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      return { ok: false, reasons: stagedReasons.map((r) => `staged_${r}`) };
    }
    await Promise.resolve(); // allow concurrent interleaving before claim
    try {
      await claimPreflightDirExclusiveAsync(finalDir);
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
    for (const [name, bytes] of Object.entries(allMembers)) {
      const dest = path.join(finalDir, name);
      assertWithinRoot(root, dest);
      const fd = await fs.promises.open(dest, 'wx');
      try {
        await fd.writeFile(bytes);
      } finally {
        await fd.close();
      }
    }
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
    const publishedReasons = verifyMembersAgainstDigests(finalDir, allDigests);
    if (publishedReasons.length > 0) {
      return {
        ok: false,
        reasons: publishedReasons.map((r) => `published_${r}`),
      };
    }
    return {
      ok: true,
      packageDir: finalDir,
      manifestSha256,
      memberDigests: {
        ...digests,
        'PACKAGE_MANIFEST.json': {
          sha256: manifestSha256,
          byteCount: manifestBytes.length,
        },
        'PACKAGE_MANIFEST.sha256': allDigests['PACKAGE_MANIFEST.sha256'],
      },
      reasons: [],
    };
  } catch (e) {
    try {
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
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
    preflightId: input.preflightId,
    liveAccepted: false,
    approved: false,
    fixtureProvenance: true,
    packageDir: null,
    packageManifestSha256: null,
    memberDigests: null,
    preflightStartTime,
    preflightEndTime: preflightEndTime ?? toIso(input.now()),
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

  // Refuse seal into observations subtree even if caller tampers id path
  const obsProbe = path.join(layout.root, 'observations', input.preflightId);
  if (fs.existsSync(obsProbe)) {
    notes.push('observations_collision_ignored');
  }

  preflightStartTime = toIso(input.now());
  let meta: MlCal1G4PreflightTxMetadata | null = null;

  try {
    await input.txAdapter.withRepeatableReadTransaction(async (client) => {
      await client.setTransactionReadOnly();
      meta = await client.queryTransactionMetadata();
    });
  } catch (e) {
    preflightEndTime = toIso(input.now());
    return baseFail([`adapter_failed:${redactError(e)}`]);
  }

  preflightEndTime = toIso(input.now());

  if (!meta) {
    return baseFail(['transaction_metadata_missing']);
  }

  const isolation = (meta.transactionIsolation || '').toLowerCase();
  const readOnly = (meta.transactionReadOnly || '').toLowerCase();
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

  // Successful path — seal proof package
  const runMetadata = {
    kind: 'g4-pooler-preflight-run-metadata',
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
    kind: 'g4-pooler-preflight-tx-evidence',
    transactionIsolation: meta.transactionIsolation,
    transactionReadOnly: meta.transactionReadOnly,
    transactionTimestamp: meta.transactionTimestamp,
    serverClockDiagnostics: meta.serverClockDiagnostics ?? {},
    // Redacted — never embed connection strings
    connectionStringPresent: false,
  };
  const designCorrespondence = {
    kind: 'g4-pooler-preflight-design-correspondence',
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256,
    baseG5PreTip: ML_CAL_1_G4_PREFLIGHT_BASE_G5_PRE_TIP,
    retentionProfile: ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
    note: 'fixture-only preflight proof — not deployed pooler acceptance',
  };
  const provenance = {
    schemaVersion: ML_CAL_1_G4_PREFLIGHT_PROVENANCE_SCHEMA,
    kind: 'g4-pooler-preflight-fixture-provenance',
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
    'preflight-run-metadata.json',
    'preflight-tx-evidence.json',
    'design-correspondence.json',
    'PROVENANCE.json',
    'PACKAGE_MANIFEST.json',
    'PACKAGE_MANIFEST.sha256',
  ];
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

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    return fail(['manifest_parse_failed']);
  }

  if (manifest.schemaVersion !== ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA) {
    reasons.push('manifest_schema_mismatch');
  }
  if (manifest.liveAccepted === true) {
    reasons.push('live_accepted_forbidden');
  }
  if (manifest.approved === true) {
    reasons.push('approved_forbidden');
  }
  if (manifest.credentialsPresent === true) {
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

  const memberDigests = manifest.memberDigests as
    | Record<string, { sha256?: string; byteCount?: number }>
    | undefined;
  if (memberDigests == null || typeof memberDigests !== 'object') {
    return fail(['manifest_member_digests_missing']);
  }

  for (const name of [
    'preflight-run-metadata.json',
    'preflight-tx-evidence.json',
    'design-correspondence.json',
    'PROVENANCE.json',
  ]) {
    const meta = memberDigests[name];
    if (!meta?.sha256 || typeof meta.byteCount !== 'number') {
      reasons.push(`digest_entry_missing:${name}`);
      continue;
    }
    const bytes = fs.readFileSync(path.join(packageDir, name));
    if (bytes.length !== meta.byteCount) {
      reasons.push(`bytecount_mismatch:${name}`);
    }
    if (sha256Buffer(bytes) !== meta.sha256.toLowerCase()) {
      reasons.push(`digest_mismatch:${name}`);
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      reasons.push(`secretish:${name}`);
    }
  }

  let runMeta: Record<string, unknown>;
  try {
    runMeta = JSON.parse(
      fs
        .readFileSync(
          path.join(packageDir, 'preflight-run-metadata.json'),
          'utf8'
        )
        .trim()
    );
  } catch {
    return fail(['run_metadata_parse_failed']);
  }

  if (runMeta.terminalSuccess !== true) {
    reasons.push('run_metadata_terminal_success_missing');
  }
  if (runMeta.liveAccepted === true) {
    reasons.push('run_metadata_live_accepted');
  }
  if (runMeta.businessDataWrites !== 0) {
    reasons.push('business_writes_nonzero');
  }
  if (runMeta.providerCalls !== 0) {
    reasons.push('provider_calls_nonzero');
  }
  if (String(runMeta.transactionIsolation || '').toLowerCase() !== 'repeatable read') {
    reasons.push('run_metadata_isolation_invalid');
  }
  if (String(runMeta.transactionReadOnly || '').toLowerCase() !== 'on') {
    reasons.push('run_metadata_read_only_invalid');
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
  } else if (tStart == null || tEnd == null || !(tStart <= tDb && tDb <= tEnd)) {
    reasons.push('db_transaction_time_out_of_bounds');
  }

  let provenance: Record<string, unknown>;
  try {
    provenance = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'PROVENANCE.json'), 'utf8').trim()
    );
  } catch {
    return fail(['provenance_parse_failed']);
  }
  if (provenance.fixtureProvenance !== true) {
    reasons.push('provenance_fixture_required');
  }
  if (provenance.deployedPoolerProof === true) {
    reasons.push('deployed_pooler_proof_forbidden');
  }
  if (provenance.liveAccepted === true) {
    reasons.push('provenance_live_accepted');
  }

  // Fixture evidence cannot become deployed/live acceptance
  if (
    manifest.liveAccepted === true ||
    runMeta.liveAccepted === true ||
    provenance.liveAccepted === true
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

/** Copy-away verification helper for tests. */
export function copyPreflightPackageAway(
  packageDir: string,
  destDir: string
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(packageDir)) {
    const src = path.join(packageDir, name);
    const dst = path.join(destDir, name);
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

// Re-export for tests that need buffer hashing
export { sha256Buffer as sha256HexBytes, sha256Utf8Bytes };
