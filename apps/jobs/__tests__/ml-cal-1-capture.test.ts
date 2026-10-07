/**
 * ML-CAL-1 Capture V1.1 — fixture tests (no live DB, no providers, no secrets).
 *
 * Covers the repaired review items R1–R6 and follow-up F1–F4:
 *   R1 ratings            (null/null, Decimal(0), nonfinite, version, duplicates, HFA parity)
 *   R2 publication timing (plan option, writer seal/rename delay, kickoff-30 boundary)
 *   R3 lifecycle bytes    (pinned digest, altered bytes, week/weight/fingerprint/season)
 *   R4 Git-byte hashes    (canonical hashes, LF/CRLF reproducibility, false live SHA)
 *   R5 read isolation     (select/season/OR/2025/mutations, live-read helper with fakes)
 *   R6 artifacts          (blocked receipt, redaction, id safety, no-overwrite, ledgers)
 *   F1 integrity≠live trust (trustedAcceptance; receiptIntegrityVerified)
 *   F2 terminal invalidation (non-success exit; terminal receipt required)
 *   F3 live dirty producer / lifecycle-weight rejection before DB
 *   F4 whitespace/malformed truthy ratings rejected (not zero)
 *
 * PR 243 draft hashes note: the PR 243 draft hash table was correct for Git bytes
 * (`git show <ref>:<path>`, LF as committed). Windows CRLF checkouts hash to the
 * alternate digests (e.g. core-v1-moneyline.ts: Git bytes c47c… vs Windows CRLF 79e288…).
 * Dependency hashes therefore always come from Git bytes, never from a raw checkout.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HARD_MIN_ML_VALUE,
  ML_CAL_1_BLOCKED_RECEIPT_MEMBER,
  ML_CAL_1_CANONICAL_GIT_BYTE_HASHES,
  ML_CAL_1_CAPTURE_PRODUCER_VERSION,
  ML_CAL_1_CAPTURE_SCHEMA_VERSION,
  ML_CAL_1_CAPTURE_SELF_PATHS,
  ML_CAL_1_FORBIDDEN_GAME_FIELDS,
  ML_CAL_1_GAME_SELECT,
  ML_CAL_1_LIFECYCLE_POLICY,
  ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
  ML_CAL_1_LIVE_ODDS_SOURCE,
  ML_CAL_1_MARKET_LINE_SELECT,
  ML_CAL_1_MAX_MARKET_AGE_SECONDS,
  ML_CAL_1_MIN_PRE_KICKOFF_MS,
  ML_MAX_ABS_SPREAD,
  assertNoForbiddenGameSelect,
  assertSafeCaptureId,
  buildArtifactMembers,
  buildManifest,
  buildPrimaryReadinessBlockedReceiptBody,
  buildRatingFingerprint,
  chooseRatingField,
  computeDirectV1Margin,
  containsCrlf,
  createInstrumentedReadClient,
  exportRatingInput,
  finalizePublicationEligibility,
  getActiveHfaConfigHash,
  hashGitBlobContent,
  modelWinProbsFromCoreSpreadHma,
  normalizeNewlinesToLf,
  parseMlCal1CliArgs,
  planMlCal1Capture,
  qualifyLifecycleReceipt,
  readCaptureTerminalResult,
  readGitShowBytes,
  redactSensitive,
  resolveCanonicalDependencyHashes,
  resolveCaptureDir,
  runMlCal1LiveSnapshotReads,
  selectAsOfMoneylineEvidence,
  selectAsOfSpreadEvidence,
  sha256Utf8Bytes,
  stableStringify,
  writeBlockedReasonReceipt,
  writeCaptureArtifactsAtomic,
  type MlCal1ArtifactBundle,
  type MlCal1DecimalLike,
  type MlCal1DependencyHashes,
  type MlCal1FixtureInput,
  type MlCal1GameMeta,
  type MlCal1LifecycleReceipt,
  type MlCal1LifecycleVerificationInput,
  type MlCal1MarketLineCandidate,
  type MlCal1RawRatingRow,
  type MlCal1ReadDelegates,
  type MlCal1TrustedAcceptanceRecord,
} from '../lib/ml-cal-1-capture';
import {
  loadLiveSnapshot,
  resolveDependencyHashes,
  runMlCal1Cli,
  runMlCal1LiveSnapshotReads as cliReExportedReads,
  type MlCal1LiveLoadOptions,
} from '../capture-ml-cal-1-2026';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import { selectCoreV1MoneylinePick } from '../../web/lib/core-v1-moneyline';
import { americanToProb } from '../../web/lib/market-line-helpers';

// ---------------------------------------------------------------------------
// Shared constants / helpers
// ---------------------------------------------------------------------------

const REPO = path.resolve(__dirname, '../../..');
const DEMO_FIXTURE = path.join(__dirname, 'fixtures', 'ml-cal-1-capture-demo.json');
const REF_SHA = 'c37b5d367a364398d479c52844466aa4fd3306c2';
const LIFECYCLE_SHA = 'f8412a252fe50950cbcfe93f4220d34654f48590';

const SNAP = '2026-10-12T18:00:00.000Z';
const KICK = '2026-10-12T23:00:00.000Z';
const KICK_MINUS_30M = '2026-10-12T22:30:00.000Z';
const GAME_ID = '2026-wk7-alabama-georgia';

/** Always at/after the snapshot and far before every kickoff used for on-time cases. */
const NOW_OK = () => new Date('2026-10-12T18:00:05.000Z');

/** Dependency hashes injected for artifact writes (never resolveDependencyHashes from tests). */
const CANONICAL_DEPS: MlCal1DependencyHashes = {
  gitByteHashes: { ...ML_CAL_1_CANONICAL_GIT_BYTE_HASHES },
  dirty: [],
};

/** Windows CRLF-checkout digests of the same six files (PR 243 draft table came from Git bytes). */
const WINDOWS_CRLF_HASHES: Record<string, string> = {
  'apps/web/lib/core-v1-moneyline.ts':
    '79e2886a79971162349f8404a94406ab45fb14cdce4da795ae604ba202156c1b',
  'apps/web/lib/core-v1-weekly-card.ts':
    '477fff60212a414c6e3db83d8c8dd588750e3e562fa3f11aa7a4f948a15cc9b8',
  'apps/web/lib/market-line-snapshot.ts':
    '03fd9b7a11916fbdd53e55bba0765aa61a575b86d8078d2f24609bd13387f8e2',
  'apps/web/lib/market-line-helpers.ts':
    '76ff287c1f9a3b86cb2f998b31ef4e92da90f826c51d7ceb50cece5493141f3b',
  'apps/web/lib/core-v1-spread.ts':
    '3e83e789be6b02ec34225f81a3f5d00056f7367d89f7401b06a82ca892202124',
  'apps/web/lib/data/core_v1_hfa_config.json':
    '690cfafe695c44fb78e0e4a49e31d77ee6ea8a09cb25b57d24c1c9e664a144eb',
};

const PINNED_PATHS = Object.keys(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES);

type ReceiptCore = Omit<MlCal1LifecycleReceipt, 'receiptDigest'>;
type ExportedRating = ReturnType<typeof exportRatingInput>;

const tmpDirs: string[] = [];
function makeTmp(prefix = 'ml-cal-1-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

/** Truthy Decimal-like object (like Prisma.Decimal), including zero. */
function decimal(n: number): { toString(): string; valueOf(): number } {
  return { toString: () => String(n), valueOf: () => n };
}

function iso(msOffset: number, base: string = SNAP): string {
  return new Date(Date.parse(base) + msOffset).toISOString();
}

function rating(
  teamId: string,
  power: number | MlCal1DecimalLike,
  ratingValue: number | MlCal1DecimalLike = null,
  opts: Partial<MlCal1RawRatingRow> = {}
): MlCal1RawRatingRow {
  const wrap = (v: number | MlCal1DecimalLike): MlCal1DecimalLike =>
    typeof v === 'number' ? decimal(v) : v;
  return {
    season: 2026,
    teamId,
    modelVersion: 'v1',
    powerRating: wrap(power),
    rating: wrap(ratingValue),
    games: 6,
    dataSource: 'lifecycle',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...opts,
  };
}

function linePair(options: {
  gameId: string;
  lineType: 'moneyline' | 'spread';
  homeTeamId: string;
  awayTeamId: string;
  homeValue: number;
  awayValue: number;
  timestamp: string;
  bookName?: string;
  homeId?: string;
  awayId?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
}): MlCal1MarketLineCandidate[] {
  const book = options.bookName ?? 'BetRivers';
  const createdAt = options.createdAt ?? options.timestamp;
  const updatedAt = options.updatedAt ?? options.timestamp;
  const source = options.source ?? ML_CAL_1_LIVE_ODDS_SOURCE;
  const tag = options.lineType === 'moneyline' ? 'ml' : 'sp';
  return [
    {
      id: options.homeId ?? `${options.gameId}-${tag}-home`,
      gameId: options.gameId,
      lineType: options.lineType,
      lineValue: options.homeValue,
      bookName: book,
      timestamp: options.timestamp,
      createdAt,
      updatedAt,
      teamId: options.homeTeamId,
      source,
    },
    {
      id: options.awayId ?? `${options.gameId}-${tag}-away`,
      gameId: options.gameId,
      lineType: options.lineType,
      lineValue: options.awayValue,
      bookName: book,
      timestamp: options.timestamp,
      createdAt,
      updatedAt,
      teamId: options.awayTeamId,
      source,
    },
  ];
}

function mlPair(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homePrice: number;
  awayPrice: number;
  timestamp: string;
  bookName?: string;
  homeId?: string;
  awayId?: string;
  createdAt?: string;
  updatedAt?: string;
  source?: string;
}): MlCal1MarketLineCandidate[] {
  return linePair({
    gameId: options.gameId,
    lineType: 'moneyline',
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    homeValue: options.homePrice,
    awayValue: options.awayPrice,
    timestamp: options.timestamp,
    bookName: options.bookName,
    homeId: options.homeId,
    awayId: options.awayId,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    source: options.source,
  });
}

function fingerprintFor(ratings: MlCal1RawRatingRow[], season = 2026): string {
  const by: Record<string, ExportedRating> = {};
  for (const r of ratings) {
    if (r.modelVersion !== 'v1' || r.season !== season) continue;
    if (by[r.teamId]) continue;
    by[r.teamId] = exportRatingInput(r);
  }
  return buildRatingFingerprint(by);
}

/** Exactly the receipt construction used by the lifecycle writer contract. */
function buildVerifiedReceipt(core: Omit<MlCal1LifecycleReceipt, 'receiptDigest'>) {
  const receiptBytes = stableStringify(core) + '\n';
  const digest = sha256Utf8Bytes(receiptBytes);
  const claims = { ...core, receiptDigest: digest };
  return { receiptBytes, pinnedReceiptDigest: digest, claims };
}

/** Independently reviewed live trust record (never synthesized from CLI digest alone). */
function trustFor(
  core: ReceiptCore,
  digest: string,
  overrides: Partial<MlCal1TrustedAcceptanceRecord> = {}
): MlCal1TrustedAcceptanceRecord {
  return {
    approvedReceiptDigest: digest,
    season: core.season ?? 2026,
    selectedPolicy: core.selectedPolicy,
    completedThroughWeek: core.completedThroughWeek,
    canonicalWeight: core.canonicalWeight,
    ratingFingerprint: core.ratingFingerprint,
    lifecycleSourceSha: core.sourceSha,
    ...overrides,
  };
}

function receiptCore(
  ratings: MlCal1RawRatingRow[],
  overrides: Partial<ReceiptCore> = {}
): ReceiptCore {
  return {
    sourceSha: LIFECYCLE_SHA,
    completedThroughWeek: 6,
    selectedPolicy: ML_CAL_1_LIFECYCLE_POLICY,
    canonicalWeight: 1,
    season: 2026,
    acceptedImmutable: true,
    ratingFingerprint: fingerprintFor(ratings),
    ...overrides,
  };
}

function lifecycleInput(
  core: ReceiptCore,
  overrides: Partial<MlCal1LifecycleVerificationInput> = {}
): MlCal1LifecycleVerificationInput {
  const v = buildVerifiedReceipt(core);
  return {
    mode: 'fixture_hypothetical',
    receiptBytes: v.receiptBytes,
    pinnedReceiptDigest: v.pinnedReceiptDigest,
    claims: v.claims,
    expectedRatingFingerprint: core.ratingFingerprint,
    captureProducerSha: REF_SHA,
    expectedSeason: 2026,
    prospectiveWeek: 7,
    ...overrides,
  };
}

function game(
  gameId: string,
  homeTeamId: string,
  awayTeamId: string,
  overrides: Partial<MlCal1GameMeta> = {}
): MlCal1GameMeta {
  return {
    gameId,
    season: 2026,
    week: 7,
    homeTeamId,
    awayTeamId,
    homeTeamName: homeTeamId,
    awayTeamName: awayTeamId,
    kickoffAsKnown: KICK,
    neutralSite: false,
    ...overrides,
  };
}

interface FixtureOptions {
  ratings?: MlCal1RawRatingRow[];
  games?: MlCal1GameMeta[];
  marketLines?: MlCal1MarketLineCandidate[];
  fbsTeamIds?: string[];
  /** null → no lifecycle claims and no bytes. */
  receipt?: Partial<ReceiptCore> | null;
  lifecycleMode?: MlCal1FixtureInput['lifecycleMode'];
  base?: Partial<MlCal1FixtureInput>;
}

/** Fixture with a properly built receipt (bytes + pinned digest + claims). */
function makeFixture(opts: FixtureOptions = {}): MlCal1FixtureInput {
  const ratings = opts.ratings ?? [rating('alabama', 12.5), rating('georgia', 4.25)];
  const games = opts.games ?? [game(GAME_ID, 'alabama', 'georgia')];
  const marketLines =
    opts.marketLines ??
    mlPair({
      gameId: GAME_ID,
      homeTeamId: 'alabama',
      awayTeamId: 'georgia',
      homePrice: -150,
      awayPrice: 130,
      timestamp: '2026-10-12T17:45:00.000Z',
    });

  const fx: MlCal1FixtureInput = {
    captureId: 'fixture-capture-001',
    season: 2026,
    week: 7,
    repositorySha: REF_SHA,
    captureStartTime: '2026-10-12T17:59:50.000Z',
    snapshotReferenceTime: SNAP,
    games,
    fbsTeamIds: opts.fbsTeamIds ?? ['alabama', 'georgia', 'troy', 'southern-mississippi'],
    ratings,
    marketLines,
    lifecycleMode: opts.lifecycleMode ?? 'fixture_hypothetical',
    lifecycleReceipt: null,
    ...opts.base,
  };

  if (opts.receipt !== null) {
    const v = buildVerifiedReceipt(receiptCore(ratings, opts.receipt ?? {}));
    fx.receiptBytes = v.receiptBytes;
    fx.pinnedReceiptDigest = v.pinnedReceiptDigest;
    fx.lifecycleReceipt = v.claims;
  }
  return fx;
}

function plan(fx: MlCal1FixtureInput, extra: { publicationTime?: string; now?: () => Date } = {}) {
  return planMlCal1Capture(fx, { now: extra.now ?? NOW_OK, publicationTime: extra.publicationTime });
}

