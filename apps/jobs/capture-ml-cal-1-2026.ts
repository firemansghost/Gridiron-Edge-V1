/**
 * CLI — ML-CAL-1 Capture V1.1 (artifact-only, read-only).
 *
 * Writes local JSON capture artifacts only. No COMMIT mode, no provider calls,
 * no Bet/ratings/market writes, no score/outcome reads, no study evaluation.
 *
 * Fixture route (offline / CI):
 *   npx tsx apps/jobs/capture-ml-cal-1-2026.ts --season 2026 --week 7 --fixture path/to/fixture.json
 *   Fixture lifecycle verification is always labeled fixture_hypothetical.
 *
 * Live DB route (manual, later reviewed — NOT authorized by this PR alone):
 *   requires an explicit reviewed study-window registration before use.
 *   Uses server clock; the producer SHA comes from `git rev-parse HEAD` only
 *   (--repository-sha is rejected without --fixture). Receipt bytes + matching
 *   --pinned-lifecycle-digest prove integrity only (receiptIntegrityVerified).
 *   liveAccepted requires a separately reviewed trustedAcceptance record; CLI
 *   bytes+digest alone never create that trust. Until trust exists, live primary
 *   qualification stays blocked even when hashing succeeds. Missing receipt bytes
 *   → lifecycle_verification_unavailable. Live also rejects dirty runner/planner/
 *   lifecycle-weight / pinned web deps before any DB access.
 *
 * Timing: snapshotReferenceTime is stamped after the snapshot reads finish and is the
 * market as-of reference. It is NOT the publication time; the artifact writer takes
 * publicationTime from the real clock at seal time and finalizes eligibility itself.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  ML_CAL_1_CANONICAL_GIT_BYTE_HASHES,
  ML_CAL_1_CAPTURE_PRODUCER_VERSION,
  ML_CAL_1_CAPTURE_SELF_PATHS,
  ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
  ML_CAL_1_SUPPORTED_SEASON,
  assertSafeCaptureId,
  createInstrumentedReadClient,
  parseMlCal1CliArgs,
  planMlCal1Capture,
  redactSensitive,
  resolveCanonicalDependencyHashes,
  runMlCal1LiveSnapshotReads,
  sha256Utf8Bytes,
  readCaptureTerminalResult,
  writeBlockedReasonReceipt,
  writeCaptureArtifactsAtomic,
  type MlCal1DependencyHashes,
  type MlCal1FixtureInput,
  type MlCal1LifecycleReceipt,
  type MlCal1TrustedAcceptanceRecord,
} from './lib/ml-cal-1-capture';

export { runMlCal1LiveSnapshotReads };

export function readRepoCommitSha(repoRoot: string = process.cwd()): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

/**
 * Git-byte dependency hashes.
 * - Always fail closed when pinned production Git bytes differ from the canonical table.
 * - Fixture/offline: producer self-paths and the lifecycle-weight dependency may be dirty
 *   during development (recorded in `dirty`, not thrown).
 * - Live: reject ANY dirty path among pinned web deps, capture runner/planner, and the
 *   lifecycle-weight source before DB access. Producer SHA alone is not executable identity.
 */
export function resolveDependencyHashes(
  repoRoot: string,
  ref = 'HEAD',
  options: { mode?: 'fixture' | 'live' } = {}
): MlCal1DependencyHashes {
  const mode = options.mode ?? 'fixture';
  const hashes = resolveCanonicalDependencyHashes(repoRoot, ref);
  const pinnedDirty = hashes.dirty.filter((rel) =>
    Object.prototype.hasOwnProperty.call(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES, rel)
  );
  if (pinnedDirty.length > 0) {
    throw new Error(`dependency_dirty_vs_git_bytes:${pinnedDirty.join(',')}`);
  }
  if (mode === 'live') {
    const liveRequired = new Set<string>([
      ...Object.keys(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES),
      ...ML_CAL_1_CAPTURE_SELF_PATHS,
      ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
    ]);
    const liveDirty = hashes.dirty.filter((rel) => liveRequired.has(rel));
    if (liveDirty.length > 0) {
      throw new Error(`live_executable_dependency_dirty:${liveDirty.join(',')}`);
    }
    for (const rel of liveRequired) {
      if (!hashes.gitByteHashes[rel]) {
        throw new Error(`live_executable_dependency_unhashed:${rel}`);
      }
    }
  }
  return hashes;
}