function mutableClock(startIso: string) {
  let t = Date.parse(startIso);
  return {
    now: () => new Date(t),
    set: (value: string) => {
      t = Date.parse(value);
    },
  };
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------------------
// CLI argument validation (before any DB)
// ---------------------------------------------------------------------------

describe('CLI argument validation (before any DB access)', () => {
  it('requires explicit season=2026 and an integer week >= 1', () => {
    expect(() => parseMlCal1CliArgs(['--week', '7'])).toThrow(/season_required/);
    expect(() => parseMlCal1CliArgs(['--season', '2025', '--week', '7'])).toThrow(
      /unsupported_season:2025/
    );
    expect(() => parseMlCal1CliArgs(['--season', '2026'])).toThrow(/invalid_week/);
    expect(() => parseMlCal1CliArgs(['--season', '2026', '--week', '1.5'])).toThrow(/invalid_week/);
    expect(() => parseMlCal1CliArgs(['--season', '2026', '--week', '0'])).toThrow(/invalid_week/);
    expect(parseMlCal1CliArgs(['--season', '2026', '--week', '7']).week).toBe(7);
    expect(parseMlCal1CliArgs(['--season=2026', '--week=8']).week).toBe(8);
  });

  it('rejects COMMIT / confirmation / unknown flags and missing values', () => {
    const base = ['--season', '2026', '--week', '7'];
    for (const flag of ['--mode', '--confirm', '--confirmation', '--commit', '--apply']) {
      expect(() => parseMlCal1CliArgs([...base, flag, 'COMMIT'])).toThrow(/no-commit-mode/);
    }
    expect(() => parseMlCal1CliArgs([...base, '--bogus'])).toThrow(/unsupported_cli_flag:--bogus/);
    expect(() => parseMlCal1CliArgs([...base, '--out'])).toThrow(/missing_value_for_flag:--out/);
  });

  it('rejects --repository-sha without --fixture and allows it with a fixture', () => {
    const sha = 'a'.repeat(40);
    const base = ['--season', '2026', '--week', '7'];
    expect(() => parseMlCal1CliArgs([...base, '--repository-sha', sha])).toThrow(
      /repository_sha_not_allowed_in_live_mode/
    );
    expect(() =>
      parseMlCal1CliArgs([...base, '--enable-live-db-read', '--repository-sha', sha])
    ).toThrow(/repository_sha_not_allowed_in_live_mode/);

    const allowed = parseMlCal1CliArgs([...base, '--fixture', 'f.json', '--repository-sha', sha]);
    expect(allowed.repositorySha).toBe(sha);
    expect(allowed.fixturePath).toBe('f.json');

    expect(() =>
      parseMlCal1CliArgs([...base, '--fixture', 'f.json', '--repository-sha', 'not-a-sha'])
    ).toThrow(/invalid_repository_sha/);
  });

  it('rejects fixture + live read, unsafe capture ids and malformed pinned digests', () => {
    const base = ['--season', '2026', '--week', '7'];
    expect(() =>
      parseMlCal1CliArgs([...base, '--fixture', 'f.json', '--enable-live-db-read'])
    ).toThrow(/fixture_and_live_db_read_conflict/);
    expect(() => parseMlCal1CliArgs([...base, '--capture-id', '../evil'])).toThrow(
      /invalid_capture_id/
    );
    expect(() => parseMlCal1CliArgs([...base, '--pinned-lifecycle-digest', 'abc'])).toThrow(
      /invalid_pinned_lifecycle_digest/
    );
    expect(
      parseMlCal1CliArgs([...base, '--pinned-lifecycle-digest', 'A'.repeat(64)])
        .pinnedLifecycleDigest
    ).toBe('A'.repeat(64));
  });
});

// ---------------------------------------------------------------------------
// R1 ratings
// ---------------------------------------------------------------------------

describe('R1 — rating inputs', () => {
  it('null/null rating pair is never usable and never yields an available forecast', () => {
    const exported = exportRatingInput(rating('alabama', null, null));
    expect(exported.valueUsed).toBeNull();
    expect(exported.inputUsable).toBe(false);
    expect(exported.chosenField).toBe('default_zero');
    expect(exported.unavailableReasons).toContain('missing_rating_fields');

    const fx = makeFixture({
      ratings: [rating('alabama', null, null), rating('georgia', 4.25)],
    });
    const p = plan(fx);
    const row = p.bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.primaryEligibleCandidate).toBe(false);
    expect(row.modelOnlyEligible).toBe(false);
    expect(row.inGateForecast).toBe(false);
    expect(row.coreSpreadHma).toBeNull();
    expect(row.modelHomeWinProb).toBeNull();
    expect(row.selectionStatus).toBe('FORECAST_UNAVAILABLE');
    expect(row.unavailableReasons).toContain('home:missing_rating_fields');
    expect(p.bundle.envelope.counts.availableForecasts).toBe(0);
    expect(p.bundle.envelope.counts.modelOnlyEligible).toBe(0);
  });

  it('null/null on both teams still produces no forecast (no imputed zero spread)', () => {
    const fx = makeFixture({
      ratings: [rating('alabama', null, null), rating('georgia', null, null)],
    });
    const row = plan(fx).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.coreSpreadHma).toBeNull();
    expect(row.ratingDiff).toBeNull();
    expect(row.unavailableReasons).toEqual(
      expect.arrayContaining(['home:missing_rating_fields', 'away:missing_rating_fields'])
    );
  });

  it('Decimal(0)-like object is a valid usable zero (truthy before Number())', () => {
    const zero = { toString: () => '0', valueOf: () => 0 };
    const chosen = chooseRatingField({ powerRating: zero, rating: decimal(9) });
    expect(chosen.chosenField).toBe('powerRating');
    expect(chosen.value).toBe(0);

    const exported = exportRatingInput(rating('alabama', zero, null));
    expect(exported.valueUsed).toBe(0);
    expect(exported.inputUsable).toBe(true);
    expect(exported.powerRatingRaw).toBe('0');
    expect(exported.unavailableReasons).toEqual([]);

    const fx = makeFixture({ ratings: [rating('alabama', zero, null), rating('georgia', 4.25)] });
    const row = plan(fx).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(true);
    expect(row.homeRatingInput!.valueUsed).toBe(0);
    expect(row.ratingDiff).toBe(0 - 4.25);
  });

  it('numeric 0 is falsy like production: falls through to rating, else is not usable', () => {
    const fallsThrough = chooseRatingField({ powerRating: 0, rating: decimal(9) });
    expect(fallsThrough.chosenField).toBe('rating');
    expect(fallsThrough.value).toBe(9);

    const bothZero = chooseRatingField({ powerRating: 0, rating: 0 });
    expect(bothZero.chosenField).toBe('default_zero');
    expect(bothZero.value).toBeNull();
    expect(bothZero.reasons).toContain('falsy_rating_fields_defaulted_zero');
  });

  it('non-finite rating values are unusable', () => {
    const nan = { toString: () => 'NaN', valueOf: () => Number.NaN };
    const inf = { toString: () => 'Infinity', valueOf: () => Number.POSITIVE_INFINITY };
    for (const bad of [nan, inf]) {
      const exported = exportRatingInput(rating('alabama', bad, null));
      expect(exported.valueUsed).toBeNull();
      expect(exported.inputUsable).toBe(false);
      expect(exported.unavailableReasons).toContain('nonfinite_rating_value');
    }
    const row = plan(
      makeFixture({
        ratings: [rating('alabama', nan, null), rating('georgia', 4.25)],
      })
    ).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.unavailableReasons).toContain('home:nonfinite_rating_value');
  });

  it('F4: whitespace-only / blank Decimal-like / boolean / array never become zero forecasts', () => {
    const whitespace = chooseRatingField({ powerRating: ' ', rating: null });
    expect(whitespace.value).toBeNull();
    expect(whitespace.reasons).toContain('blank_or_whitespace_rating_value');

    const blankObj = chooseRatingField({
      powerRating: { toString: () => '   ' },
      rating: null,
    });
    expect(blankObj.value).toBeNull();
    expect(blankObj.reasons).toContain('blank_or_whitespace_rating_value');

    expect(chooseRatingField({ powerRating: true as unknown as number, rating: null }).reasons).toContain(
      'unsupported_rating_value_type'
    );
    expect(chooseRatingField({ powerRating: [1] as unknown as number, rating: null }).reasons).toContain(
      'unsupported_rating_value_type'
    );

    const fx = makeFixture({
      ratings: [rating('alabama', ' ', null), rating('georgia', 4.25)],
    });
    // Rebuild lifecycle so fingerprint matches the malformed input.
    const rebuilt = makeFixture({
      ratings: fx.ratings,
      games: fx.games,
      marketLines: fx.marketLines,
    });
    const row = plan(rebuilt).bundle.forecasts.rows[0];
    expect(row.homeRatingInput!.valueUsed).toBeNull();
    expect(row.forecastAvailable).toBe(false);
    expect(row.primaryEligibleCandidate).toBe(false);
    expect(row.modelOnlyEligible).toBe(false);
    expect(row.unavailableReasons).toContain('home:blank_or_whitespace_rating_value');
  });

  it('F4: valid negative/positive decimal strings and Decimal(0) remain usable', () => {
    expect(chooseRatingField({ powerRating: '-3.5', rating: null }).value).toBe(-3.5);
    expect(chooseRatingField({ powerRating: '12.25', rating: null }).value).toBe(12.25);
    expect(chooseRatingField({ powerRating: { toString: () => '0' }, rating: null }).value).toBe(0);
  });

  it('wrong model version is unusable and ignored by the planner', () => {
    const v2 = exportRatingInput(rating('alabama', 12, null, { modelVersion: 'v2' }));
    expect(v2.inputUsable).toBe(false);
    expect(v2.unavailableReasons).toContain('incorrect_model_version');

    const row = plan(
      makeFixture({
        ratings: [rating('alabama', 12, null, { modelVersion: 'v2' }), rating('georgia', 4.25)],
      })
    ).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.unavailableReasons).toContain('missing_home_v1_rating');
  });

  it('a missing rating row makes the forecast unavailable (never defaulted)', () => {
    const row = plan(makeFixture({ ratings: [rating('alabama', 12.5)] })).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.unavailableReasons).toContain('missing_away_v1_rating');
    expect(row.awayRatingInput).toBeNull();
  });

  it('duplicate V1 rating rows block eligibility', () => {
    const fx = makeFixture({
      ratings: [rating('alabama', 12.5), rating('alabama', 13), rating('georgia', 4.25)],
    });
    const p = plan(fx);
    const row = p.bundle.forecasts.rows[0];
    expect(p.primaryReadinessBlocked).toBe(true);
    expect(p.primaryBlockReasons).toEqual(
      expect.arrayContaining(['duplicate_rating_rows:2026|alabama|v1', 'duplicate_v1_rating_team:alabama'])
    );
    expect(row.forecastAvailable).toBe(false);
    expect(row.primaryEligibleCandidate).toBe(false);
    expect(row.modelOnlyEligible).toBe(false);
    expect(row.homeRatingInput!.inputUsable).toBe(false);
    expect(row.homeRatingInput!.unavailableReasons).toContain('duplicate_v1_rating_rows');
  });

  it('duplicate rows of an unrelated season do not block this capture’s identity', () => {
    const fx = makeFixture({
      ratings: [
        rating('alabama', 12.5),
        rating('georgia', 4.25),
        rating('troy', 1, null, { season: 2025 }),
        rating('troy', 2, null, { season: 2025 }),
      ],
    });
    const p = plan(fx);
    const row = p.bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(true);
    expect(p.primaryBlockReasons).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/duplicate_v1_rating_team/)])
    );
  });

  it('production HFA / margin parity: direct margin equals helper HFA + rating diff', () => {
    for (const [homeTeam, neutral] of [
      ['alabama', false],
      ['alabama', true],
      ['james-madison', false],
      ['troy', false],
    ] as Array<[string, boolean]>) {
      const hfa = computeEffectiveHfa(homeTeam, neutral);
      const got = computeDirectV1Margin({
        homeValue: 12.5,
        awayValue: 4.25,
        homeTeamId: homeTeam,
        neutralSite: neutral,
      });
      expect(got.coreSpreadHma).toBe(12.5 - 4.25 + hfa.effectiveHfa);
      expect(got.hfa.effectiveHfa).toBe(hfa.effectiveHfa);
      expect(got.hfa.baseHfa).toBe(hfa.baseHfa);
      expect(got.hfa.teamAdjustment).toBe(hfa.teamAdjustment);
      expect(got.hfa.rawHfa).toBe(hfa.rawHfa);
      expect(got.hfa.hfaConfigHash).toBe(getActiveHfaConfigHash());
    }
    expect(computeDirectV1Margin({ homeValue: 10, awayValue: 3, homeTeamId: 'alabama', neutralSite: true }).hfa
      .effectiveHfa).toBe(0);
  });

  it('chosen rating value matches production Number(power || rating || 0) when usable', () => {
    const samples: Array<[MlCal1DecimalLike, MlCal1DecimalLike]> = [
      [decimal(3.5), decimal(9)],
      [0, decimal(9)],
      [null, decimal(-2.25)],
      ['7.125', '1'],
      [decimal(0), decimal(5)],
    ];
    for (const [power, rate] of samples) {
      const production = Number(power || rate || 0);
      const chosen = chooseRatingField({ powerRating: power, rating: rate });
      expect(chosen.value).toBe(production);
    }
  });

  it('forecast reproduces from exported inputs and probability clipping is unchanged', () => {
    const row = plan(makeFixture()).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(true);
    const repro = computeDirectV1Margin({
      homeValue: row.homeRatingInput!.valueUsed!,
      awayValue: row.awayRatingInput!.valueUsed!,
      homeTeamId: row.homeTeamId,
      neutralSite: row.neutralSite,
    });
    expect(repro.coreSpreadHma).toBe(row.coreSpreadHma);
    const probs = modelWinProbsFromCoreSpreadHma(repro.coreSpreadHma);
    expect(probs.modelHomeWinProb).toBe(row.modelHomeWinProb);
    expect(probs.modelAwayWinProb).toBe(row.modelAwayWinProb);
    expect(modelWinProbsFromCoreSpreadHma(100).modelHomeWinProb).toBe(0.99);
    expect(modelWinProbsFromCoreSpreadHma(-100).modelHomeWinProb).toBe(0.01);
    const mid = modelWinProbsFromCoreSpreadHma(0);
    expect(mid.modelHomeWinProb + mid.modelAwayWinProb).toBeCloseTo(1, 12);
  });

  it('rating drift changes the row hash and the fingerprint', () => {
    const a = exportRatingInput(rating('alabama', 10));
    const b = exportRatingInput(rating('alabama', 10.0001));
    expect(a.rowContentHash).not.toBe(b.rowContentHash);
    expect(buildRatingFingerprint({ alabama: a })).not.toBe(buildRatingFingerprint({ alabama: b }));
  });
});

// ---------------------------------------------------------------------------
// R2 timing / publication
// ---------------------------------------------------------------------------

describe('R2 — snapshot reference time and input aliasing', () => {
  it('accepts snapshotReferenceTime, the captureEndTime alias, or both when equal', () => {
    const onlySnap = makeFixture({ base: { snapshotReferenceTime: SNAP, captureEndTime: undefined } });
    const onlyAlias = makeFixture({ base: { snapshotReferenceTime: undefined, captureEndTime: SNAP } });
    const both = makeFixture({ base: { snapshotReferenceTime: SNAP, captureEndTime: SNAP } });
    for (const fx of [onlySnap, onlyAlias, both]) {
      const env = plan(fx).bundle.envelope;
      expect(env.snapshotReferenceTime).toBe(SNAP);
      expect(env.captureEndTime).toBe(SNAP);
      expect(env.predictionReferenceTime).toBe(SNAP);
      expect(env.timingRule.marketAsOfUses).toBe('snapshotReferenceTime');
      expect(env.timingRule.marketAgeUses).toBe('snapshotReferenceTime');
      expect(env.timingRule.knownAtUses).toBe('snapshotReferenceTime');
      expect(env.timingRule.laterTimestampsNeverSalvageStaleMarkets).toBe(true);
      expect(env.timingRule.minPreKickoffMs).toBe(ML_CAL_1_MIN_PRE_KICKOFF_MS);
      expect(env.timingRule.maxMarketAgeSecondsInclusive).toBe(ML_CAL_1_MAX_MARKET_AGE_SECONDS);
    }
    expect(plan(onlySnap).bundle.forecasts.rows[0].predictionTime).toBe(SNAP);
  });

  it('rejects mismatched, missing, or pre-start reference times', () => {
    expect(() =>
      plan(makeFixture({ base: { snapshotReferenceTime: SNAP, captureEndTime: iso(1000) } }))
    ).toThrow(/snapshot_reference_time_capture_end_time_mismatch/);
    expect(() =>
      plan(makeFixture({ base: { snapshotReferenceTime: undefined, captureEndTime: undefined } }))
    ).toThrow(/snapshot_reference_time_required/);
    expect(() =>
      plan(makeFixture({ base: { captureStartTime: iso(1000) } }))
    ).toThrow(/snapshot_reference_before_capture_start/);
  });

  it('captureStartTime is diagnostic only: it never changes market evidence', () => {
    const early = plan(makeFixture({ base: { captureStartTime: iso(-3_600_000) } })).bundle;
    const late = plan(makeFixture({ base: { captureStartTime: iso(-1000) } })).bundle;
    expect(stableStringify(early.markets)).toBe(stableStringify(late.markets));
    expect(stableStringify(early.forecasts.rows[0].coreSpreadHma)).toBe(
      stableStringify(late.forecasts.rows[0].coreSpreadHma)
    );
  });

  it('computationTime follows the injected clock and does not move market as-of', () => {
    const p = plan(makeFixture(), { now: () => new Date('2026-10-12T18:40:00.000Z') });
    expect(p.bundle.envelope.computationTime).toBe('2026-10-12T18:40:00.000Z');
    expect(p.bundle.envelope.publicationTime).toBe('2026-10-12T18:40:00.000Z');
    expect(p.bundle.markets.moneyline[0].observationAgeSeconds).toBe(900);
    expect(p.bundle.markets.moneyline[0].available).toBe(true);
  });
});

describe('R2 — publication boundary via planMlCal1Capture options', () => {
  it('on-time publication leaves the forecast available and not late', () => {
    const p = plan(makeFixture(), { publicationTime: '2026-10-12T18:00:30.000Z' });
    const row = p.bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(true);
    expect(row.lateCapture).toBe(false);
    expect(row.publicationTime).toBe('2026-10-12T18:00:30.000Z');
    expect(row.unavailableReasons).toEqual([]);
    expect(p.bundle.envelope.publicationFinalized).toBe(false);
  });

  it('publicationTime === kickoff - 30m is allowed', () => {
    const row = plan(makeFixture(), { publicationTime: KICK_MINUS_30M }).bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(true);
    expect(row.lateCapture).toBe(false);
    expect(row.unavailableReasons).toEqual([]);
  });

  it('1ms past kickoff - 30m downgrades with late-capture evidence retained', () => {
    const p = plan(makeFixture(), { publicationTime: iso(1, KICK_MINUS_30M) });
    const row = p.bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.lateCapture).toBe(true);
    expect(row.primaryEligibleCandidate).toBe(false);
    expect(row.modelOnlyEligible).toBe(false);
    expect(row.unavailableReasons).toContain('publication_within_30m_of_kickoff_or_later');
    expect(row.unavailableReasons).not.toContain('publication_at_or_after_kickoff');
    expect(p.bundle.markets.moneyline[0].available).toBe(true);
  });

  it('publication at or after kickoff carries both reasons', () => {
    const p = plan(makeFixture(), { publicationTime: KICK });
    const row = p.bundle.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.unavailableReasons).toEqual(
      expect.arrayContaining([
        'publication_within_30m_of_kickoff_or_later',
        'publication_at_or_after_kickoff',
      ])
    );
  });

  it('publication before the snapshot reference blocks primary readiness', () => {
    const p = plan(makeFixture(), { publicationTime: iso(-60_000) });
    expect(p.primaryReadinessBlocked).toBe(true);
    expect(p.primaryBlockReasons).toContain('publication_before_snapshot_reference');
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(false);
    expect(p.bundle.forecasts.rows[0].unavailableReasons).toContain(
      'publication_before_snapshot_reference'
    );
  });

  it('market age is evaluated at snapshotReferenceTime, not publication time', () => {
    // Fresh relative to the snapshot (900s); publication 40 minutes later must not age it out.
    const fresh = plan(makeFixture(), { publicationTime: '2026-10-12T18:40:00.000Z' });
    expect(fresh.bundle.markets.moneyline[0].available).toBe(true);
    expect(fresh.bundle.markets.moneyline[0].observationAgeSeconds).toBe(900);

    // Stale relative to the snapshot (2400s) is not salvaged by any publication time.
    const staleLines = mlPair({
      gameId: GAME_ID,
      homeTeamId: 'alabama',
      awayTeamId: 'georgia',
      homePrice: -150,
      awayPrice: 130,
      timestamp: iso(-2400 * 1000),
    });
    for (const publicationTime of [SNAP, '2026-10-12T18:10:00.000Z', KICK_MINUS_30M]) {
      const stale = plan(makeFixture({ marketLines: staleLines }), { publicationTime });
      expect(stale.bundle.markets.moneyline[0].available).toBe(false);
      expect(stale.bundle.markets.moneyline[0].rejectionReasons).toContain('no_coherent_moneyline_pair');
      expect(
        stale.bundle.markets.candidateRejectionLedger.some((e) =>
          e.reasons.includes('observation_stale_above_1800s')
        )
      ).toBe(true);
      // The Core forecast itself is unaffected by a missing market.
      expect(stale.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    }

    // A row observed after the snapshot is never salvaged by a later computation/publication clock.
    const future = mlPair({
      gameId: GAME_ID,
      homeTeamId: 'alabama',
      awayTeamId: 'georgia',
      homePrice: -150,
      awayPrice: 130,
      timestamp: iso(3000),
    });
    const afterwards = plan(makeFixture({ marketLines: future }), {
      now: () => new Date('2026-10-12T19:00:00.000Z'),
    });
    expect(afterwards.bundle.markets.moneyline[0].available).toBe(false);
    expect(
      afterwards.bundle.markets.candidateRejectionLedger.some((e) =>
        e.reasons.includes('observation_timestamp_after_reference')
      )
    ).toBe(true);
  });
});