function defaultOutRoot(): string {
  return path.join(process.cwd(), 'reports', 'ml-cal-1-captures');
}

export interface MlCal1LiveLoadOptions {
  season: number;
  week: number;
  lifecycleReceipt: MlCal1LifecycleReceipt | null;
  receiptBytes: string | null;
  pinnedReceiptDigest: string | null;
  repositorySha: string;
  captureId: string;
  now: () => Date;
  /** Injectable for tests; defaults to a real PrismaClient. */
  prismaFactory?: () => any;
}

/**
 * Loads a read-only live snapshot. snapshotReferenceTime is stamped AFTER all reads
 * complete and is never treated as publication time.
 */
export async function loadLiveSnapshot(
  options: MlCal1LiveLoadOptions
): Promise<MlCal1FixtureInput> {
  const captureStartTime = options.now();
  const prisma = options.prismaFactory ? options.prismaFactory() : new PrismaClient();

  try {
    const snapshot = await prisma.$transaction(
      async (tx: any) => {
        // Enforce read-only for the snapshot window.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;

        const instrumented = createInstrumentedReadClient({
          allowedSeason: options.season,
          allowedWeek: options.week,
          delegate: {
            game: tx.game,
            teamMembership: tx.teamMembership,
            teamSeasonRating: tx.teamSeasonRating,
            marketLine: tx.marketLine,
          },
        });

        const result = await runMlCal1LiveSnapshotReads(instrumented, {
          season: options.season,
          week: options.week,
        });

        if (instrumented.mutations.length > 0) {
          throw new Error(
            `unexpected_mutations:${instrumented.mutations.join(',')}`
          );
        }
        return result;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 60_000,
      }
    );

    const snapshotReferenceTime = options.now();

    return {
      captureId: options.captureId,
      season: options.season,
      week: options.week,
      repositorySha: options.repositorySha,
      captureStartTime: captureStartTime.toISOString(),
      snapshotReferenceTime: snapshotReferenceTime.toISOString(),
      captureEndTime: snapshotReferenceTime.toISOString(),
      games: snapshot.games,
      fbsTeamIds: snapshot.fbsTeamIds,
      ratings: snapshot.ratings,
      marketLines: snapshot.marketLines,
      lifecycleReceipt: options.lifecycleReceipt,
      receiptBytes: options.receiptBytes,
      pinnedReceiptDigest: options.pinnedReceiptDigest,
      lifecycleMode: 'live',
    };
  } finally {
    await prisma.$disconnect();
  }
}

function loadLifecycleFile(
  receiptPath: string | undefined,
  pinnedDigest: string | undefined
): {
  claims: MlCal1LifecycleReceipt | null;
  receiptBytes: string | null;
  pinnedReceiptDigest: string | null;
} {
  const pinnedReceiptDigest = pinnedDigest ? pinnedDigest.toLowerCase() : null;
  if (!receiptPath) {
    return { claims: null, receiptBytes: null, pinnedReceiptDigest };
  }
  const receiptBytes = fs.readFileSync(receiptPath, 'utf8');
  let claims: MlCal1LifecycleReceipt | null = null;
  try {
    const parsed = JSON.parse(receiptBytes) as MlCal1LifecycleReceipt;
    // A receipt cannot contain the hash of its own bytes; bind claims to the file bytes.
    claims = { ...parsed, receiptDigest: sha256Utf8Bytes(Buffer.from(receiptBytes, 'utf8')) };
  } catch {
    claims = null; // verification reports lifecycle_receipt_bytes_unparseable
  }
  return { claims, receiptBytes, pinnedReceiptDigest };
}