describe('R2 — finalizePublicationEligibility (pure downgrade)', () => {
  it('on-time publication leaves eligibility unchanged and does not mutate the input', () => {
    const p = plan(makeFixture());
    const before = stableStringify(p.bundle);
    const finalized = finalizePublicationEligibility(p.bundle, '2026-10-12T18:01:00.000Z');
    expect(stableStringify(p.bundle)).toBe(before);

    const a = p.bundle.forecasts.rows[0];
    const b = finalized.forecasts.rows[0];
    expect(b.forecastAvailable).toBe(a.forecastAvailable);
    expect(b.primaryEligibleCandidate).toBe(a.primaryEligibleCandidate);
    expect(b.modelOnlyEligible).toBe(a.modelOnlyEligible);
    expect(b.coreSpreadHma).toBe(a.coreSpreadHma);
    expect(b.publicationTime).toBe('2026-10-12T18:01:00.000Z');
    expect(finalized.envelope.publicationFinalized).toBe(true);
    expect(finalized.envelope.publicationDowngradedGameIds).toEqual([]);
    expect(finalized.envelope.counts.availableForecasts).toBe(1);
  });

  it('boundary exactly at kickoff - 30m is retained; +1ms is downgraded', () => {
    const p = plan(makeFixture());
    const atBoundary = finalizePublicationEligibility(p.bundle, KICK_MINUS_30M);
    expect(atBoundary.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(atBoundary.envelope.publicationDowngradedGameIds).toEqual([]);

    const late = finalizePublicationEligibility(p.bundle, iso(1, KICK_MINUS_30M));
    const row = late.forecasts.rows[0];
    expect(row.forecastAvailable).toBe(false);
    expect(row.primaryEligibleCandidate).toBe(false);
    expect(row.modelOnlyEligible).toBe(false);
    expect(row.coreSpreadHma).toBeNull();
    expect(row.modelHomeWinProb).toBeNull();
    expect(row.selection).toBeNull();
    expect(row.selectionStatus).toBe('FORECAST_UNAVAILABLE');
    expect(row.primaryEligibilityReasons).toContain('publication_timing_ineligible');
    expect(late.envelope.publicationDowngradedGameIds).toEqual([GAME_ID]);
    expect(late.envelope.counts.availableForecasts).toBe(0);
    expect(late.envelope.counts.selectedBets).toBe(0);
  });

  it('crossing kickoff itself downgrades; downgrade never re-upgrades', () => {
    const p = plan(makeFixture());
    const crossed = finalizePublicationEligibility(p.bundle, KICK);
    expect(crossed.forecasts.rows[0].forecastAvailable).toBe(false);
    expect(crossed.forecasts.rows[0].unavailableReasons).toContain('publication_at_or_after_kickoff');

    // Re-finalizing an already-downgraded bundle at an early time does not restore it.
    const again = finalizePublicationEligibility(crossed, '2026-10-12T18:00:30.000Z');
    expect(again.forecasts.rows[0].forecastAvailable).toBe(false);
  });

  it('publication before the snapshot blocks primary readiness', () => {
    const p = plan(makeFixture());
    const early = finalizePublicationEligibility(p.bundle, iso(-1000));
    expect(early.envelope.primaryReadinessBlocked).toBe(true);
    expect(early.envelope.status).toBe('PRIMARY_READINESS_BLOCKED');
    expect(early.envelope.primaryBlockReasons).toContain('publication_before_snapshot_reference');
    expect(early.forecasts.rows[0].forecastAvailable).toBe(false);
  });
});

describe('R2 — writeCaptureArtifactsAtomic seal-time publication', () => {
  it('retakes publicationTime at seal and keeps on-time forecasts', () => {
    const root = makeTmp();
    const p = plan(makeFixture());
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'seal-on-time',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
    });
    expect(written.publicationTime).toBe('2026-10-12T18:00:10.000Z');
    expect(written.bundle.envelope.publicationFinalized).toBe(true);
    expect(written.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(written.invalidatedGameIds).toEqual([]);
    expect(written.publicationInvalidationPath).toBeNull();
    expect(written.terminalStatus).toBe('EVIDENCE_CAPTURED');
    expect(written.primaryReadinessBlockedEffective).toBe(false);
    expect(fs.existsSync(written.terminalReceiptPath)).toBe(true);
    expect(fs.existsSync(written.packageChecksumsPath)).toBe(true);
    // Without external pins: structural OK, but eligibility is not accepted.
    const structural = readCaptureTerminalResult({ rootDir: root, captureId: 'seal-on-time' });
    expect(structural.terminalStatus).toBe('EVIDENCE_CAPTURED');
    expect(structural.structuralConsistencyVerified).toBe(true);
    expect(structural.independentlyVerifiedIntegrity).toBe(false);
    expect(structural.eligibilityAccepted).toBe(false);
    expect(structural.effectiveCounts.primaryEligibleCandidates).toBe(
      written.effectiveCounts.primaryEligibleCandidates
    );
    // Write-time digests are the external pin for this process.
    const verified = readCaptureTerminalResult({
      rootDir: root,
      captureId: 'seal-on-time',
      expectedManifestSha256: written.manifestSha256,
      expectedTerminalSha256: written.terminalSha256,
      expectedInvalidationSha256: written.invalidationSha256,
      expectedPackageChecksumsSha256: written.packageChecksumsSha256,
    });
    expect(verified.independentlyVerifiedIntegrity).toBe(true);
    expect(verified.eligibilityAccepted).toBe(true);
    // Planning result is untouched (pure).
    expect(p.bundle.envelope.publicationFinalized).toBe(false);
  });

  it('a clock already past kickoff-30 at seal downgrades the sealed members', () => {
    const root = makeTmp();
    const p = plan(makeFixture());
    const clock = mutableClock(iso(60_000, KICK_MINUS_30M));
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'seal-late',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
    });
    const sealed = readJson(path.join(written.captureDir, 'forecasts.json')).rows[0];
    expect(sealed.forecastAvailable).toBe(false);
    expect(sealed.coreSpreadHma).toBeNull();
    expect(sealed.lateCapture).toBe(true);
    const env = readJson(path.join(written.captureDir, 'envelope.json'));
    expect(env.publicationDowngradedGameIds).toEqual([GAME_ID]);
    expect(env.counts.availableForecasts).toBe(0);
    expect(written.publicationInvalidationPath).toBeNull();
  });

  it('beforeRename delay crossing kickoff-30 writes an external invalidation, sealed bytes unchanged', () => {
    const root = makeTmp();
    const p = plan(makeFixture());
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'delay-1',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
    });

    expect(written.bundle.envelope.publicationTime).toBe('2026-10-12T18:00:10.000Z');
    expect(written.invalidatedGameIds).toEqual([GAME_ID]);
    expect(written.publicationInvalidationPath).toBe(
      path.join(root, 'delay-1.publication-invalidation.json')
    );
    expect(written.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(written.primaryReadinessBlockedEffective).toBe(true);
    expect(written.effectiveCounts.primaryEligibleCandidates).toBe(0);
    expect(written.effectiveCounts.availableForecasts).toBe(0);
    // Sealed forecast still reports what was true at publication time (historical evidence).
    expect(readJson(path.join(written.captureDir, 'forecasts.json')).rows[0].forecastAvailable).toBe(
      true
    );
    expect(readJson(path.join(written.captureDir, 'forecasts.json')).rows[0].primaryEligibleCandidate).toBe(
      true
    );

    const receipt = readJson(written.publicationInvalidationPath!);
    expect(receipt.kind).toBe('publication-invalidation');
    expect(receipt.invalidatedGameIds).toEqual([GAME_ID]);
    expect(receipt.sealedMembersUnchanged).toBe(true);
    expect(receipt.manifestSha256).toBe(written.manifestSha256);
    expect(receipt.providerCalls).toBe(0);
    expect(receipt.businessDataWrites).toBe(0);
    // The invalidation lives outside the sealed directory.
    expect(fs.readdirSync(written.captureDir)).not.toContain('delay-1.publication-invalidation.json');
    expect(sha256Utf8Bytes(fs.readFileSync(written.manifestPath))).toBe(written.manifestSha256);

    const terminal = readCaptureTerminalResult({
      rootDir: root,
      captureId: 'delay-1',
      expectedManifestSha256: written.manifestSha256,
      expectedTerminalSha256: written.terminalSha256,
      expectedInvalidationSha256: written.invalidationSha256,
      expectedPackageChecksumsSha256: written.packageChecksumsSha256,
    });
    expect(terminal.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(terminal.effectiveCounts.primaryEligibleCandidates).toBe(0);
    expect(terminal.invalidatedGameIds).toEqual([GAME_ID]);
    expect(terminal.independentlyVerifiedIntegrity).toBe(true);
    expect(terminal.eligibilityAccepted).toBe(false);
  });

  it('F2 reproduction A: semantic terminal edit with unchanged manifestSha256 fails closed', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'repro-a',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
    });
    expect(written.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(written.invalidatedGameIds).toEqual([GAME_ID]);
    expect(fs.existsSync(written.publicationInvalidationPath!)).toBe(true);

    // Edit only the terminal: restore success-looking claims while keeping manifestSha256.
    const honest = JSON.parse(fs.readFileSync(written.terminalReceiptPath, 'utf8'));
    const tampered = {
      ...honest,
      terminalStatus: 'EVIDENCE_CAPTURED',
      invalidatedGameIds: [],
      effectiveCounts: honest.sealedCounts,
    };
    fs.writeFileSync(written.terminalReceiptPath, `${stableStringify(tampered)}\n`);

    // Fail closed: package pin (if checked) and/or recomputed invalidation rejects the lie.
    // Semantic recomputation is authoritative even when manifestSha256 is left unchanged.
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'repro-a' })
    ).toThrow(
      /package_checksums_digest_mismatch|terminal_invalidated_game_ids_mismatch|terminal_status_mismatch|terminal_effective_counts_mismatch/
    );

    // After removing the package pin, recomputed timing still rejects the semantic lie.
    if (fs.existsSync(written.packageChecksumsPath)) {
      fs.unlinkSync(written.packageChecksumsPath);
    }
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'repro-a' })
    ).toThrow(
      /terminal_invalidated_game_ids_mismatch|terminal_status_mismatch|terminal_effective_counts_mismatch/
    );
  });

  it('F2 reproduction B: modified manifested member fails closed on digest', () => {
    const root = makeTmp();
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'repro-b',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: () => new Date('2026-10-12T18:00:10.000Z'),
    });
    const envPath = path.join(written.captureDir, 'envelope.json');
    const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    env.counts = { ...env.counts, primaryEligibleCandidates: 999 };
    fs.writeFileSync(envPath, `${stableStringify(env)}\n`);
    // Manifest unchanged → member digest mismatch (never trust the tampered counts).
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'repro-b' })
    ).toThrow(/sealed_member_digest_mismatch:envelope\.json/);
  });

  it('F2: terminal count/status/time lies and wrong invalidation fail closed', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'term-lies',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
    });
    fs.unlinkSync(written.packageChecksumsPath);
    const honest = JSON.parse(fs.readFileSync(written.terminalReceiptPath, 'utf8'));

    const statusLie = {
      ...honest,
      terminalStatus: 'PRIMARY_READINESS_BLOCKED',
      manifestSha256: written.manifestSha256,
    };
    fs.writeFileSync(written.terminalReceiptPath, `${stableStringify(statusLie)}\n`);
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'term-lies' })
    ).toThrow(/terminal_status_mismatch/);

    const timeLie = {
      ...honest,
      postRenameCheckTime: '2026-10-12T18:00:11.000Z',
      invalidatedGameIds: honest.invalidatedGameIds,
      effectiveCounts: honest.effectiveCounts,
      terminalStatus: honest.terminalStatus,
    };
    fs.writeFileSync(written.terminalReceiptPath, `${stableStringify(timeLie)}\n`);
    // Earlier post-check may yield empty derived invalidation → ID/status mismatch vs claims.
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'term-lies' })
    ).toThrow(
      /terminal_invalidated_game_ids_mismatch|terminal_status_mismatch|publication_invalidation/
    );

    // Restore honest terminal; corrupt invalidation game-id set.
    fs.writeFileSync(written.terminalReceiptPath, `${stableStringify(honest)}\n`);
    const inv = JSON.parse(fs.readFileSync(written.publicationInvalidationPath!, 'utf8'));
    inv.invalidatedGameIds = ['not-a-real-game'];
    fs.writeFileSync(written.publicationInvalidationPath!, `${stableStringify(inv)}\n`);
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'term-lies' })
    ).toThrow(/publication_invalidation_game_ids_mismatch/);
  });

  it('F2: naked capture directory without terminal receipt fails closed', () => {
    const root = makeTmp();
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'naked-term',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: () => new Date('2026-10-12T18:00:10.000Z'),
    });
    fs.unlinkSync(written.terminalReceiptPath);
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'naked-term' })
    ).toThrow(/terminal_completion_receipt_missing/);
  });

  it('F2: tampered terminal receipt / missing invalidation fail closed', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'tamper-term',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
    });
    const honestTerminal = fs.readFileSync(written.terminalReceiptPath, 'utf8');
    const raw = JSON.parse(honestTerminal);
    raw.manifestSha256 = 'a'.repeat(64);
    fs.writeFileSync(written.terminalReceiptPath, JSON.stringify(raw));
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'tamper-term' })
    ).toThrow(/terminal_completion_manifest_digest_mismatch/);

    // Restore honest terminal, delete invalidation → fail closed.
    fs.writeFileSync(written.terminalReceiptPath, honestTerminal);
    fs.unlinkSync(written.publicationInvalidationPath!);
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'tamper-term' })
    ).toThrow(/publication_invalidation_receipt_missing/);
  });

  it('F2: invalidation write failure leaves no terminal success path', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'fail-inv',
        bundle: plan(makeFixture()).bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: clock.now,
        beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
        failInvalidationWrite: true,
      })
    ).toThrow(/publication_invalidation_write_forced_failure/);
    expect(fs.existsSync(path.join(root, 'fail-inv'))).toBe(true);
    expect(() =>
      readCaptureTerminalResult({ rootDir: root, captureId: 'fail-inv' })
    ).toThrow(/terminal_completion_receipt_missing/);
  });

  it('F2: committed fixture packages verify structurally and with package pins', () => {
    const packagesRoot = path.join(__dirname, 'fixtures', 'packages');
    const ontimeRoot = path.join(packagesRoot, 'ml-cal-1-demo-ontime');
    const delayedRoot = path.join(packagesRoot, 'ml-cal-1-demo-delayed');
    const ontimeIndex = readJson(path.join(ontimeRoot, 'PACKAGE_INDEX.json'));
    const delayedIndex = readJson(path.join(delayedRoot, 'PACKAGE_INDEX.json'));

    const ontime = readCaptureTerminalResult({
      rootDir: ontimeRoot,
      captureId: 'ml-cal-1-demo-ontime',
      expectedManifestSha256: ontimeIndex.manifestSha256,
      expectedTerminalSha256: ontimeIndex.terminalSha256,
      expectedInvalidationSha256: ontimeIndex.invalidationSha256,
      expectedPackageChecksumsSha256: ontimeIndex.packageChecksumsSha256,
    });
    expect(ontime.terminalStatus).toBe('EVIDENCE_CAPTURED');
    expect(ontime.eligibilityAccepted).toBe(true);
    expect(ontime.independentlyVerifiedIntegrity).toBe(true);
    expect(ontime.effectiveCounts.universeGames).toBe(3);
    expect(ontime.effectiveCounts.primaryEligibleCandidates).toBe(2);

    const delayed = readCaptureTerminalResult({
      rootDir: delayedRoot,
      captureId: 'ml-cal-1-demo-delayed',
      expectedManifestSha256: delayedIndex.manifestSha256,
      expectedTerminalSha256: delayedIndex.terminalSha256,
      expectedInvalidationSha256: delayedIndex.invalidationSha256,
      expectedPackageChecksumsSha256: delayedIndex.packageChecksumsSha256,
    });
    expect(delayed.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(delayed.eligibilityAccepted).toBe(false);
    expect(delayed.independentlyVerifiedIntegrity).toBe(true);
    expect(delayed.effectiveCounts.primaryEligibleCandidates).toBe(0);
    expect(delayed.invalidatedGameIds.length).toBeGreaterThanOrEqual(2);
    expect(delayed.publicationInvalidationPath).not.toBeNull();
  });

  it('F2: partial invalidation keeps unaffected games eligible in effective counts', () => {
    const root = makeTmp();
    const lateKick = '2026-10-13T23:00:00.000Z';
    const g2 = '2026-wk7-troy-southern-mississippi';
    const ratings = [
      rating('alabama', 12.5),
      rating('georgia', 4.25),
      rating('troy', 1.0),
      rating('southern-mississippi', -2.0),
    ];
    const fx = makeFixture({
      ratings,
      games: [
        game(GAME_ID, 'alabama', 'georgia'),
        game(g2, 'troy', 'southern-mississippi', { kickoffAsKnown: lateKick }),
      ],
      marketLines: [
        ...mlPair({
          gameId: GAME_ID,
          homeTeamId: 'alabama',
          awayTeamId: 'georgia',
          homePrice: -150,
          awayPrice: 130,
          timestamp: '2026-10-12T17:45:00.000Z',
        }),
        ...mlPair({
          gameId: g2,
          homeTeamId: 'troy',
          awayTeamId: 'southern-mississippi',
          homePrice: -110,
          awayPrice: -110,
          timestamp: '2026-10-12T17:45:00.000Z',
        }),
      ],
    });
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'partial-inv',
      bundle: plan(fx).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(iso(1, KICK_MINUS_30M)),
    });
    expect(written.invalidatedGameIds).toEqual([GAME_ID]);
    expect(written.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(written.effectiveCounts.availableForecasts).toBe(1);
    expect(written.effectiveCounts.primaryEligibleCandidates).toBe(1);
    // Sealed ledger retains both games; first still sealed as available historically.
    const sealed = readJson(path.join(written.captureDir, 'forecasts.json')).rows;
    expect(sealed).toHaveLength(2);
    expect(sealed.find((r: any) => r.gameId === GAME_ID).forecastAvailable).toBe(true);
    expect(sealed.find((r: any) => r.gameId === g2).forecastAvailable).toBe(true);
  });

  it('beforeRename delay crossing kickoff itself also invalidates', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'delay-kickoff',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(KICK),
    });
    expect(written.invalidatedGameIds).toEqual([GAME_ID]);
  });

  it('beforeRename delay landing exactly on kickoff - 30m is not invalidated', () => {
    const root = makeTmp();
    const clock = mutableClock('2026-10-12T18:00:10.000Z');
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'delay-boundary',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
      beforeRename: () => clock.set(KICK_MINUS_30M),
    });
    expect(written.invalidatedGameIds).toEqual([]);
    expect(written.publicationInvalidationPath).toBeNull();
  });

  it('sealing before the snapshot reference blocks primary readiness and manifests the receipt', () => {
    const root = makeTmp();
    const clock = mutableClock(iso(-60_000));
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'seal-before-snapshot',
      bundle: plan(makeFixture()).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: clock.now,
    });
    expect(written.bundle.envelope.status).toBe('PRIMARY_READINESS_BLOCKED');
    const manifest = readJson(written.manifestPath);
    expect(Object.keys(manifest.members)).toContain(ML_CAL_1_BLOCKED_RECEIPT_MEMBER);
  });
});

// ---------------------------------------------------------------------------
// R3 lifecycle
// ---------------------------------------------------------------------------

describe('R3 — lifecycle receipt verification', () => {
  const ratings = [rating('alabama', 12.5), rating('georgia', 4.25)];
  const core = receiptCore(ratings);

  it('a verified fixture receipt qualifies as fixtureHypothetical and never liveAccepted', () => {
    const result = qualifyLifecycleReceipt(lifecycleInput(core));
    expect(result.reasons).toEqual([]);
    expect(result.qualified).toBe(true);
    expect(result.fixtureHypothetical).toBe(true);
    expect(result.liveAccepted).toBe(false);
    expect(result.receiptIntegrityVerified).toBe(true);
    expect(result.mode).toBe('fixture_hypothetical');
    expect(result.verifiedReceiptDigest).toBe(sha256Utf8Bytes(stableStringify(core) + '\n'));
    expect(result.lifecycleSourceSha).toBe(LIFECYCLE_SHA);
    expect(result.producerRepositorySha).toBe(REF_SHA);
  });

  it('F1: self-created bytes + matching pin in live mode verify integrity but are NOT liveAccepted', () => {
    const result = qualifyLifecycleReceipt(lifecycleInput(core, { mode: 'live' }));
    expect(result.receiptIntegrityVerified).toBe(true);
    expect(result.qualified).toBe(false);
    expect(result.liveAccepted).toBe(false);
    expect(result.fixtureHypothetical).toBe(false);
    expect(result.reasons).toContain('lifecycle_trusted_acceptance_missing');
  });

  it('F1: liveAccepted requires an independently reviewed trust record matching the digest', () => {
    const v = buildVerifiedReceipt(core);
    const trust = trustFor(core, v.pinnedReceiptDigest);
    const result = qualifyLifecycleReceipt(
      lifecycleInput(core, { mode: 'live', trustedAcceptance: trust })
    );
    expect(result.receiptIntegrityVerified).toBe(true);
    expect(result.qualified).toBe(true);
    expect(result.liveAccepted).toBe(true);
  });

  it('F1: wrong/changed trusted pin or missing season binding fail closed', () => {
    const v = buildVerifiedReceipt(core);
    const wrongPin = qualifyLifecycleReceipt(
      lifecycleInput(core, {
        mode: 'live',
        trustedAcceptance: trustFor(core, v.pinnedReceiptDigest, {
          approvedReceiptDigest: 'b'.repeat(64),
        }),
      })
    );
    expect(wrongPin.liveAccepted).toBe(false);
    expect(wrongPin.reasons).toContain('lifecycle_trust_digest_mismatch');

    const noSeasonCore = { ...core };
    delete (noSeasonCore as { season?: number }).season;
    const missingSeasonFixture = qualifyLifecycleReceipt(lifecycleInput(noSeasonCore));
    expect(missingSeasonFixture.qualified).toBe(false);
    expect(missingSeasonFixture.reasons).toContain('lifecycle_season_binding_missing');

    const vNoSeason = buildVerifiedReceipt(noSeasonCore);
    const liveBound = qualifyLifecycleReceipt(
      lifecycleInput(noSeasonCore, {
        mode: 'live',
        trustedAcceptance: trustFor(noSeasonCore, vNoSeason.pinnedReceiptDigest, { season: 2026 }),
      })
    );
    expect(liveBound.liveAccepted).toBe(true);
    expect(liveBound.notes).toContain(
      'lifecycle_receipt_season_absent_requires_external_trust_binding'
    );
  });

  it('completedThroughWeek 6 is valid for prospective week 7; the producer SHA need not equal the lifecycle SHA', () => {
    const fx = makeFixture();
    const p = plan(fx);
    expect(p.lifecycle.qualified).toBe(true);
    expect(p.bundle.envelope.lifecycleSourceSha).toBe(LIFECYCLE_SHA);
    expect(p.bundle.envelope.producerRepositorySha).toBe(REF_SHA);
    expect(p.bundle.envelope.lifecycleQualification.fixtureHypothetical).toBe(true);
    expect(p.bundle.envelope.lifecycleQualification.liveAccepted).toBe(false);
    expect(p.primaryReadinessBlocked).toBe(false);
    expect(p.bundle.forecasts.rows[0].primaryEligibleCandidate).toBe(true);
  });

  it('rejects an invented digest (claims, pinned, or pinned with missing bytes)', () => {
    const v = buildVerifiedReceipt(core);
    const invented = 'a'.repeat(64);

    const claimInvented = qualifyLifecycleReceipt(
      lifecycleInput(core, { claims: { ...v.claims, receiptDigest: invented } })
    );
    expect(claimInvented.qualified).toBe(false);
    expect(claimInvented.reasons).toContain('lifecycle_receipt_digest_claim_mismatch');

    const pinnedInvented = qualifyLifecycleReceipt(
      lifecycleInput(core, { pinnedReceiptDigest: invented })
    );
    expect(pinnedInvented.qualified).toBe(false);
    expect(pinnedInvented.reasons).toContain('lifecycle_receipt_digest_pinned_mismatch');

    const noBytes = qualifyLifecycleReceipt(
      lifecycleInput(core, {
        receiptBytes: null,
        pinnedReceiptDigest: invented,
        claims: { ...v.claims, receiptDigest: invented },
      })
    );
    expect(noBytes.qualified).toBe(false);
    expect(noBytes.reasons).toContain('lifecycle_fixture_receipt_bytes_or_pin_missing');
  });

  it('rejects altered receipt bytes (content and whitespace)', () => {
    const v = buildVerifiedReceipt(core);
    const alteredContent = v.receiptBytes.replace('"canonicalWeight":1', '"canonicalWeight":0.75');
    expect(alteredContent).not.toBe(v.receiptBytes);
    const a = qualifyLifecycleReceipt(lifecycleInput(core, { receiptBytes: alteredContent }));
    expect(a.qualified).toBe(false);
    expect(a.reasons).toEqual(
      expect.arrayContaining([
        'lifecycle_receipt_digest_pinned_mismatch',
        'lifecycle_receipt_digest_claim_mismatch',
        'lifecycle_claims_do_not_match_receipt_bytes',
      ])
    );

    const whitespace = qualifyLifecycleReceipt(
      lifecycleInput(core, { receiptBytes: v.receiptBytes + ' ' })
    );
    expect(whitespace.qualified).toBe(false);
    expect(whitespace.reasons).toContain('lifecycle_receipt_digest_pinned_mismatch');
  });

  it('bytes that agree with the pinned digest but are not JSON are unparseable', () => {
    const junk = 'not json\n';
    const digest = sha256Utf8Bytes(junk);
    const result = qualifyLifecycleReceipt(
      lifecycleInput(core, {
        receiptBytes: junk,
        pinnedReceiptDigest: digest,
        claims: { ...buildVerifiedReceipt(core).claims, receiptDigest: digest },
      })
    );
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('lifecycle_receipt_bytes_unparseable');
  });

  it('self-asserted acceptedImmutable without bytes never qualifies (live → verification unavailable)', () => {
    const v = buildVerifiedReceipt(core);
    const live = qualifyLifecycleReceipt(
      lifecycleInput(core, { mode: 'live', receiptBytes: null, pinnedReceiptDigest: null })
    );
    expect(v.claims.acceptedImmutable).toBe(true);
    expect(live.qualified).toBe(false);
    expect(live.liveAccepted).toBe(false);
    expect(live.reasons).toEqual(['lifecycle_verification_unavailable']);

    const liveNoPin = qualifyLifecycleReceipt(
      lifecycleInput(core, { mode: 'live', pinnedReceiptDigest: null })
    );
    expect(liveNoPin.reasons).toContain('lifecycle_verification_unavailable');

    // Through the planner: evidence is still emitted but primary readiness is blocked.
    const fx = makeFixture({ lifecycleMode: 'live' });
    fx.receiptBytes = null;
    fx.pinnedReceiptDigest = null;
    const p = plan(fx);
    expect(p.bundle.envelope.lifecycleQualification.liveAccepted).toBe(false);
    expect(p.primaryReadinessBlocked).toBe(true);
    expect(p.status).toBe('PRIMARY_READINESS_BLOCKED');
    expect(p.primaryBlockReasons).toContain('lifecycle:lifecycle_verification_unavailable');
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(p.bundle.forecasts.rows[0].primaryEligibleCandidate).toBe(false);
  });

  it('claims that disagree with the bytes are rejected even when the digests agree', () => {
    const honest = buildVerifiedReceipt({ ...core, acceptedImmutable: false });
    const result = qualifyLifecycleReceipt(
      lifecycleInput(core, {
        receiptBytes: honest.receiptBytes,
        pinnedReceiptDigest: honest.pinnedReceiptDigest,
        claims: { ...honest.claims, acceptedImmutable: true },
      })
    );
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'lifecycle_claims_do_not_match_receipt_bytes',
        'lifecycle_receipt_not_accepted_immutable',
      ])
    );
  });

  it('week 0 with weight 1 fails weight/week consistency', () => {
    const bad = lifecycleInput({ ...core, completedThroughWeek: 0, canonicalWeight: 1 });
    const result = qualifyLifecycleReceipt(bad);
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'lifecycle_canonical_weight_inconsistent_with_week',
        'lifecycle_completed_through_week_below_full_weight_week',
      ])
    );
  });

  it('partial weights, early weeks and non-prospective weeks fail', () => {
    const week5 = qualifyLifecycleReceipt(
      lifecycleInput({ ...core, completedThroughWeek: 5, canonicalWeight: 0.75 })
    );
    expect(week5.qualified).toBe(false);
    expect(week5.reasons).toEqual(
      expect.arrayContaining([
        'lifecycle_weight_not_full',
        'lifecycle_completed_through_week_below_full_weight_week',
      ])
    );

    const wrongWeight = qualifyLifecycleReceipt(
      lifecycleInput({ ...core, completedThroughWeek: 6, canonicalWeight: 0.75 })
    );
    expect(wrongWeight.reasons).toContain('lifecycle_canonical_weight_inconsistent_with_week');

    const notBefore = qualifyLifecycleReceipt(
      lifecycleInput({ ...core, completedThroughWeek: 7, canonicalWeight: 1 })
    );
    expect(notBefore.reasons).toContain('lifecycle_completed_through_week_not_before_prospective_week');

    const negative = qualifyLifecycleReceipt(
      lifecycleInput({ ...core, completedThroughWeek: -1, canonicalWeight: 1 })
    );
    expect(negative.reasons).toContain('lifecycle_completed_through_week_invalid');
  });

  it('mismatched rating fingerprint is rejected (and cannot be fixed by caller claims)', () => {
    const other = receiptCore([rating('alabama', 99), rating('georgia', 4.25)]);
    const result = qualifyLifecycleReceipt(
      lifecycleInput(other, { expectedRatingFingerprint: core.ratingFingerprint })
    );
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('lifecycle_rating_fingerprint_mismatch');

    // Same via the planner: a receipt for different ratings blocks primary eligibility.
    const fx = makeFixture({ receipt: { ratingFingerprint: other.ratingFingerprint } });
    const p = plan(fx);
    expect(p.primaryReadinessBlocked).toBe(true);
    expect(p.bundle.forecasts.rows[0].primaryEligibleCandidate).toBe(false);
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
  });

  it('wrong season, policy, or source SHA are rejected', () => {
    expect(
      qualifyLifecycleReceipt(lifecycleInput({ ...core, season: 2025 })).reasons
    ).toContain('lifecycle_season_mismatch');
    expect(
      qualifyLifecycleReceipt(lifecycleInput({ ...core, selectedPolicy: 'GLOBAL_BLEND_W4_W7' })).reasons
    ).toContain('lifecycle_policy_mismatch');
    expect(
      qualifyLifecycleReceipt(lifecycleInput({ ...core, sourceSha: 'not-a-sha' })).reasons
    ).toContain('lifecycle_source_sha_invalid');

    const fx = makeFixture({ receipt: { season: 2025 } });
    expect(plan(fx).primaryBlockReasons).toContain('lifecycle:lifecycle_season_mismatch');
  });

  it('missing receipt in a fixture blocks primary readiness but keeps the forecast evidence', () => {
    const p = plan(makeFixture({ receipt: null }));
    expect(p.primaryReadinessBlocked).toBe(true);
    expect(p.primaryBlockReasons).toContain(
      'lifecycle:lifecycle_fixture_receipt_bytes_or_pin_missing'
    );
    expect(p.primaryBlockReasons).toContain('primary_blocked_lifecycle');
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(p.bundle.forecasts.rows[0].modelOnlyEligible).toBe(false);
    expect(p.bundle.forecasts.rows[0].primaryEligibilityReasons).toContain('lifecycle_not_qualified');
  });

  it('an invalid lifecycle mode is rejected', () => {
    const result = qualifyLifecycleReceipt(
      lifecycleInput(core, { mode: 'bogus' as unknown as 'live' })
    );
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('lifecycle_mode_invalid');
  });
});

// ---------------------------------------------------------------------------
// R4 Git-byte hashes
// ---------------------------------------------------------------------------