export interface MlCal1CliDeps {
  now?: () => Date;
  cwd?: string;
  resolveDependencyHashes?: (
    repoRoot: string,
    ref?: string,
    options?: { mode?: 'fixture' | 'live' }
  ) => MlCal1DependencyHashes;
  readRepoCommitSha?: (repoRoot: string) => string;
  loadLiveSnapshot?: (options: MlCal1LiveLoadOptions) => Promise<MlCal1FixtureInput>;
  /** Optional independently reviewed live trust record (never synthesized from CLI digest alone). */
  trustedAcceptance?: MlCal1TrustedAcceptanceRecord | null;
  /** Test hook forwarded to writeCaptureArtifactsAtomic. */
  beforeRename?: () => void;
  failTerminalWrite?: boolean;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

/** Returns the process exit code. */
export async function runMlCal1Cli(
  argv: string[],
  deps: MlCal1CliDeps = {}
): Promise<number> {
  const now = deps.now ?? (() => new Date());
  const repoRoot = deps.cwd ?? process.cwd();
  const out = deps.stdout ?? ((line: string) => console.log(line));
  const err = deps.stderr ?? ((line: string) => console.error(line));

  // Parse/validate CLI BEFORE any DB connection.
  let args: ReturnType<typeof parseMlCal1CliArgs>;
  try {
    args = parseMlCal1CliArgs(argv);
  } catch (e) {
    const message = redactSensitive(e instanceof Error ? e.message : String(e));
    err(JSON.stringify({ ok: false, error: message }));
    return 2;
  }

  if (!args.fixturePath && !args.enableLiveDbRead) {
    // Live DB reads are implemented but gated: study-window registration,
    // receipt qualification, and workflow wiring remain subsequent review steps.
    err(
      JSON.stringify({
        ok: false,
        error:
          'live_db_read_gated:provide_--fixture_or_pass_--enable-live-db-read_after_reviewed_registration',
        hint: 'This PR ships fixture capture only for CI. Do not dispatch a live capture without reviewed registration + workflow PR.',
      })
    );
    return 3;
  }

  const outRoot = args.outDir ?? defaultOutRoot();
  const captureId =
    args.captureId ??
    `ml-cal-1-${args.season}-w${String(args.week).padStart(2, '0')}-${randomUUID()}`;

  try {
    assertSafeCaptureId(captureId);
    fs.mkdirSync(outRoot, { recursive: true });

    const isLive = !args.fixturePath && args.enableLiveDbRead;
    const dependencyHashes = (deps.resolveDependencyHashes ?? resolveDependencyHashes)(
      repoRoot,
      'HEAD',
      { mode: isLive ? 'live' : 'fixture' }
    );

    let fixtureInput: MlCal1FixtureInput;

    if (args.fixturePath) {
      const raw = JSON.parse(
        fs.readFileSync(args.fixturePath, 'utf8')
      ) as MlCal1FixtureInput;
      const repositorySha = args.repositorySha ?? raw.repositorySha;
      if (!repositorySha || !/^[0-9a-f]{40}$/i.test(repositorySha)) {
        throw new Error('fixture_repository_sha_required');
      }
      fixtureInput = {
        ...raw,
        captureId: args.captureId ?? raw.captureId ?? captureId,
        season: args.season,
        week: args.week,
        repositorySha,
        // A fixture can never claim live verification.
        lifecycleMode: 'fixture_hypothetical',
        trustedAcceptance: null,
      };
      if (args.lifecycleReceiptPath || args.pinnedLifecycleDigest) {
        const lc = loadLifecycleFile(args.lifecycleReceiptPath, args.pinnedLifecycleDigest);
        fixtureInput.lifecycleReceipt = lc.claims;
        fixtureInput.receiptBytes = lc.receiptBytes;
        fixtureInput.pinnedReceiptDigest = lc.pinnedReceiptDigest;
      }
      if (fixtureInput.season !== ML_CAL_1_SUPPORTED_SEASON) {
        throw new Error(`unsupported_season:${fixtureInput.season}`);
      }
      assertSafeCaptureId(fixtureInput.captureId);
    } else {
      // Live: producer SHA from git only. Bytes+digest prove integrity only;
      // liveAccepted requires an independently reviewed trust record (deps.trustedAcceptance).
      // Executable deps must already be clean (checked above) before DB access.
      const repositorySha = (deps.readRepoCommitSha ?? readRepoCommitSha)(repoRoot);
      const lc = loadLifecycleFile(args.lifecycleReceiptPath, args.pinnedLifecycleDigest);
      fixtureInput = await (deps.loadLiveSnapshot ?? loadLiveSnapshot)({
        season: args.season,
        week: args.week,
        lifecycleReceipt: lc.claims,
        receiptBytes: lc.receiptBytes,
        pinnedReceiptDigest: lc.pinnedReceiptDigest,
        repositorySha,
        captureId,
        now,
      });
      fixtureInput.trustedAcceptance = deps.trustedAcceptance ?? null;
      fixtureInput.lifecycleMode = 'live';
    }

    const planned = planMlCal1Capture(fixtureInput, { now });

    const written = writeCaptureArtifactsAtomic({
      rootDir: outRoot,
      captureId: fixtureInput.captureId,
      bundle: planned.bundle,
      dependencyHashes,
      now,
      beforeRename: deps.beforeRename,
      failTerminalWrite: deps.failTerminalWrite,
    });

    // CLI reporting uses the same validated reader as offline consumers. Write-time
    // digests are the external pin for this process (not a self-hash inside the file).
    const validated = readCaptureTerminalResult({
      rootDir: outRoot,
      captureId: fixtureInput.captureId,
      expectedManifestSha256: written.manifestSha256,
      expectedTerminalSha256: written.terminalSha256,
      expectedInvalidationSha256: written.invalidationSha256,
      expectedPackageChecksumsSha256: written.packageChecksumsSha256,
    });

    const finalEnvelope = written.bundle.envelope;
    const ok = validated.eligibilityAccepted;

    out(
      JSON.stringify(
        {
          ok,
          status: validated.terminalStatus,
          sealedStatus: validated.sealedStatus,
          primaryReadinessBlocked: validated.primaryReadinessBlockedEffective,
          sealedPrimaryReadinessBlocked: finalEnvelope.primaryReadinessBlocked,
          lifecycleMode: finalEnvelope.lifecycleQualification.mode,
          fixtureHypothetical: finalEnvelope.lifecycleQualification.fixtureHypothetical,
          receiptIntegrityVerified:
            finalEnvelope.lifecycleQualification.receiptIntegrityVerified,
          liveAccepted: finalEnvelope.lifecycleQualification.liveAccepted,
          structuralConsistencyVerified: validated.structuralConsistencyVerified,
          independentlyVerifiedIntegrity: validated.independentlyVerifiedIntegrity,
          eligibilityAccepted: validated.eligibilityAccepted,
          captureDir: written.captureDir,
          manifestPath: written.manifestPath,
          manifestSha256: validated.manifestSha256,
          snapshotReferenceTime: finalEnvelope.snapshotReferenceTime,
          publicationTime: validated.publicationTime,
          publicationInvalidationPath: validated.publicationInvalidationPath,
          terminalReceiptPath: validated.terminalReceiptPath,
          packageChecksumsPath: validated.packageChecksumsPath,
          invalidatedGameIds: validated.invalidatedGameIds,
          sealedCounts: validated.sealedCounts,
          effectiveCounts: validated.effectiveCounts,
          terminalSha256: validated.terminalSha256,
          invalidationSha256: validated.invalidationSha256,
          packageChecksumsSha256: validated.packageChecksumsSha256,
          integrityNotes: validated.integrityNotes,
          producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
          providerCalls: 0,
          businessDataWrites: 0,
        },
        null,
        2
      )
    );

    if (validated.terminalStatus === 'PUBLICATION_INVALIDATED') return 4;
    if (!validated.eligibilityAccepted) return 1;
    return 0;
  } catch (e) {
    const message = redactSensitive(e instanceof Error ? e.message : String(e));
    // Only a validated capture id may name a file (no path escape via the id).
    let safeId = true;
    try {
      assertSafeCaptureId(captureId);
    } catch {
      safeId = false;
    }
    const receiptPath = path.join(
      outRoot,
      `${safeId ? captureId : `ml-cal-1-invalid-capture-id-${randomUUID()}`}-infrastructure-error.json`
    );
    try {
      writeBlockedReasonReceipt({
        path: receiptPath,
        captureId,
        status: 'INFRASTRUCTURE_ERROR',
        reasons: [message],
      });
    } catch {
      // best-effort
    }
    err(
      JSON.stringify({
        ok: false,
        status: 'INFRASTRUCTURE_ERROR',
        error: message,
        receiptPath,
      })
    );
    return 2;
  }
}

if (require.main === module) {
  runMlCal1Cli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