describe('R4 — canonical Git-byte dependency hashes', () => {
  it('readGitShowBytes hashes match ML_CAL_1_CANONICAL_GIT_BYTE_HASHES for every pinned file', () => {
    for (const rel of PINNED_PATHS) {
      const bytes = readGitShowBytes(REPO, rel, 'HEAD');
      expect(hashGitBlobContent(bytes)).toBe(
        (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel]
      );
      // Pinned production files are committed with LF.
      expect(containsCrlf(bytes)).toBe(false);
    }
  });

  it('resolveCanonicalDependencyHashes reports Git-byte hashes equal to the canonical table', () => {
    const resolved = resolveCanonicalDependencyHashes(REPO, 'HEAD');
    for (const rel of PINNED_PATHS) {
      expect(resolved.gitByteHashes[rel]).toBe(
        (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel]
      );
      // An LF-normalized checkout is not "dirty" even on a CRLF Windows working tree.
      expect(resolved.dirty).not.toContain(rel);
    }
    expect(Object.keys(resolved.gitByteHashes)).toEqual(
      expect.arrayContaining([
        'apps/jobs/capture-ml-cal-1-2026.ts',
        'apps/jobs/lib/ml-cal-1-capture.ts',
      ])
    );
  });

  it('LF/CRLF reproducibility: normalizing a CRLF copy reproduces the Git-byte hash', () => {
    for (const rel of PINNED_PATHS) {
      const git = readGitShowBytes(REPO, rel, 'HEAD');
      const crlf = Buffer.from(git.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
      const canonical = (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel];

      expect(containsCrlf(crlf)).toBe(true);
      expect(hashGitBlobContent(normalizeNewlinesToLf(crlf))).toBe(canonical);
      // String overload (UTF-8 text) reproduces the same bytes as the Buffer overload.
      expect(hashGitBlobContent(normalizeNewlinesToLf(crlf.toString('utf8')))).toBe(canonical);

      // The raw CRLF checkout hash differs from the Git-byte hash (the Windows digests).
      const rawCrlfHash = hashGitBlobContent(crlf);
      expect(rawCrlfHash).not.toBe(canonical);
      expect(rawCrlfHash).toBe(WINDOWS_CRLF_HASHES[rel]);
    }
    // PR 243 draft vs Windows spot check (moneyline).
    expect(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES['apps/web/lib/core-v1-moneyline.ts']).toMatch(/^c47c/);
    expect(WINDOWS_CRLF_HASHES['apps/web/lib/core-v1-moneyline.ts']).toMatch(/^79e288/);
  });

  it('wrong content with LF line endings still fails against the canonical hash', () => {
    for (const rel of PINNED_PATHS) {
      const git = readGitShowBytes(REPO, rel, 'HEAD');
      const tampered = Buffer.concat([git, Buffer.from('\n// tamper\n', 'utf8')]);
      expect(containsCrlf(tampered)).toBe(false);
      expect(hashGitBlobContent(normalizeNewlinesToLf(tampered))).not.toBe(
        (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel]
      );
    }
  });

  describe('against throwaway git repositories', () => {
    function git(cwd: string, args: string[]): void {
      execFileSync(
        'git',
        [
          '-c',
          'user.name=ml-cal-test',
          '-c',
          'user.email=ml-cal-test@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'core.autocrlf=false',
          ...args,
        ],
        { cwd, stdio: 'pipe' }
      );
    }

    function makeRepo(contentFor: (rel: string) => Buffer): string {
      const dir = makeTmp('ml-cal-1-git-');
      git(dir, ['init']);
      for (const rel of PINNED_PATHS) {
        const target = path.join(dir, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, contentFor(rel));
      }
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-m', 'pinned deps']);
      return dir;
    }

    const realBytes = (rel: string) => readGitShowBytes(REPO, rel, 'HEAD');

    it('accepts correct committed bytes (self paths absent are only reported dirty)', () => {
      const dir = makeRepo(realBytes);
      const resolved = resolveCanonicalDependencyHashes(dir, 'HEAD');
      for (const rel of PINNED_PATHS) {
        expect(resolved.gitByteHashes[rel]).toBe(
          (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel]
        );
      }
      expect(resolved.dirty.sort()).toEqual([
        'apps/jobs/capture-ml-cal-1-2026.ts',
        'apps/jobs/lib/ml-cal-1-capture.ts',
        ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
      ]);
    });

    it('rejects wrong committed content even when it is LF', () => {
      const dir = makeRepo((rel) =>
        rel === 'apps/web/lib/core-v1-moneyline.ts'
          ? Buffer.from('export const wrong = 1;\n', 'utf8')
          : realBytes(rel)
      );
      expect(() => resolveCanonicalDependencyHashes(dir, 'HEAD')).toThrow(
        /dependency_git_byte_hash_mismatch:.*core-v1-moneyline\.ts/
      );
    });

    it('a CRLF working-tree checkout keeps Git-byte hashes and is not dirty', () => {
      const dir = makeRepo(realBytes);
      for (const rel of PINNED_PATHS) {
        const target = path.join(dir, rel);
        const lf = fs.readFileSync(target);
        fs.writeFileSync(
          target,
          Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1')
        );
      }
      const resolved = resolveCanonicalDependencyHashes(dir, 'HEAD');
      for (const rel of PINNED_PATHS) {
        expect(resolved.gitByteHashes[rel]).toBe(
          (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel]
        );
        expect(resolved.checkoutRawHashes![rel]).toBe(WINDOWS_CRLF_HASHES[rel]);
        expect(resolved.checkoutRawHashes![rel]).not.toBe(resolved.gitByteHashes[rel]);
        expect(resolved.dirty).not.toContain(rel);
      }
    });

    it('a modified working tree is reported dirty without changing the Git-byte hash', () => {
      const dir = makeRepo(realBytes);
      fs.writeFileSync(path.join(dir, 'apps/web/lib/core-v1-spread.ts'), 'export const edited = 1;\n');
      const resolved = resolveCanonicalDependencyHashes(dir, 'HEAD');
      expect(resolved.dirty).toContain('apps/web/lib/core-v1-spread.ts');
      expect(resolved.gitByteHashes['apps/web/lib/core-v1-spread.ts']).toBe(
        ML_CAL_1_CANONICAL_GIT_BYTE_HASHES['apps/web/lib/core-v1-spread.ts']
      );
    });
  });

  it('readGitShowBytes rejects unsafe refs and paths before running git', () => {
    expect(() => readGitShowBytes(REPO, 'apps/web/lib/core-v1-moneyline.ts', '--output=x')).toThrow(
      /invalid_git_ref/
    );
    expect(() => readGitShowBytes(REPO, '../outside.ts', 'HEAD')).toThrow(/invalid_git_path/);
    expect(() => readGitShowBytes(REPO, '/abs/path.ts', 'HEAD')).toThrow(/invalid_git_path/);
    expect(() => readGitShowBytes(REPO, 'a\\b.ts', 'HEAD')).toThrow(/invalid_git_path/);
    expect(() => readGitShowBytes(REPO, 'a:b.ts', 'HEAD')).toThrow(/invalid_git_path/);
  });

  it('a false live repository SHA is rejected by CLI parsing before any DB access', async () => {
    expect(() =>
      parseMlCal1CliArgs([
        '--season',
        '2026',
        '--week',
        '7',
        '--enable-live-db-read',
        '--repository-sha',
        'deadbeef'.repeat(5),
      ])
    ).toThrow(/repository_sha_not_allowed_in_live_mode/);

    const out = makeTmp();
    const loadLive = jest.fn(async (_o: MlCal1LiveLoadOptions): Promise<MlCal1FixtureInput> => {
      throw new Error('must_not_be_called');
    });
    const prismaFactory = jest.fn();
    const errs: string[] = [];
    const code = await runMlCal1Cli(
      [
        '--season',
        '2026',
        '--week',
        '7',
        '--enable-live-db-read',
        '--repository-sha',
        'deadbeef'.repeat(5),
        '--out',
        out,
      ],
      { now: NOW_OK, loadLiveSnapshot: loadLive, stderr: (l) => errs.push(l) }
    );
    expect(code).toBe(2);
    expect(loadLive).not.toHaveBeenCalled();
    expect(prismaFactory).not.toHaveBeenCalled();
    expect(errs.join('\n')).toMatch(/repository_sha_not_allowed_in_live_mode/);
    expect(fs.readdirSync(out)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R5 read isolation
// ---------------------------------------------------------------------------

describe('R5 — instrumented read client', () => {
  function emptyDelegates(): MlCal1ReadDelegates {
    return {
      game: { findMany: jest.fn(async () => []) },
      teamMembership: { findMany: jest.fn(async () => []) },
      teamSeasonRating: { findMany: jest.fn(async () => []) },
      marketLine: { findMany: jest.fn(async () => []) },
    };
  }
  function client(allowedWeek: number | undefined = 7) {
    const delegate = emptyDelegates();
    return {
      delegate,
      client: createInstrumentedReadClient({ allowedSeason: 2026, allowedWeek, delegate }),
    };
  }

  it('rejects any findMany without a select', async () => {
    const { client: c, delegate } = client();
    await expect(c.game.findMany({ where: { season: 2026, week: 7 } })).rejects.toThrow(
      /select_required:game/
    );
    await expect(c.teamMembership.findMany({ where: { season: 2026 } })).rejects.toThrow(
      /select_required:teamMembership/
    );
    await expect(c.teamSeasonRating.findMany({ where: { season: 2026 } })).rejects.toThrow(
      /select_required:teamSeasonRating/
    );
    await expect(
      c.marketLine.findMany({ where: { season: 2026, week: 7 } })
    ).rejects.toThrow(/select_required:marketLine/);
    await expect(c.game.findMany({ select: null, where: { season: 2026, week: 7 } })).rejects.toThrow(
      /select_required:game/
    );
    expect(delegate.game.findMany).not.toHaveBeenCalled();
    expect(c.reads).toEqual([]);
  });

  it('rejects reads with no season filter', async () => {
    const { client: c, delegate } = client();
    await expect(
      c.game.findMany({ where: { week: 7 }, select: { id: true } })
    ).rejects.toThrow(/missing_season_filter:game/);
    await expect(
      c.teamSeasonRating.findMany({ where: { modelVersion: 'v1' }, select: { teamId: true } })
    ).rejects.toThrow(/missing_season_filter:teamSeasonRating/);
    await expect(c.game.findMany({ select: { id: true } })).rejects.toThrow(/missing_where:game/);
    expect(delegate.game.findMany).not.toHaveBeenCalled();
  });

  it('rejects nested score select/include and forbidden keys', async () => {
    const { client: c, delegate } = client();
    const where = { season: 2026, week: 7 };
    await expect(
      c.game.findMany({ where, select: { id: true, homeScore: true } })
    ).rejects.toThrow(/forbidden_game_select_field:homeScore/);
    await expect(
      c.game.findMany({
        where,
        select: { id: true, homeTeam: { select: { id: true, awayScore: true } } },
      })
    ).rejects.toThrow(/forbidden_game\.homeTeam_select_field:awayScore/);
    await expect(
      c.game.findMany({
        where,
        select: { id: true, awayTeam: { select: { id: true, name: true, scoreboard: true } } },
      })
    ).rejects.toThrow(/forbidden_game\.awayTeam_select_field:scoreboard/);
    await expect(
      c.game.findMany({ where, select: { id: true, homeTeam: { include: { x: true } } } })
    ).rejects.toThrow(/forbidden_game_relation_arg:homeTeam\.include/);
    await expect(
      c.game.findMany({ where, select: { id: true, homeTeam: true } })
    ).rejects.toThrow(/relation_requires_explicit_select:game\.homeTeam/);
    await expect(
      c.game.findMany({ where, select: { id: true, include: { homeTeam: true } } })
    ).rejects.toThrow(/forbidden_game_include/);
    await expect(
      c.game.findMany({ where, select: { id: true }, include: { homeTeam: true } })
    ).rejects.toThrow(/forbidden_game_include/);
    await expect(
      c.game.findMany({ where: { ...where, homeScore: { gt: 0 } }, select: { id: true } })
    ).rejects.toThrow(/forbidden_game_where_field:homeScore/);
    await expect(
      c.game.findMany({ where, select: { id: true }, orderBy: { awayScore: 'asc' } })
    ).rejects.toThrow(/forbidden_game_orderBy_field:awayScore/);
    await expect(
      c.marketLine.findMany({ where, select: { id: true, clv: true } })
    ).rejects.toThrow(/forbidden_marketLine_select_field:clv/);
    await expect(
      c.game.findMany({ where, select: { id: true, notAField: true } })
    ).rejects.toThrow(/unknown_game_select_field:notAField/);
    await expect(
      c.game.findMany({ where, select: { id: false } })
    ).rejects.toThrow(/invalid_game_select_value:id/);
    await expect(
      c.game.findMany({ where, select: { id: true }, distinct: ['id'] })
    ).rejects.toThrow(/forbidden_findMany_arg:game:distinct/);
    expect(delegate.game.findMany).not.toHaveBeenCalled();
    expect(delegate.marketLine.findMany).not.toHaveBeenCalled();
  });

  it('rejects OR / NOT broadening, including nested', async () => {
    const { client: c, delegate } = client();
    await expect(
      c.game.findMany({
        where: { season: 2026, week: 7, OR: [{ season: 2025 }, { season: 2026 }] },
        select: { id: true },
      })
    ).rejects.toThrow(/forbidden_where_operator:game:OR/);
    await expect(
      c.game.findMany({
        where: { season: 2026, week: 7, AND: [{ NOT: { week: 6 } }] },
        select: { id: true },
      })
    ).rejects.toThrow(/forbidden_where_operator:game:NOT/);
    await expect(
      c.teamSeasonRating.findMany({
        where: { OR: [{ season: 2026 }, { season: 2025 }] },
        select: { teamId: true },
      })
    ).rejects.toThrow(/forbidden_where_operator:teamSeasonRating:OR/);
    expect(delegate.game.findMany).not.toHaveBeenCalled();
    expect(delegate.teamSeasonRating.findMany).not.toHaveBeenCalled();
  });

  it('rejects 2025 and other seasons, including nested season filters and wrong weeks', async () => {
    const { client: c, delegate } = client();
    await expect(
      c.teamSeasonRating.findMany({ where: { season: 2025 }, select: { teamId: true } })
    ).rejects.toThrow(/forbidden_season_read:teamSeasonRating:2025/);
    await expect(
      c.game.findMany({ where: { season: 2025, week: 7 }, select: { id: true } })
    ).rejects.toThrow(/forbidden_season_read:game:2025/);
    await expect(
      c.game.findMany({
        where: { season: 2026, week: 7, AND: [{ season: 2025 }] },
        select: { id: true },
      })
    ).rejects.toThrow(/forbidden_season_read:game:2025/);
    await expect(
      c.teamMembership.findMany({ where: { season: { in: [2025, 2026] } }, select: { teamId: true } })
    ).rejects.toThrow(/forbidden_season_read:teamMembership/);
    await expect(
      c.game.findMany({ where: { season: 2026, week: 6 }, select: { id: true } })
    ).rejects.toThrow(/forbidden_week_read:game:6/);
    await expect(
      c.marketLine.findMany({ where: { season: 2026, week: 6 }, select: { id: true } })
    ).rejects.toThrow(/forbidden_week_read:marketLine:6/);
    await expect(
      c.marketLine.findMany({ where: { season: 2026 }, select: { id: true } })
    ).rejects.toThrow(/marketLine_where_requires_week_or_gameId_in/);
    await expect(
      c.marketLine.findMany({ where: { season: 2026, gameId: { in: [] } }, select: { id: true } })
    ).rejects.toThrow(/marketLine_where_requires_week_or_gameId_in/);
    expect(delegate.teamSeasonRating.findMany).not.toHaveBeenCalled();
  });

  it('blocks every mutation method and records it', async () => {
    const { client: c } = client();
    const methods = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
    for (const model of ['game', 'teamMembership', 'teamSeasonRating', 'marketLine', 'bet', 'teamGameStat']) {
      for (const method of methods) {
        await expect((c as any)[model][method]({})).rejects.toThrow(/forbidden_mutation/);
      }
    }
    expect(c.mutations).toContain('game.create');
    expect(c.mutations).toContain('marketLine.upsert');
    expect(c.mutations).toContain('bet.deleteMany');
    expect(c.mutations).toHaveLength(6 * methods.length);
  });

  it('blocks bet and teamGameStat reads', async () => {
    const { client: c } = client();
    for (const method of ['findMany', 'findFirst', 'findUnique']) {
      await expect((c as any).bet[method]({})).rejects.toThrow(/forbidden_bet_read/);
      await expect((c as any).teamGameStat[method]({})).rejects.toThrow(
        /forbidden_team_game_stat_read/
      );
    }
    expect(c.providerCalls).toBe(0);
  });

  it('the production selects contain no score/outcome fields', () => {
    expect(() => assertNoForbiddenGameSelect(ML_CAL_1_GAME_SELECT as any)).not.toThrow();
    expect(() => assertNoForbiddenGameSelect({ id: true, homeScore: true })).toThrow(
      /forbidden_game_select_field:homeScore/
    );
    expect(ML_CAL_1_FORBIDDEN_GAME_FIELDS).toEqual(
      expect.arrayContaining(['homeScore', 'awayScore'])
    );
    expect(Object.keys(ML_CAL_1_MARKET_LINE_SELECT).join(',')).not.toMatch(/score|pnl|result|clv/i);
  });
});

describe('R5 — runMlCal1LiveSnapshotReads with fake delegates', () => {
  const gameRow = {
    id: GAME_ID,
    season: 2026,
    week: 7,
    homeTeamId: 'alabama',
    awayTeamId: 'georgia',
    date: new Date(KICK),
    neutralSite: false,
    status: 'scheduled',
    homeTeam: { id: 'alabama', name: 'Alabama' },
    awayTeam: { id: 'georgia', name: 'Georgia' },
  };
  const ratingRows = [rating('alabama', 12.5), rating('georgia', 4.25)];
  const marketRows = mlPair({
    gameId: GAME_ID,
    homeTeamId: 'alabama',
    awayTeamId: 'georgia',
    homePrice: -150,
    awayPrice: 130,
    timestamp: '2026-10-12T17:45:00.000Z',
  });

  function fakeDelegates(games: unknown[] = [gameRow]): MlCal1ReadDelegates {
    return {
      game: { findMany: jest.fn(async () => games) },
      teamMembership: {
        findMany: jest.fn(async () => [{ teamId: 'alabama' }, { teamId: 'georgia' }]),
      },
      teamSeasonRating: { findMany: jest.fn(async () => ratingRows) },
      marketLine: { findMany: jest.fn(async () => marketRows) },
    };
  }

  it('reads through the instrumented client with exact selects and zero mutations', async () => {
    const delegate = fakeDelegates();
    const client = createInstrumentedReadClient({ allowedSeason: 2026, allowedWeek: 7, delegate });
    const result = await runMlCal1LiveSnapshotReads(client, { season: 2026, week: 7 });

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      gameId: GAME_ID,
      homeTeamName: 'Alabama',
      awayTeamName: 'Georgia',
      week: 7,
      season: 2026,
    });
    expect(result.fbsTeamIds).toEqual(['alabama', 'georgia']);
    expect(result.ratings).toHaveLength(2);
    expect(result.marketLines).toHaveLength(2);

    expect(client.mutations).toEqual([]);
    expect(client.reads.map((r) => r.model)).toEqual([
      'game',
      'teamMembership',
      'teamSeasonRating',
      'marketLine',
    ]);
    const marketArgs: any = client.reads[3].args;
    expect(marketArgs.where.season).toBe(2026);
    expect(marketArgs.where.gameId).toEqual({ in: [GAME_ID] });
    expect(marketArgs.where.source).toBe(ML_CAL_1_LIVE_ODDS_SOURCE);
    expect(marketArgs.where.lineType).toEqual({ in: ['moneyline', 'spread'] });
    const ratingArgs: any = client.reads[2].args;
    expect(ratingArgs.where).toEqual({ season: 2026, modelVersion: 'v1' });

    for (const read of client.reads) {
      expect(JSON.stringify(read.args)).not.toMatch(/score|pnl|result|clv/i);
    }
    // The CLI re-exports the same helper.
    expect(cliReExportedReads).toBe(runMlCal1LiveSnapshotReads);
  });

  it('skips the market read when the week has no games', async () => {
    const delegate = fakeDelegates([]);
    const client = createInstrumentedReadClient({ allowedSeason: 2026, allowedWeek: 7, delegate });
    const result = await runMlCal1LiveSnapshotReads(client, { season: 2026, week: 7 });
    expect(result.games).toEqual([]);
    expect(result.marketLines).toEqual([]);
    expect(delegate.marketLine.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid game identity returned by the read', async () => {
    const delegate = fakeDelegates([{ ...gameRow, week: 8 }]);
    const client = createInstrumentedReadClient({ allowedSeason: 2026, allowedWeek: 7, delegate });
    await expect(runMlCal1LiveSnapshotReads(client, { season: 2026, week: 7 })).rejects.toThrow(
      /invalid_game_identity:.*game_week_mismatch/
    );
  });

  it('a client allowed only for another week/season cannot be used for this read', async () => {
    const wrongWeek = createInstrumentedReadClient({
      allowedSeason: 2026,
      allowedWeek: 8,
      delegate: fakeDelegates(),
    });
    await expect(runMlCal1LiveSnapshotReads(wrongWeek, { season: 2026, week: 7 })).rejects.toThrow(
      /forbidden_week_read/
    );
    const wrongSeason = createInstrumentedReadClient({
      allowedSeason: 2025,
      delegate: fakeDelegates(),
    });
    await expect(runMlCal1LiveSnapshotReads(wrongSeason, { season: 2026, week: 7 })).rejects.toThrow(
      /forbidden_season_read/
    );
  });

  it('loadLiveSnapshot stamps snapshotReferenceTime after the reads inside a read-only transaction', async () => {
    const executed: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
        executed.push(strings.join('?'));
        return 0;
      }),
      ...fakeDelegates(),
    };
    const order: string[] = [];
    (tx.game.findMany as jest.Mock).mockImplementation(async () => {
      order.push('reads');
      return [gameRow];
    });
    const prisma = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
      $disconnect: jest.fn(async () => undefined),
    };
    const times = [
      new Date('2026-10-12T18:00:00.000Z'),
      new Date('2026-10-12T18:00:03.000Z'),
    ];
    let call = 0;
    const now = () => {
      order.push('clock');
      return times[Math.min(call++, times.length - 1)];
    };

    const snapshot = await loadLiveSnapshot({
      season: 2026,
      week: 7,
      lifecycleReceipt: null,
      receiptBytes: null,
      pinnedReceiptDigest: null,
      repositorySha: REF_SHA,
      captureId: 'live-fake',
      now,
      prismaFactory: () => prisma,
    });

    expect(executed.join('|')).toContain('SET TRANSACTION READ ONLY');
    expect(snapshot.captureStartTime).toBe('2026-10-12T18:00:00.000Z');
    expect(snapshot.snapshotReferenceTime).toBe('2026-10-12T18:00:03.000Z');
    expect(snapshot.captureEndTime).toBe(snapshot.snapshotReferenceTime);
    expect(snapshot.lifecycleMode).toBe('live');
    expect(order).toEqual(['clock', 'reads', 'clock']);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// R6 artifacts
// ---------------------------------------------------------------------------

describe('R6 — redaction and capture id safety', () => {
  it('redactSensitive removes connection strings and credentials', () => {
    const samples = [
      'failed postgresql://user:hunter2@db.example.com:5432/app?sslmode=require',
      'postgres://admin:s3cr3t@10.0.0.1/db',
      'DATABASE_URL=postgresql://u:p@h/db',
      'DIRECT_URL: postgres://u:p@h/db',
      'mongodb://user:topsecret@cluster.example.com/db',
      'Authorization: Bearer abc.def.ghi-123',
      'password=hunter2',
      'api_key=abcdef123456',
      'x-api-key: abcdef123456',
      'token=zzz999',
    ];
    for (const sample of samples) {
      const redacted = redactSensitive(sample);
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).not.toMatch(/hunter2|s3cr3t|topsecret|abcdef123456|zzz999|abc\.def|u:p@h/);
    }
    expect(redactSensitive('plain failure: week 7 not found')).toBe('plain failure: week 7 not found');
  });

  it('rejects unsafe capture ids and path escapes', () => {
    for (const bad of ['../evil', 'a/b', 'a\\b', '', '.hidden', '-flag', 'a b', 'a'.repeat(129), 'x\u0000y']) {
      expect(() => assertSafeCaptureId(bad)).toThrow(/invalid_capture_id/);
    }
    for (const ok of ['cap-1', 'ml-cal-1-2026-w07-abc', 'A.b_c-d', 'a'.repeat(128)]) {
      expect(() => assertSafeCaptureId(ok)).not.toThrow();
    }
    const root = makeTmp();
    expect(resolveCaptureDir(root, 'cap-1')).toBe(path.join(root, 'cap-1'));
    expect(() => resolveCaptureDir(root, '..')).toThrow(/invalid_capture_id/);

    const outside = path.join(path.dirname(root), 'ml-cal-escape-probe');
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: '../ml-cal-escape-probe',
        bundle: plan(makeFixture()).bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: NOW_OK,
      })
    ).toThrow(/invalid_capture_id/);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('writeBlockedReasonReceipt redacts reasons and never overwrites', () => {
    const root = makeTmp();
    const file = path.join(root, 'err.json');
    writeBlockedReasonReceipt({
      path: file,
      captureId: 'cap-err',
      status: 'INFRASTRUCTURE_ERROR',
      reasons: ['connect postgresql://user:hunter2@db/app failed'],
    });
    const text = fs.readFileSync(file, 'utf8');
    expect(text).not.toMatch(/hunter2/);
    expect(JSON.parse(text).status).toBe('INFRASTRUCTURE_ERROR');
    expect(() =>
      writeBlockedReasonReceipt({
        path: file,
        captureId: 'cap-err',
        status: 'INFRASTRUCTURE_ERROR',
        reasons: ['again'],
      })
    ).toThrow();
  });
});

describe('R6 — blocked receipt, no-overwrite and manifest integrity', () => {
  it('manifests the blocked receipt when primary readiness is blocked', () => {
    const root = makeTmp();
    const p = plan(makeFixture({ receipt: null }));
    expect(p.primaryReadinessBlocked).toBe(true);
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'blocked-001',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: NOW_OK,
    });

    const manifest = readJson(written.manifestPath);
    expect(Object.keys(manifest.members)).toContain(ML_CAL_1_BLOCKED_RECEIPT_MEMBER);
    const receiptFile = path.join(written.captureDir, ML_CAL_1_BLOCKED_RECEIPT_MEMBER);
    expect(fs.existsSync(receiptFile)).toBe(true);
    const bytes = fs.readFileSync(receiptFile);
    expect(manifest.members[ML_CAL_1_BLOCKED_RECEIPT_MEMBER].sha256).toBe(sha256Utf8Bytes(bytes));
    expect(manifest.members[ML_CAL_1_BLOCKED_RECEIPT_MEMBER].byteCount).toBe(bytes.byteLength);

    const body = JSON.parse(bytes.toString('utf8'));
    expect(body.status).toBe('PRIMARY_READINESS_BLOCKED');
    expect(body.primaryReadinessBlocked).toBe(true);
    expect(body.reasons).toContain(
      'lifecycle:lifecycle_fixture_receipt_bytes_or_pin_missing'
    );
    expect(body.providerCalls).toBe(0);
    expect(body.businessDataWrites).toBe(0);
  });

  it('does not emit a blocked receipt when readiness is not blocked', () => {
    const p = plan(makeFixture());
    expect(p.primaryReadinessBlocked).toBe(false);
    const members = buildArtifactMembers(p.bundle);
    expect(Object.keys(members).sort()).toEqual([
      'envelope.json',
      'forecasts.json',
      'inputs.json',
      'markets.json',
      'universe.json',
    ]);
  });

  it('redacts secrets that leak into blocked reasons', () => {
    const p = plan(makeFixture());
    const bundle: MlCal1ArtifactBundle = JSON.parse(JSON.stringify(p.bundle));
    bundle.envelope.primaryBlockReasons = ['db failure postgresql://user:hunter2@db.example.com:5432/app'];
    bundle.envelope.primaryReadinessBlocked = true;
    const body = buildPrimaryReadinessBlockedReceiptBody(bundle);
    expect(body).not.toMatch(/hunter2/);
    expect(body).toContain('[REDACTED]');
  });

  it('never overwrites an existing capture and cleans up temporary directories', () => {
    const root = makeTmp();
    const p = plan(makeFixture());
    const first = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'atomic-001',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: NOW_OK,
    });
    const before = fs.readFileSync(path.join(first.captureDir, 'envelope.json'), 'utf8');
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'atomic-001',
        bundle: p.bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: NOW_OK,
      })
    ).toThrow(/capture_directory_exists/);
    expect(fs.readFileSync(path.join(first.captureDir, 'envelope.json'), 'utf8')).toBe(before);

    // A pre-existing empty destination is also never replaced.
    fs.mkdirSync(path.join(root, 'preexisting'));
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'preexisting',
        bundle: p.bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: NOW_OK,
      })
    ).toThrow(/capture_directory_exists/);

    // A destination that appears between staging and rename is not replaced and tmp is removed.
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'raced',
        bundle: p.bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: NOW_OK,
        beforeRename: () => fs.mkdirSync(path.join(root, 'raced')),
      })
    ).toThrow(/capture_directory_exists/);
    expect(fs.readdirSync(path.join(root, 'raced'))).toEqual([]);

    // A failing hook leaves no partial capture.
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'hook-fails',
        bundle: p.bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: NOW_OK,
        beforeRename: () => {
          throw new Error('hook_failed');
        },
      })
    ).toThrow(/hook_failed/);
    expect(fs.existsSync(path.join(root, 'hook-fails'))).toBe(false);
    expect(fs.readdirSync(root).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
  });

  it('frozen fixture yields identical sealed bytes and manifest; tampering is detected', () => {
    const fx = makeFixture({ base: { captureId: 'frozen-001' } });
    const fixedClock = () => new Date('2026-10-12T18:00:20.000Z');
    const write = (root: string) =>
      writeCaptureArtifactsAtomic({
        rootDir: root,
        captureId: 'frozen-001',
        bundle: planMlCal1Capture(fx, { now: fixedClock }).bundle,
        dependencyHashes: CANONICAL_DEPS,
        now: fixedClock,
      });
    const a = write(makeTmp());
    const b = write(makeTmp());
    expect(a.manifestSha256).toBe(b.manifestSha256);
    for (const name of fs.readdirSync(a.captureDir)) {
      expect(fs.readFileSync(path.join(a.captureDir, name), 'utf8')).toBe(
        fs.readFileSync(path.join(b.captureDir, name), 'utf8')
      );
    }

    const manifest = readJson(a.manifestPath);
    expect(manifest).not.toHaveProperty('manifestSha256');
    expect(manifest.dependencyHashes).toEqual(CANONICAL_DEPS);
    expect(manifest.snapshotReferenceTime).toBe(SNAP);
    expect(manifest.publicationTime).toBe('2026-10-12T18:00:20.000Z');
    expect(manifest.producerRepositorySha).toBe(REF_SHA);
    expect(manifest.lifecycleSourceSha).toBe(LIFECYCLE_SHA);
    for (const [name, digest] of Object.entries<any>(manifest.members)) {
      const bytes = fs.readFileSync(path.join(a.captureDir, name));
      expect(digest.sha256).toBe(sha256Utf8Bytes(bytes));
      expect(digest.byteCount).toBe(bytes.byteLength);
    }

    const members = buildArtifactMembers(a.bundle);
    const original = buildManifest({
      captureId: 'frozen-001',
      members,
      dependencyHashes: CANONICAL_DEPS,
      repositorySha: REF_SHA,
      producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
    });
    const tampered = buildManifest({
      captureId: 'frozen-001',
      members: { ...members, 'forecasts.json': members['forecasts.json'] + ' ' },
      dependencyHashes: CANONICAL_DEPS,
      repositorySha: REF_SHA,
      producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
    });
    expect(tampered.memberDigests['forecasts.json'].sha256).not.toBe(
      original.memberDigests['forecasts.json'].sha256
    );
  });

  it('writes null (never NaN) for unavailable numbers and no outcome fields', () => {
    const root = makeTmp();
    const p = plan(makeFixture({ marketLines: [] }));
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'nulls-001',
      bundle: p.bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: NOW_OK,
    });
    const markets = readJson(path.join(written.captureDir, 'markets.json'));
    expect(markets.moneyline[0].homePrice).toBeNull();
    expect(markets.moneyline[0].deVigHome).toBeNull();
    expect(markets.moneyline[0].available).toBe(false);
    expect(p.bundle.envelope.schemaVersion).toBe(ML_CAL_1_CAPTURE_SCHEMA_VERSION);
    expect(p.bundle.envelope.producerVersion).toBe(ML_CAL_1_CAPTURE_PRODUCER_VERSION);
    expect(p.bundle.envelope.providerCalls).toBe(0);
    expect(p.bundle.envelope.businessDataWrites).toBe(0);
    const text = fs
      .readdirSync(written.captureDir)
      .map((n) => fs.readFileSync(path.join(written.captureDir, n), 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/"brier"|"logLoss"|"homeScore"|"awayScore"|"pnl"|NaN/);
  });
});

describe('R6 — rejection ledger, spread known-at and market replay fields', () => {
  it('rejection ledger carries lineValue, book, source, team and all timestamps', () => {
    const ref = SNAP;
    const stale = linePair({
      gameId: 'g1',
      lineType: 'moneyline',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeValue: -120,
      awayValue: 100,
      timestamp: iso(-2000 * 1000, ref),
      createdAt: iso(-1990 * 1000, ref),
      updatedAt: iso(-1980 * 1000, ref),
      bookName: 'StaleBook',
      homeId: 'stale-h',
      awayId: 'stale-a',
    });
    const wrongSource = linePair({
      gameId: 'g1',
      lineType: 'moneyline',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeValue: -110,
      awayValue: -110,
      timestamp: iso(-60 * 1000, ref),
      bookName: 'OtherBook',
      source: 'other-provider',
      homeId: 'src-h',
      awayId: 'src-a',
    });
    const result = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: [...stale, ...wrongSource],
    });
    expect(result.evidence.available).toBe(false);
    expect(result.rejectionLedger).toHaveLength(4);

    const staleEntry = result.rejectionLedger.find((e) => e.rowId === 'stale-h')!;
    expect(staleEntry).toEqual({
      gameId: 'g1',
      rowId: 'stale-h',
      reasons: ['observation_stale_above_1800s'],
      lineType: 'moneyline',
      lineValue: -120,
      bookName: 'StaleBook',
      source: 'oddsapi',
      teamId: 'h',
      timestamp: iso(-2000 * 1000, ref),
      createdAt: iso(-1990 * 1000, ref),
      updatedAt: iso(-1980 * 1000, ref),
    });
    const srcEntry = result.rejectionLedger.find((e) => e.rowId === 'src-a')!;
    expect(srcEntry.reasons).toContain('source_mismatch');
    expect(srcEntry.source).toBe('other-provider');
    expect(srcEntry.bookName).toBe('OtherBook');
    expect(srcEntry.lineValue).toBe(-110);
  });

  it('the ledger is part of the sealed markets member', () => {
    const root = makeTmp();
    const lines = [
      ...mlPair({
        gameId: GAME_ID,
        homeTeamId: 'alabama',
        awayTeamId: 'georgia',
        homePrice: -150,
        awayPrice: 130,
        timestamp: '2026-10-12T17:45:00.000Z',
      }),
      ...mlPair({
        gameId: GAME_ID,
        homeTeamId: 'alabama',
        awayTeamId: 'georgia',
        homePrice: -300,
        awayPrice: 250,
        timestamp: '2026-10-12T17:00:00.000Z',
        bookName: 'OldBook',
        homeId: 'old-h',
        awayId: 'old-a',
      }),
    ];
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'ledger-001',
      bundle: plan(makeFixture({ marketLines: lines })).bundle,
      dependencyHashes: CANONICAL_DEPS,
      now: NOW_OK,
    });
    const markets = readJson(path.join(written.captureDir, 'markets.json'));
    const entry = markets.candidateRejectionLedger.find((e: any) => e.rowId === 'old-h');
    expect(entry).toMatchObject({
      lineValue: -300,
      bookName: 'OldBook',
      source: 'oddsapi',
      teamId: 'alabama',
    });
    expect(entry.timestamp).toBe('2026-10-12T17:00:00.000Z');
    expect(entry.createdAt).toBe('2026-10-12T17:00:00.000Z');
    expect(entry.updatedAt).toBe('2026-10-12T17:00:00.000Z');
  });

  it('spread evidence records known-at fields when available and ledger entries when rejected', () => {
    const ts = '2026-10-12T17:50:00.000Z';
    const good = linePair({
      gameId: 'g1',
      lineType: 'spread',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeValue: -7,
      awayValue: 7,
      timestamp: ts,
      createdAt: '2026-10-12T17:49:50.000Z',
      updatedAt: '2026-10-12T17:55:00.000Z',
    });
    const evidence = selectAsOfSpreadEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: SNAP,
      candidates: good,
    });
    expect(evidence.available).toBe(true);
    expect(evidence.marketSpreadHma).toBe(7);
    expect(evidence.homeLine).toBe(-7);
    expect(evidence.awayLine).toBe(7);
    expect(evidence.observationAgeSeconds).toBe(600);
    expect(evidence.source).toBe(ML_CAL_1_LIVE_ODDS_SOURCE);
    expect(evidence.homeCreatedAt).toBe('2026-10-12T17:49:50.000Z');
    expect(evidence.awayCreatedAt).toBe('2026-10-12T17:49:50.000Z');
    expect(evidence.homeUpdatedAt).toBe('2026-10-12T17:55:00.000Z');
    expect(evidence.awayUpdatedAt).toBe('2026-10-12T17:55:00.000Z');

    const revised = linePair({
      gameId: 'g1',
      lineType: 'spread',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeValue: -7,
      awayValue: 7,
      timestamp: ts,
      updatedAt: '2026-10-12T18:00:01.000Z',
      homeId: 'sp-rev-h',
      awayId: 'sp-rev-a',
    });
    const rejected = planMlCal1Capture(
      makeFixture({
        games: [game('g1', 'alabama', 'georgia')],
        marketLines: revised.map((r) => ({ ...r, teamId: r.teamId === 'h' ? 'alabama' : 'georgia' })),
      }),
      { now: NOW_OK }
    );
    expect(rejected.bundle.markets.spread[0].available).toBe(false);
    const ledger = rejected.bundle.markets.candidateRejectionLedger.filter((e) => e.lineType === 'spread');
    expect(ledger).toHaveLength(2);
    expect(ledger[0].reasons).toContain('updated_at_after_reference_without_immutable_proof');
    expect(ledger[0].lineValue).toBe(-7);
    expect(ledger[0].bookName).toBe('BetRivers');
    expect(ledger[0].updatedAt).toBe('2026-10-12T18:00:01.000Z');
  });

  it('spread pick’em (0) lines are accepted and evidence is independent of the moneyline', () => {
    const pickem = linePair({
      gameId: 'g1',
      lineType: 'spread',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeValue: 0,
      awayValue: 0,
      timestamp: '2026-10-12T17:55:00.000Z',
    });
    const evidence = selectAsOfSpreadEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: SNAP,
      candidates: pickem,
    });
    expect(evidence.available).toBe(true);
    expect(Math.abs(evidence.marketSpreadHma as number)).toBe(0);
  });

  it('independent market replay: stored evidence reproduces probabilities and the pick', () => {
    const lines = mlPair({
      gameId: GAME_ID,
      homeTeamId: 'alabama',
      awayTeamId: 'georgia',
      homePrice: -150,
      awayPrice: 130,
      timestamp: '2026-10-12T17:45:00.000Z',
      createdAt: '2026-10-12T17:45:30.000Z',
      updatedAt: '2026-10-12T17:46:00.000Z',
      homeId: 'replay-h',
      awayId: 'replay-a',
    });
    const fx = makeFixture({ marketLines: lines });
    const p = plan(fx);
    const ml = p.bundle.markets.moneyline[0];
    const row = p.bundle.forecasts.rows[0];

    expect(ml.available).toBe(true);
    expect(ml.homeRowId).toBe('replay-h');
    expect(ml.awayRowId).toBe('replay-a');
    expect(ml.bookName).toBe('BetRivers');
    expect(ml.source).toBe(ML_CAL_1_LIVE_ODDS_SOURCE);
    expect(ml.observationTimestamp).toBe('2026-10-12T17:45:00.000Z');
    expect(ml.homeCreatedAt).toBe('2026-10-12T17:45:30.000Z');
    expect(ml.awayCreatedAt).toBe('2026-10-12T17:45:30.000Z');
    expect(ml.homeUpdatedAt).toBe('2026-10-12T17:46:00.000Z');
    expect(ml.awayUpdatedAt).toBe('2026-10-12T17:46:00.000Z');
    expect(ml.observationAgeSeconds).toBe(
      (Date.parse(p.bundle.envelope.snapshotReferenceTime) - Date.parse(ml.observationTimestamp!)) / 1000
    );

    // Replay from stored evidence only.
    const rawHome = americanToProb(ml.homePrice as number);
    const rawAway = americanToProb(ml.awayPrice as number);
    expect(ml.rawImpliedHome).toBe(rawHome);
    expect(ml.rawImpliedAway).toBe(rawAway);
    expect(ml.overround).toBeCloseTo((rawHome as number) + (rawAway as number) - 1, 12);
    expect((ml.deVigHome as number) + (ml.deVigAway as number)).toBeCloseTo(1, 12);

    const replayed = selectCoreV1MoneylinePick({
      coreSpreadHma: row.coreSpreadHma as number,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeTeamName: 'alabama',
      awayTeamName: 'georgia',
      homeAmericanPrice: ml.homePrice as number,
      awayAmericanPrice: ml.awayPrice as number,
    });
    expect(row.selectionStatus).toBe(replayed ? 'SELECTED' : 'NO_SELECTION');
    expect(JSON.parse(JSON.stringify(row.selection))).toEqual(JSON.parse(JSON.stringify(replayed)));
    // Row ids in the evidence exist in the raw snapshot inputs.
    const inputIds = fx.marketLines.map((m) => m.id);
    expect(inputIds).toEqual(expect.arrayContaining([ml.homeRowId, ml.awayRowId]));
  });

  it('age 1800s is inclusive and 1801s is stale (relative to snapshotReferenceTime)', () => {
    const run = (ageSec: number) =>
      selectAsOfMoneylineEvidence({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        predictionReferenceTime: SNAP,
        candidates: mlPair({
          gameId: 'g1',
          homeTeamId: 'h',
          awayTeamId: 'a',
          homePrice: -120,
          awayPrice: 100,
          timestamp: iso(-ageSec * 1000),
        }),
      });
    const atLimit = run(ML_CAL_1_MAX_MARKET_AGE_SECONDS);
    expect(atLimit.evidence.available).toBe(true);
    expect(atLimit.evidence.observationAgeSeconds).toBe(1800);
    const stale = run(ML_CAL_1_MAX_MARKET_AGE_SECONDS + 1);
    expect(stale.evidence.available).toBe(false);
    expect(stale.rejectionLedger[0].reasons).toContain('observation_stale_above_1800s');
  });

  it('rejects future observation, future known-at, revisions, zero prices, wrong teams and source mismatch', () => {
    const reasonsFor = (override: Parameters<typeof mlPair>[0]) =>
      selectAsOfMoneylineEvidence({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        predictionReferenceTime: SNAP,
        candidates: mlPair(override),
      });
    const base = {
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      homePrice: -120,
      awayPrice: 100,
      timestamp: iso(-1000),
    };

    const futureObs = reasonsFor({ ...base, timestamp: iso(1000), createdAt: iso(-1000) });
    expect(futureObs.rejectionLedger.some((r) => r.reasons.includes('observation_timestamp_after_reference'))).toBe(true);

    const futureKnown = reasonsFor({ ...base, createdAt: iso(1000) });
    expect(futureKnown.rejectionLedger.some((r) => r.reasons.includes('known_at_after_reference'))).toBe(true);

    const revised = reasonsFor({ ...base, updatedAt: iso(500) });
    expect(revised.rejectionLedger[0].reasons).toContain('updated_at_after_reference_without_immutable_proof');

    expect(reasonsFor({ ...base, homePrice: 0 }).evidence.available).toBe(false);
    expect(reasonsFor({ ...base, homeTeamId: 'other' }).evidence.available).toBe(false);
    expect(reasonsFor({ ...base, source: 'other-provider' }).evidence.available).toBe(false);
  });

  it('does not drop the Core forecast when the market is missing', () => {
    const p = plan(makeFixture({ marketLines: [] }));
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(p.bundle.forecasts.rows[0].selectionStatus).toBe('MARKET_UNAVAILABLE');
    expect(p.bundle.markets.moneyline[0].available).toBe(false);
    expect(p.bundle.envelope.counts.availableForecasts).toBe(1);
    expect(p.bundle.envelope.counts.missingMarkets).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Prior coverage: selection gates, universe ledger
// ---------------------------------------------------------------------------

describe('selection gates', () => {
  const neutralGame = game('g-gate', 'alabama', 'georgia', { neutralSite: true });
  const gateMarket = mlPair({
    gameId: 'g-gate',
    homeTeamId: 'alabama',
    awayTeamId: 'georgia',
    homePrice: -200,
    awayPrice: 170,
    timestamp: '2026-10-12T17:45:00.000Z',
  });

  it('abs(m) = 24 is in gate; just beyond is suppressed but the forecast is retained', () => {
    expect(ML_MAX_ABS_SPREAD).toBe(24);
    const hfa = computeEffectiveHfa('alabama', true).effectiveHfa;
    expect(hfa).toBe(0);

    const atGate = plan(
      makeFixture({
        ratings: [rating('alabama', 24), rating('georgia', 0)],
        games: [neutralGame],
        marketLines: gateMarket,
      })
    ).bundle.forecasts.rows[0];
    expect(atGate.coreSpreadHma).toBe(24);
    expect(atGate.absSpreadWithinGate).toBe(true);
    expect(atGate.inGateForecast).toBe(true);
    expect(atGate.forecastAvailable).toBe(true);
    expect(['SELECTED', 'NO_SELECTION']).toContain(atGate.selectionStatus);
    expect(atGate.primaryEligibleCandidate).toBe(true);

    const beyond = plan(
      makeFixture({
        ratings: [rating('alabama', 24.1), rating('georgia', 0)],
        games: [neutralGame],
        marketLines: gateMarket,
      })
    ).bundle.forecasts.rows[0];
    expect(beyond.forecastAvailable).toBe(true);
    expect(beyond.coreSpreadHma).toBeCloseTo(24.1, 10);
    expect(beyond.absSpreadWithinGate).toBe(false);
    expect(beyond.inGateForecast).toBe(false);
    expect(beyond.selectionStatus).toBe('LARGE_SPREAD_SUPPRESSED');
    expect(beyond.primaryEligibleCandidate).toBe(false);
    expect(beyond.modelOnlyEligible).toBe(false);
    expect(beyond.modelHomeWinProb).not.toBeNull();
  });

  it('keeps the unchanged production value threshold and home tie preference', () => {
    expect(HARD_MIN_ML_VALUE).toBe(0.01);
    const tieHome = selectCoreV1MoneylinePick({
      coreSpreadHma: 7,
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeTeamName: 'H',
      awayTeamName: 'A',
      homeAmericanPrice: 100,
      awayAmericanPrice: 100,
    });
    expect(tieHome).not.toBeNull();
    expect(tieHome!.side).toBe('home');
    expect(
      selectCoreV1MoneylinePick({
        coreSpreadHma: 0,
        homeTeamId: 'h',
        awayTeamId: 'a',
        homeTeamName: 'H',
        awayTeamName: 'A',
        homeAmericanPrice: -110,
        awayAmericanPrice: -110,
      })
    ).toBeNull();
  });

  it('retains no-selection forecasts in the full ledger', () => {
    const p = plan(
      makeFixture({
        marketLines: mlPair({
          gameId: GAME_ID,
          homeTeamId: 'alabama',
          awayTeamId: 'georgia',
          homePrice: -10000,
          awayPrice: -10000,
          timestamp: '2026-10-12T17:45:00.000Z',
        }),
      })
    );
    expect(p.bundle.forecasts.rows).toHaveLength(1);
    expect(p.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(['NO_SELECTION', 'SELECTED', 'MARKET_UNAVAILABLE']).toContain(
      p.bundle.forecasts.rows[0].selectionStatus
    );
    expect(p.bundle.universe.rows).toHaveLength(1);
  });
});

describe('universe ledger coverage', () => {
  const kickOk = '2026-10-12T23:00:00.000Z';

  it('keeps missing ratings, non-FBS, late kickoff and pre-snapshot kickoff rows', () => {
    const fx = makeFixture({
      games: [
        game('fbs-ok', 'alabama', 'georgia', { kickoffAsKnown: kickOk }),
        game('missing-rating', 'alabama', 'missing-team', { kickoffAsKnown: kickOk }),
        game('non-fbs', 'alabama', 'fcs-team', { kickoffAsKnown: kickOk }),
        game('late', 'troy', 'southern-mississippi', {
          kickoffAsKnown: '2026-10-12T18:10:00.000Z',
        }),
        game('already-started', 'unlv', 'james-madison', {
          kickoffAsKnown: '2026-10-12T17:00:00.000Z',
        }),
      ],
      fbsTeamIds: ['alabama', 'georgia', 'troy', 'southern-mississippi', 'unlv', 'james-madison'],
      ratings: [
        rating('alabama', 10),
        rating('georgia', 5),
        rating('troy', 3),
        rating('southern-mississippi', 1),
        rating('unlv', 2),
        rating('james-madison', 8),
      ],
      marketLines: [],
    });
    const p = plan(fx);
    expect(p.bundle.universe.rows).toHaveLength(5);
    const forecast = (id: string) => p.bundle.forecasts.rows.find((r) => r.gameId === id)!;
    const universe = (id: string) => p.bundle.universe.rows.find((r) => r.gameId === id)!;

    expect(forecast('fbs-ok').forecastAvailable).toBe(true);
    expect(forecast('missing-rating').forecastAvailable).toBe(false);
    expect(forecast('missing-rating').unavailableReasons).toContain('missing_away_v1_rating');

    expect(universe('non-fbs').bothFbs).toBe(false);
    expect(universe('non-fbs').exclusionReasons).toContain('non_fbs_matchup');
    expect(forecast('non-fbs').unavailableReasons).toContain('non_fbs_matchup');

    expect(forecast('late').lateCapture).toBe(true);
    expect(forecast('late').forecastAvailable).toBe(false);
    expect(forecast('late').unavailableReasons.join('')).toMatch(/30m/);

    expect(universe('already-started').exclusionReasons).toContain(
      'kickoff_at_or_before_prediction_reference'
    );
    expect(forecast('already-started').forecastAvailable).toBe(false);
  });

  it('duplicate game ids, conflicting matchup frames and bad identities block primary readiness', () => {
    const dup = plan(
      makeFixture({
        games: [game('same-id', 'alabama', 'georgia'), game('same-id', 'troy', 'southern-mississippi')],
        ratings: [
          rating('alabama', 10),
          rating('georgia', 5),
          rating('troy', 3),
          rating('southern-mississippi', 1),
        ],
      })
    );
    expect(dup.primaryReadinessBlocked).toBe(true);
    expect(dup.primaryBlockReasons.join('')).toMatch(/duplicate_game_id/);
    expect(dup.bundle.forecasts.rows.every((r) => !r.primaryEligibleCandidate)).toBe(true);

    const frame = plan(
      makeFixture({
        games: [game('frame-a', 'alabama', 'georgia'), game('frame-b', 'georgia', 'alabama')],
      })
    );
    expect(frame.primaryBlockReasons.join('')).toMatch(/conflicting_or_duplicate_matchup_frame/);
    expect(frame.bundle.universe.duplicateOrConflictReasons.length).toBeGreaterThan(0);

    const wrongWeek = plan(makeFixture({ games: [game('bad-week', 'alabama', 'georgia', { week: 8 })] }));
    expect(wrongWeek.primaryBlockReasons.join('')).toMatch(/invalid_game_identity:game_week_mismatch/);
    expect(wrongWeek.bundle.forecasts.rows[0].forecastAvailable).toBe(false);

    const same = plan(makeFixture({ games: [game('self', 'alabama', 'alabama')] }));
    expect(same.primaryBlockReasons.join('')).toMatch(/home_equals_away/);
  });

  it('rejects unsupported seasons and weeks at the planner', () => {
    expect(() => plan(makeFixture({ base: { season: 2025 } }))).toThrow(/unsupported_season:2025/);
    expect(() => plan(makeFixture({ base: { week: 0 } }))).toThrow(/invalid_week/);
  });
});

// ---------------------------------------------------------------------------
// Demo fixture and CLI end-to-end (offline)
// ---------------------------------------------------------------------------

describe('demo fixture and CLI (offline, injected clock and dependency hashes)', () => {
  const clock = () => new Date('2026-10-12T18:00:30.000Z');

  function runCli(argv: string[], extra: Partial<Parameters<typeof runMlCal1Cli>[1]> = {}) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return runMlCal1Cli(argv, {
      now: clock,
      cwd: REPO,
      resolveDependencyHashes: () => CANONICAL_DEPS,
      stdout: (l) => stdout.push(l),
      stderr: (l) => stderr.push(l),
      ...extra,
    }).then((code) => ({ code, stdout: stdout.join('\n'), stderr: stderr.join('\n') }));
  }

  it('the demo fixture carries a self-consistent receipt, fingerprint and timing', () => {
    const fx = readJson(DEMO_FIXTURE) as MlCal1FixtureInput;
    expect(fx.snapshotReferenceTime).toBe(fx.captureEndTime);
    expect(fx.lifecycleMode).toBe('fixture_hypothetical');
    expect(sha256Utf8Bytes(fx.receiptBytes as string)).toBe(fx.pinnedReceiptDigest);
    expect(fx.lifecycleReceipt!.receiptDigest).toBe(fx.pinnedReceiptDigest);
    const parsed = JSON.parse(fx.receiptBytes as string);
    expect(parsed.completedThroughWeek).toBe(6);
    expect(parsed.canonicalWeight).toBe(1);
    expect(parsed.season).toBe(2026);
    expect(parsed.selectedPolicy).toBe(ML_CAL_1_LIFECYCLE_POLICY);
    expect(parsed.ratingFingerprint).toBe(fingerprintFor(fx.ratings));

    const p = planMlCal1Capture(fx, { now: clock });
    expect(p.lifecycle.qualified).toBe(true);
    expect(p.bundle.envelope.lifecycleQualification.fixtureHypothetical).toBe(true);
    expect(p.bundle.envelope.lifecycleQualification.liveAccepted).toBe(false);
    expect(p.status).toBe('EVIDENCE_CAPTURED');
    expect(p.bundle.envelope.counts.universeGames).toBe(3);
    expect(p.bundle.envelope.counts.availableForecasts).toBe(3);
    expect(p.bundle.envelope.counts.pairedMarkets).toBe(2);
    expect(p.bundle.envelope.counts.missingMarkets).toBe(1);
  });

  it('runs the fixture route, writes sealed artifacts and exits 0', async () => {
    const out = makeTmp();
    const { code, stdout } = await runCli([
      '--season', '2026', '--week', '7', '--fixture', DEMO_FIXTURE, '--out', out,
      '--capture-id', 'cli-demo-001',
    ]);
    expect(code).toBe(0);
    const summary = JSON.parse(stdout);
    expect(summary.ok).toBe(true);
    expect(summary.status).toBe('EVIDENCE_CAPTURED');
    expect(summary.fixtureHypothetical).toBe(true);
    expect(summary.lifecycleMode).toBe('fixture_hypothetical');
    expect(summary.providerCalls).toBe(0);
    expect(summary.businessDataWrites).toBe(0);
    expect(summary.snapshotReferenceTime).toBe('2026-10-12T18:00:00.000Z');
    expect(summary.publicationTime).toBe('2026-10-12T18:00:30.000Z');
    expect(summary.invalidatedGameIds).toEqual([]);

    const dir = path.join(out, 'cli-demo-001');
    const envelope = readJson(path.join(dir, 'envelope.json'));
    expect(envelope.dependencyHashes).toEqual(CANONICAL_DEPS);
    expect(envelope.publicationFinalized).toBe(true);
    expect(fs.existsSync(path.join(dir, ML_CAL_1_BLOCKED_RECEIPT_MEMBER))).toBe(false);
  });

  it('a fixture can never claim live verification and --repository-sha overrides only the producer SHA', async () => {
    const raw = readJson(DEMO_FIXTURE);
    raw.lifecycleMode = 'live';
    const dir = makeTmp();
    const fixturePath = path.join(dir, 'live-claim.json');
    fs.writeFileSync(fixturePath, JSON.stringify(raw));
    const out = makeTmp();
    const producerSha = 'b'.repeat(40);
    const { code, stdout } = await runCli([
      '--season', '2026', '--week', '7', '--fixture', fixturePath, '--out', out,
      '--capture-id', 'cli-live-claim', '--repository-sha', producerSha,
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).lifecycleMode).toBe('fixture_hypothetical');
    const envelope = readJson(path.join(out, 'cli-live-claim', 'envelope.json'));
    expect(envelope.producerRepositorySha).toBe(producerSha);
    expect(envelope.lifecycleSourceSha).toBe(raw.lifecycleReceipt.sourceSha);
    expect(envelope.lifecycleQualification.liveAccepted).toBe(false);
  });

  it('exits 1 and manifests the blocked receipt when the fixture has no lifecycle receipt', async () => {
    const raw = readJson(DEMO_FIXTURE);
    delete raw.receiptBytes;
    delete raw.pinnedReceiptDigest;
    raw.lifecycleReceipt = null;
    const dir = makeTmp();
    const fixturePath = path.join(dir, 'no-receipt.json');
    fs.writeFileSync(fixturePath, JSON.stringify(raw));
    const out = makeTmp();
    const { code, stdout } = await runCli([
      '--season', '2026', '--week', '7', '--fixture', fixturePath, '--out', out,
      '--capture-id', 'cli-blocked',
    ]);
    expect(code).toBe(1);
    expect(JSON.parse(stdout).primaryReadinessBlocked).toBe(true);
    const manifest = readJson(path.join(out, 'cli-blocked', 'manifest.json'));
    expect(Object.keys(manifest.members)).toContain(ML_CAL_1_BLOCKED_RECEIPT_MEMBER);
  });

  it('F2: publication delay exits non-zero with PUBLICATION_INVALIDATED and effective counts', async () => {
    const out = makeTmp();
    let t = Date.parse('2026-10-12T18:00:30.000Z');
    const { code, stdout } = await runCli(
      ['--season', '2026', '--week', '7', '--fixture', DEMO_FIXTURE, '--out', out, '--capture-id', 'cli-delay'],
      {
        now: () => new Date(t),
        beforeRename: () => {
          t = Date.parse('2026-10-12T23:10:00.000Z'); // past kickoff-30 for the first paired games
        },
      }
    );
    expect(code).toBe(4);
    const summary = JSON.parse(stdout);
    expect(summary.ok).toBe(false);
    expect(summary.status).toBe('PUBLICATION_INVALIDATED');
    expect(summary.sealedStatus).toBe('EVIDENCE_CAPTURED');
    expect(summary.primaryReadinessBlocked).toBe(true);
    expect(summary.structuralConsistencyVerified).toBe(true);
    expect(summary.independentlyVerifiedIntegrity).toBe(true);
    expect(summary.eligibilityAccepted).toBe(false);
    expect(summary.invalidatedGameIds).toEqual(
      expect.arrayContaining([
        '2026-wk7-alabama-georgia',
        '2026-wk7-troy-southern-mississippi',
      ])
    );
    expect(summary.invalidatedGameIds).not.toContain('2026-wk7-missing-market');
    expect(summary.effectiveCounts.primaryEligibleCandidates).toBe(0);
    expect(fs.existsSync(summary.publicationInvalidationPath)).toBe(true);
    expect(fs.existsSync(summary.terminalReceiptPath)).toBe(true);
    expect(fs.existsSync(summary.packageChecksumsPath)).toBe(true);
    const terminal = readCaptureTerminalResult({
      rootDir: out,
      captureId: 'cli-delay',
      expectedManifestSha256: summary.manifestSha256,
      expectedTerminalSha256: summary.terminalSha256,
      expectedInvalidationSha256: summary.invalidationSha256,
      expectedPackageChecksumsSha256: summary.packageChecksumsSha256,
    });
    expect(terminal.terminalStatus).toBe('PUBLICATION_INVALIDATED');
    expect(terminal.eligibilityAccepted).toBe(false);
  });

  it('gates live DB reads unless explicitly enabled and never touches the DB when gated', async () => {
    const loadLive = jest.fn();
    const { code, stderr } = await runCli(['--season', '2026', '--week', '7'], {
      loadLiveSnapshot: loadLive,
    });
    expect(code).toBe(3);
    expect(stderr).toMatch(/live_db_read_gated/);
    expect(loadLive).not.toHaveBeenCalled();
  });

  it('F1: live route with bytes+pin but no trust record is integrity-only and primary-blocked', async () => {
    const dir = makeTmp();
    const core = receiptCore([rating('alabama', 12.5), rating('georgia', 4.25)]);
    const verified = buildVerifiedReceipt(core);
    const receiptPath = path.join(dir, 'receipt.json');
    fs.writeFileSync(receiptPath, verified.receiptBytes, 'utf8');
    const out = makeTmp();

    let seen: MlCal1LiveLoadOptions | null = null;
    const liveFixture = makeFixture({ lifecycleMode: 'live', base: { repositorySha: 'c'.repeat(40) } });
    liveFixture.receiptBytes = verified.receiptBytes;
    liveFixture.pinnedReceiptDigest = verified.pinnedReceiptDigest;
    liveFixture.lifecycleReceipt = verified.claims;

    const { code, stdout } = await runCli(
      [
        '--season', '2026', '--week', '7', '--enable-live-db-read', '--out', out,
        '--capture-id', 'cli-live', '--lifecycle-receipt', receiptPath,
        '--pinned-lifecycle-digest', verified.pinnedReceiptDigest.toUpperCase(),
      ],
      {
        readRepoCommitSha: () => 'c'.repeat(40),
        loadLiveSnapshot: async (opts) => {
          seen = opts;
          return { ...liveFixture, captureId: opts.captureId };
        },
      }
    );
    expect(seen).not.toBeNull();
    const captured = seen as unknown as MlCal1LiveLoadOptions;
    expect(captured.repositorySha).toBe('c'.repeat(40));
    expect(captured.receiptBytes).toBe(verified.receiptBytes);
    expect(captured.pinnedReceiptDigest).toBe(verified.pinnedReceiptDigest);
    expect(captured.lifecycleReceipt!.receiptDigest).toBe(verified.pinnedReceiptDigest);
    expect(code).toBe(1);
    const summary = JSON.parse(stdout);
    expect(summary.ok).toBe(false);
    expect(summary.lifecycleMode).toBe('live');
    expect(summary.fixtureHypothetical).toBe(false);
    expect(summary.receiptIntegrityVerified).toBe(true);
    expect(summary.liveAccepted).toBe(false);
    const envelope = readJson(path.join(out, 'cli-live', 'envelope.json'));
    expect(envelope.lifecycleQualification.receiptIntegrityVerified).toBe(true);
    expect(envelope.lifecycleQualification.liveAccepted).toBe(false);
    expect(envelope.lifecycleQualification.reasons).toContain('lifecycle_trusted_acceptance_missing');
  });

  it('F1: live route with independently injected trust record can liveAccept', async () => {
    const dir = makeTmp();
    const core = receiptCore([rating('alabama', 12.5), rating('georgia', 4.25)]);
    const verified = buildVerifiedReceipt(core);
    const receiptPath = path.join(dir, 'receipt.json');
    fs.writeFileSync(receiptPath, verified.receiptBytes, 'utf8');
    const out = makeTmp();
    const liveFixture = makeFixture({ lifecycleMode: 'live', base: { repositorySha: 'c'.repeat(40) } });
    liveFixture.receiptBytes = verified.receiptBytes;
    liveFixture.pinnedReceiptDigest = verified.pinnedReceiptDigest;
    liveFixture.lifecycleReceipt = verified.claims;

    const { code, stdout } = await runCli(
      [
        '--season', '2026', '--week', '7', '--enable-live-db-read', '--out', out,
        '--capture-id', 'cli-live-trust', '--lifecycle-receipt', receiptPath,
        '--pinned-lifecycle-digest', verified.pinnedReceiptDigest,
      ],
      {
        readRepoCommitSha: () => 'c'.repeat(40),
        trustedAcceptance: trustFor(core, verified.pinnedReceiptDigest),
        loadLiveSnapshot: async (opts) => ({ ...liveFixture, captureId: opts.captureId }),
      }
    );
    expect(code).toBe(0);
    const summary = JSON.parse(stdout);
    expect(summary.liveAccepted).toBe(true);
    expect(summary.receiptIntegrityVerified).toBe(true);
  });

  it('live route without receipt bytes blocks primary readiness (lifecycle_verification_unavailable)', async () => {
    const out = makeTmp();
    const liveFixture = makeFixture({ lifecycleMode: 'live' });
    liveFixture.receiptBytes = null;
    liveFixture.pinnedReceiptDigest = null;
    const { code } = await runCli(
      ['--season', '2026', '--week', '7', '--enable-live-db-read', '--out', out, '--capture-id', 'cli-live-nobytes'],
      {
        readRepoCommitSha: () => REF_SHA,
        loadLiveSnapshot: async (opts) => ({ ...liveFixture, captureId: opts.captureId }),
      }
    );
    expect(code).toBe(1);
    const body = readJson(path.join(out, 'cli-live-nobytes', ML_CAL_1_BLOCKED_RECEIPT_MEMBER));
    expect(body.reasons).toContain('lifecycle:lifecycle_verification_unavailable');
  });

  it('unsafe fixture capture ids and secret-bearing errors never escape or leak', async () => {
    const raw = readJson(DEMO_FIXTURE);
    raw.captureId = '../escape-probe';
    const dir = makeTmp();
    const fixturePath = path.join(dir, 'unsafe-id.json');
    fs.writeFileSync(fixturePath, JSON.stringify(raw));
    const out = makeTmp();
    const unsafe = await runCli(['--season', '2026', '--week', '7', '--fixture', fixturePath, '--out', out]);
    expect(unsafe.code).toBe(2);
    expect(unsafe.stderr).toMatch(/INFRASTRUCTURE_ERROR/);
    expect(fs.existsSync(path.join(path.dirname(out), 'escape-probe'))).toBe(false);
    for (const name of fs.readdirSync(out)) {
      expect(name).toMatch(/infrastructure-error\.json$/);
    }

    const out2 = makeTmp();
    const leaky = await runCli(
      ['--season', '2026', '--week', '7', '--fixture', DEMO_FIXTURE, '--out', out2, '--capture-id', 'leaky'],
      {
        resolveDependencyHashes: () => {
          throw new Error('connect postgresql://user:hunter2@db.example.com/app failed');
        },
      }
    );
    expect(leaky.code).toBe(2);
    expect(leaky.stderr).not.toMatch(/hunter2/);
    const receipts = fs.readdirSync(out2);
    expect(receipts).toEqual(['leaky-infrastructure-error.json']);
    expect(fs.readFileSync(path.join(out2, receipts[0]), 'utf8')).not.toMatch(/hunter2/);
  });

  it('rejects a second run into the same capture id without overwriting', async () => {
    const out = makeTmp();
    const argv = [
      '--season', '2026', '--week', '7', '--fixture', DEMO_FIXTURE, '--out', out,
      '--capture-id', 'cli-repeat',
    ];
    expect((await runCli(argv)).code).toBe(0);
    const before = fs.readFileSync(path.join(out, 'cli-repeat', 'manifest.json'), 'utf8');
    const second = await runCli(argv);
    expect(second.code).toBe(2);
    expect(second.stderr).toMatch(/capture_directory_exists/);
    expect(fs.readFileSync(path.join(out, 'cli-repeat', 'manifest.json'), 'utf8')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// F3 — live executable dependency identity
// ---------------------------------------------------------------------------

describe('F3 — live rejects dirty producer / lifecycle-weight before DB', () => {
  function git(cwd: string, args: string[]) {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=ml-cal-test',
        '-c',
        'user.email=ml-cal-test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.autocrlf=false',
        ...args,
      ],
      { cwd, stdio: 'pipe' }
    );
  }

  function makeLiveIdentityRepo(): string {
    const dir = makeTmp('ml-cal-1-live-id-');
    git(dir, ['init']);
    const paths = [
      ...Object.keys(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES),
      ...ML_CAL_1_CAPTURE_SELF_PATHS,
      ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
    ];
    for (const rel of paths) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, readGitShowBytes(REPO, rel, 'HEAD'));
    }
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'live identity deps']);
    return dir;
  }

  it('fixture mode records dirty runner without throwing', () => {
    const dir = makeLiveIdentityRepo();
    fs.writeFileSync(
      path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts'),
      fs.readFileSync(path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts')) + '\n// dirty\n'
    );
    const resolved = resolveDependencyHashes(dir, 'HEAD', { mode: 'fixture' });
    expect(resolved.dirty).toContain('apps/jobs/capture-ml-cal-1-2026.ts');
  });

  it('live mode rejects dirty runner, dirty planner, dirty weight path, and missing producer', () => {
    const dir = makeLiveIdentityRepo();
    // Dirty runner
    fs.writeFileSync(
      path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts'),
      fs.readFileSync(path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts')) + '\n// dirty-runner\n'
    );
    expect(() => resolveDependencyHashes(dir, 'HEAD', { mode: 'live' })).toThrow(
      /live_executable_dependency_dirty:.*capture-ml-cal-1-2026\.ts/
    );

    // Restore runner, dirty planner
    fs.writeFileSync(
      path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts'),
      readGitShowBytes(REPO, 'apps/jobs/capture-ml-cal-1-2026.ts', 'HEAD')
    );
    fs.writeFileSync(
      path.join(dir, 'apps/jobs/lib/ml-cal-1-capture.ts'),
      fs.readFileSync(path.join(dir, 'apps/jobs/lib/ml-cal-1-capture.ts')) + '\n// dirty-planner\n'
    );
    expect(() => resolveDependencyHashes(dir, 'HEAD', { mode: 'live' })).toThrow(
      /live_executable_dependency_dirty:.*ml-cal-1-capture\.ts/
    );

    // Restore planner, dirty lifecycle-weight dependency
    fs.writeFileSync(
      path.join(dir, 'apps/jobs/lib/ml-cal-1-capture.ts'),
      readGitShowBytes(REPO, 'apps/jobs/lib/ml-cal-1-capture.ts', 'HEAD')
    );
    fs.writeFileSync(
      path.join(dir, ML_CAL_1_LIFECYCLE_WEIGHT_PATH),
      fs.readFileSync(path.join(dir, ML_CAL_1_LIFECYCLE_WEIGHT_PATH)) + '\n// dirty-weight\n'
    );
    expect(() => resolveDependencyHashes(dir, 'HEAD', { mode: 'live' })).toThrow(
      /live_executable_dependency_dirty:.*balanced-v1-transition-blend-eval\.ts/
    );

    // Missing producer file
    fs.writeFileSync(
      path.join(dir, ML_CAL_1_LIFECYCLE_WEIGHT_PATH),
      readGitShowBytes(REPO, ML_CAL_1_LIFECYCLE_WEIGHT_PATH, 'HEAD')
    );
    fs.unlinkSync(path.join(dir, 'apps/jobs/capture-ml-cal-1-2026.ts'));
    expect(() => resolveDependencyHashes(dir, 'HEAD', { mode: 'live' })).toThrow(
      /live_executable_dependency_dirty:.*capture-ml-cal-1-2026\.ts/
    );
  });

  it('CLI live route never calls the live loader when executable deps are dirty', async () => {
    const loadLive = jest.fn();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runMlCal1Cli(
      ['--season', '2026', '--week', '7', '--enable-live-db-read', '--out', makeTmp(), '--capture-id', 'cli-dirty'],
      {
        cwd: REPO,
        resolveDependencyHashes: () => {
          throw new Error('live_executable_dependency_dirty:apps/jobs/capture-ml-cal-1-2026.ts');
        },
        loadLiveSnapshot: loadLive,
        stdout: (l) => stdout.push(l),
        stderr: (l) => stderr.push(l),
      }
    );
    expect(code).toBe(2);
    expect(loadLive).not.toHaveBeenCalled();
    expect(stderr.join('\n')).toMatch(/live_executable_dependency_dirty/);
  });
});

// ---------------------------------------------------------------------------
// Source hygiene
// ---------------------------------------------------------------------------

describe('source hygiene', () => {
  const helper = fs.readFileSync(path.join(REPO, 'apps/jobs/lib/ml-cal-1-capture.ts'), 'utf8');
  const cli = fs.readFileSync(path.join(REPO, 'apps/jobs/capture-ml-cal-1-2026.ts'), 'utf8');

  function importSpecifiers(src: string): string[] {
    const out: string[] = [];
    const re = /(?:from|require\()\s*['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out;
  }

  it('does not import or call getCoreV1SpreadFromTeams and has no provider imports', () => {
    for (const src of [helper, cli]) {
      expect(src).not.toMatch(/getCoreV1SpreadFromTeams/);
      expect(src).not.toMatch(/cfbd-client|oddsapi-client|OddsApi|fetch\(|axios|node-fetch/);
      expect(src).not.toMatch(/write-core-v1-weekly-card|executeAtomicAppendCommit/);
      expect(src).not.toMatch(/select:\s*\{[^}]*homeScore/);
      expect(src).not.toMatch(/(?:home|away)Score:\s*true/);
    }
  });

  it('helper imports only node built-ins and hashed web/jobs behavior dependencies', () => {
    // The six web pins live in ML_CAL_1_CANONICAL_GIT_BYTE_HASHES.
    // balanced-v1-transition-blend-eval is a live-executable hashed behavior dep
    // (ML_CAL_1_LIFECYCLE_WEIGHT_PATH), not one of the six production pins.
    const allowed = new Set([
      'crypto',
      'child_process',
      'fs',
      'path',
      '../../web/lib/core-v1-spread',
      '../../web/lib/data/core_v1_hfa_config.json',
      '../../web/lib/core-v1-moneyline',
      '../../web/lib/market-line-helpers',
      '../../web/lib/market-line-snapshot',
      '../src/preseason/balanced-v1-transition-blend-eval',
    ]);
    for (const spec of importSpecifiers(helper)) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it('CLI imports only node built-ins, Prisma client, and the capture helper', () => {
    const allowed = new Set(['fs', 'path', 'child_process', 'crypto', '@prisma/client', './lib/ml-cal-1-capture']);
    for (const spec of importSpecifiers(cli)) {
      expect(allowed.has(spec)).toBe(true);
    }
  });

  it('keeps current-mode snapshots, forbidden-field list, read-only transaction and zero provider calls', () => {
    expect(helper).toContain("mode: 'current'");
    expect(helper).toContain('ML_CAL_1_FORBIDDEN_GAME_FIELDS');
    expect(cli).toContain('SET TRANSACTION READ ONLY');
    expect(cli).toContain('providerCalls: 0');
    expect(cli).not.toMatch(/\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
  });

  it('the capture workflow declares no secrets, live DB, or production triggers', () => {
    const wfPath = path.join(REPO, '.github/workflows/test-ml-cal-1-capture-v1.yml');
    if (!fs.existsSync(wfPath)) return;
    const wf = fs.readFileSync(wfPath, 'utf8');
    expect(wf).not.toMatch(/secrets\./);
    expect(wf).not.toMatch(/DATABASE_URL|DIRECT_URL|ODDS_API|CFBD_API/);
    expect(wf).not.toMatch(/schedule:|cron:/);
    expect(wf).not.toMatch(/--enable-live-db-read/);
    expect(wf).toContain(
      'npx jest --runInBand --runTestsByPath apps/jobs/__tests__/ml-cal-1-capture.test.ts'
    );
  });
});
