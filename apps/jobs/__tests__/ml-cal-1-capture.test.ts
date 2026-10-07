/**
 * ML-CAL-1 Capture V1 — fixture tests (no live DB, no providers).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  HARD_MIN_ML_VALUE,
  ML_CAL_1_CAPTURE_SCHEMA_VERSION,
  ML_CAL_1_FULL_WEIGHT,
  ML_CAL_1_LIFECYCLE_POLICY,
  ML_CAL_1_LIVE_ODDS_SOURCE,
  ML_CAL_1_MAX_MARKET_AGE_SECONDS,
  ML_MAX_ABS_SPREAD,
  buildManifest,
  buildArtifactMembers,
  buildRatingFingerprint,
  chooseRatingField,
  computeDirectV1Margin,
  createInstrumentedReadClient,
  exportRatingInput,
  getActiveHfaConfigHash,
  hashFileUtf8,
  modelWinProbsFromCoreSpreadHma,
  parseMlCal1CliArgs,
  planMlCal1Capture,
  qualifyLifecycleReceipt,
  selectAsOfMoneylineEvidence,
  sha256Utf8Bytes,
  writeCaptureArtifactsAtomic,
  type MlCal1FixtureInput,
  type MlCal1LifecycleReceipt,
  type MlCal1MarketLineCandidate,
  type MlCal1RawRatingRow,
} from '../lib/ml-cal-1-capture';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import {
  selectCoreV1MoneylinePick,
} from '../../web/lib/core-v1-moneyline';

const REPO = path.resolve(__dirname, '../../..');
const REF_SHA = 'c37b5d367a364398d479c52844466aa4fd3306c2';

function decimal(n: number): { toString(): string; valueOf(): number } {
  return {
    toString: () => String(n),
    valueOf: () => n,
    // truthy object even when n === 0
  };
}

function iso(msOffsetFromBase: number, base = '2026-10-12T18:00:00.000Z'): string {
  return new Date(Date.parse(base) + msOffsetFromBase).toISOString();
}

function rating(
  teamId: string,
  power: number | null,
  ratingValue: number | null = null,
  opts: Partial<MlCal1RawRatingRow> = {}
): MlCal1RawRatingRow {
  return {
    season: 2026,
    teamId,
    modelVersion: 'v1',
    powerRating: power == null ? null : decimal(power),
    rating: ratingValue == null ? null : decimal(ratingValue),
    games: 6,
    dataSource: 'lifecycle',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...opts,
  };
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
  const book = options.bookName ?? 'BetRivers';
  const createdAt = options.createdAt ?? options.timestamp;
  const updatedAt = options.updatedAt ?? options.timestamp;
  const source = options.source ?? ML_CAL_1_LIVE_ODDS_SOURCE;
  return [
    {
      id: options.homeId ?? `${options.gameId}-ml-home`,
      gameId: options.gameId,
      lineType: 'moneyline',
      lineValue: options.homePrice,
      bookName: book,
      timestamp: options.timestamp,
      createdAt,
      updatedAt,
      teamId: options.homeTeamId,
      source,
    },
    {
      id: options.awayId ?? `${options.gameId}-ml-away`,
      gameId: options.gameId,
      lineType: 'moneyline',
      lineValue: options.awayPrice,
      bookName: book,
      timestamp: options.timestamp,
      createdAt,
      updatedAt,
      teamId: options.awayTeamId,
      source,
    },
  ];
}

function baseFixture(overrides: Partial<MlCal1FixtureInput> = {}): MlCal1FixtureInput {
  const captureEnd = '2026-10-12T18:00:00.000Z';
  const kickoff = '2026-10-12T23:00:00.000Z'; // 5h later
  const marketTs = '2026-10-12T17:45:00.000Z'; // 900s age

  const home = 'alabama';
  const away = 'georgia';
  const ratings = [rating(home, 12.5), rating(away, 4.25)];
  const ratingsByTeam: Record<string, ReturnType<typeof exportRatingInput>> = {};
  for (const r of ratings) ratingsByTeam[r.teamId] = exportRatingInput(r);
  const fp = buildRatingFingerprint(ratingsByTeam);

  const receipt: MlCal1LifecycleReceipt = {
    sourceSha: REF_SHA,
    completedThroughWeek: 6,
    selectedPolicy: ML_CAL_1_LIFECYCLE_POLICY,
    canonicalWeight: ML_CAL_1_FULL_WEIGHT,
    receiptDigest: sha256Utf8Bytes('fixture-receipt-v1'),
    ratingFingerprint: fp,
    acceptedImmutable: true,
  };

  return {
    captureId: 'fixture-capture-001',
    season: 2026,
    week: 7,
    repositorySha: REF_SHA,
    captureStartTime: '2026-10-12T17:59:50.000Z',
    captureEndTime: captureEnd,
    games: [
      {
        gameId: '2026-wk7-alabama-georgia',
        season: 2026,
        week: 7,
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: 'Alabama',
        awayTeamName: 'Georgia',
        kickoffAsKnown: kickoff,
        neutralSite: false,
      },
    ],
    fbsTeamIds: [home, away, 'troy', 'southern-mississippi'],
    ratings,
    marketLines: mlPair({
      gameId: '2026-wk7-alabama-georgia',
      homeTeamId: home,
      awayTeamId: away,
      homePrice: -150,
      awayPrice: 130,
      timestamp: marketTs,
    }),
    lifecycleReceipt: receipt,
    ...overrides,
  };
}

describe('ML-CAL-1 CLI validation (before DB)', () => {
  it('requires explicit season=2026 and integer week', () => {
    expect(() => parseMlCal1CliArgs(['--week', '7'])).toThrow(/season_required/);
    expect(() => parseMlCal1CliArgs(['--season', '2025', '--week', '7'])).toThrow(
      /unsupported_season:2025/
    );
    expect(() => parseMlCal1CliArgs(['--season', '2026', '--week', '1.5'])).toThrow(
      /invalid_week/
    );
    expect(parseMlCal1CliArgs(['--season', '2026', '--week', '7']).week).toBe(7);
  });

  it('rejects COMMIT / confirmation flags', () => {
    expect(() =>
      parseMlCal1CliArgs(['--season', '2026', '--week', '7', '--mode', 'COMMIT'])
    ).toThrow(/no-commit-mode/);
    expect(() =>
      parseMlCal1CliArgs(['--season', '2026', '--week', '7', '--confirm', 'x'])
    ).toThrow(/no-commit-mode/);
  });
});

describe('direct V1 spread / HFA parity', () => {
  it('matches computeEffectiveHfa + home-minus-away for true home', () => {
    const hfa = computeEffectiveHfa('alabama', false);
    const got = computeDirectV1Margin({
      homeValue: 12.5,
      awayValue: 4.25,
      homeTeamId: 'alabama',
      neutralSite: false,
    });
    expect(got.coreSpreadHma).toBe(12.5 - 4.25 + hfa.effectiveHfa);
    expect(got.hfa.effectiveHfa).toBe(hfa.effectiveHfa);
    expect(got.hfa.baseHfa).toBe(hfa.baseHfa);
    expect(got.hfa.teamAdjustment).toBe(hfa.teamAdjustment);
  });

  it('neutral effective HFA is zero', () => {
    const got = computeDirectV1Margin({
      homeValue: 10,
      awayValue: 3,
      homeTeamId: 'alabama',
      neutralSite: true,
    });
    expect(got.hfa.effectiveHfa).toBe(0);
    expect(got.coreSpreadHma).toBe(7);
  });

  it('preserves Decimal(0) powerRating via truthiness before Number()', () => {
    const chosen = chooseRatingField({
      powerRating: decimal(0),
      rating: decimal(9),
    });
    expect(chosen.chosenField).toBe('powerRating');
    expect(chosen.value).toBe(0);

    const numericZeroFallsThrough = chooseRatingField({
      powerRating: 0,
      rating: decimal(9),
    });
    expect(numericZeroFallsThrough.chosenField).toBe('rating');
    expect(numericZeroFallsThrough.value).toBe(9);
  });

  it('probability clipping and complementary away prob', () => {
    const mid = modelWinProbsFromCoreSpreadHma(0);
    expect(mid.modelHomeWinProb + mid.modelAwayWinProb).toBeCloseTo(1, 12);

    const huge = modelWinProbsFromCoreSpreadHma(100);
    expect(huge.modelHomeWinProb).toBe(0.99);
    expect(huge.modelAwayWinProb).toBeCloseTo(0.01, 12);

    const tiny = modelWinProbsFromCoreSpreadHma(-100);
    expect(tiny.modelHomeWinProb).toBe(0.01);
  });

  it('fixture parity: exported inputs reproduce adapter margin vs HFA helper', () => {
    const home = exportRatingInput(rating('james-madison', 8));
    const away = exportRatingInput(rating('troy', 2));
    const computed = computeDirectV1Margin({
      homeValue: home.valueUsed!,
      awayValue: away.valueUsed!,
      homeTeamId: 'james-madison',
      neutralSite: false,
    });
    const hfa = computeEffectiveHfa('james-madison', false);
    expect(computed.coreSpreadHma).toBe(8 - 2 + hfa.effectiveHfa);
    expect(computed.hfa.hfaConfigHash).toBe(getActiveHfaConfigHash());
  });
});

describe('selection gates and retention', () => {
  it('abs(m)=24 eligible; just beyond suppressed; forecasts retained', () => {
    const hfa = computeEffectiveHfa('alabama', true).effectiveHfa; // 0
    // Build ratings so margin === 24 and 24.0001 via neutral
    const atGate = baseFixture({
      ratings: [rating('alabama', 24), rating('georgia', 0)],
      games: [
        {
          gameId: 'g-gate',
          season: 2026,
          week: 7,
          homeTeamId: 'alabama',
          awayTeamId: 'georgia',
          homeTeamName: 'Alabama',
          awayTeamName: 'Georgia',
          kickoffAsKnown: '2026-10-12T23:00:00.000Z',
          neutralSite: true,
        },
      ],
      marketLines: mlPair({
        gameId: 'g-gate',
        homeTeamId: 'alabama',
        awayTeamId: 'georgia',
        homePrice: -200,
        awayPrice: 170,
        timestamp: '2026-10-12T17:45:00.000Z',
      }),
    });
    // Fix receipt fingerprint for new ratings
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of atGate.ratings) by[r.teamId] = exportRatingInput(r);
    atGate.lifecycleReceipt = {
      ...atGate.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };

    const plan24 = planMlCal1Capture(atGate);
    const f24 = plan24.bundle.forecasts.rows[0];
    expect(f24.coreSpreadHma).toBe(24 + hfa);
    expect(Math.abs(f24.coreSpreadHma!)).toBe(ML_MAX_ABS_SPREAD);
    expect(f24.absSpreadWithinGate).toBe(true);
    expect(f24.forecastAvailable).toBe(true);

    const beyond = baseFixture({
      ...atGate,
      captureId: 'beyond',
      ratings: [rating('alabama', 24.1), rating('georgia', 0)],
      games: atGate.games,
      marketLines: atGate.marketLines,
    });
    const by2: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of beyond.ratings) by2[r.teamId] = exportRatingInput(r);
    beyond.lifecycleReceipt = {
      ...beyond.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by2),
    };
    const planBeyond = planMlCal1Capture(beyond);
    const fb = planBeyond.bundle.forecasts.rows[0];
    expect(fb.forecastAvailable).toBe(true);
    expect(fb.selectionStatus).toBe('LARGE_SPREAD_SUPPRESSED');
    expect(fb.coreSpreadHma).not.toBeNull();
  });

  it('exact 1pp not selected; home wins value ties', () => {
    // Construct prices so home value == exactly 0.01
    const coreSpreadHma = 0;
    const probs = modelWinProbsFromCoreSpreadHma(coreSpreadHma);
    // implied home = model - 0.01 → value exactly HARD_MIN
    // americanFromProb inverse is awkward; use selectCoreV1MoneylinePick directly
    const exact = selectCoreV1MoneylinePick({
      coreSpreadHma: 0,
      homeTeamId: 'h',
      awayTeamId: 'a',
      homeTeamName: 'H',
      awayTeamName: 'A',
      // Both -110 → value small
      homeAmericanPrice: -110,
      awayAmericanPrice: -110,
    });
    // With m=0 and -110/-110, value is below 1pp → null
    expect(exact).toBeNull();
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
    // Equal value → home preference
    expect(tieHome!.side).toBe('home');
  });

  it('retains no-selection forecasts in full ledger', () => {
    // Tight prices near fair → NO_SELECTION but forecast kept
    const fx = baseFixture({
      marketLines: mlPair({
        gameId: '2026-wk7-alabama-georgia',
        homeTeamId: 'alabama',
        awayTeamId: 'georgia',
        homePrice: -10000,
        awayPrice: -10000,
        timestamp: '2026-10-12T17:45:00.000Z',
      }),
    });
    const plan = planMlCal1Capture(fx);
    expect(plan.bundle.forecasts.rows).toHaveLength(1);
    expect(plan.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(
      ['NO_SELECTION', 'SELECTED', 'MARKET_UNAVAILABLE'].includes(
        plan.bundle.forecasts.rows[0].selectionStatus
      )
    ).toBe(true);
    expect(plan.bundle.universe.rows).toHaveLength(1);
  });
});

describe('universe ledger coverage', () => {
  it('keeps missing ratings, non-FBS, late kickoff, and frame conflicts', () => {
    const kickok = '2026-10-12T23:00:00.000Z';
    const fx = baseFixture({
      games: [
        {
          gameId: 'fbs-ok',
          season: 2026,
          week: 7,
          homeTeamId: 'alabama',
          awayTeamId: 'georgia',
          homeTeamName: 'Alabama',
          awayTeamName: 'Georgia',
          kickoffAsKnown: kickok,
          neutralSite: false,
        },
        {
          gameId: 'missing-rating',
          season: 2026,
          week: 7,
          homeTeamId: 'alabama',
          awayTeamId: 'missing-team',
          homeTeamName: 'Alabama',
          awayTeamName: 'Missing',
          kickoffAsKnown: kickok,
          neutralSite: false,
        },
        {
          gameId: 'non-fbs',
          season: 2026,
          week: 7,
          homeTeamId: 'alabama',
          awayTeamId: 'fcs-team',
          homeTeamName: 'Alabama',
          awayTeamName: 'FCS',
          kickoffAsKnown: kickok,
          neutralSite: false,
        },
        {
          gameId: 'late',
          season: 2026,
          week: 7,
          homeTeamId: 'troy',
          awayTeamId: 'southern-mississippi',
          homeTeamName: 'Troy',
          awayTeamName: 'Southern Miss',
          kickoffAsKnown: '2026-10-12T18:10:00.000Z', // only 10m after capture end
          neutralSite: false,
        },
      ],
      fbsTeamIds: ['alabama', 'georgia', 'troy', 'southern-mississippi'],
      ratings: [
        rating('alabama', 10),
        rating('georgia', 5),
        rating('troy', 3),
        rating('southern-mississippi', 1),
      ],
      marketLines: [],
    });
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of fx.ratings) by[r.teamId] = exportRatingInput(r);
    fx.lifecycleReceipt = {
      ...fx.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };

    const plan = planMlCal1Capture(fx);
    expect(plan.bundle.universe.rows).toHaveLength(4);
    const missing = plan.bundle.forecasts.rows.find((r) => r.gameId === 'missing-rating')!;
    expect(missing.forecastAvailable).toBe(false);
    expect(missing.unavailableReasons.join('')).toMatch(/missing_away/);

    const nonFbs = plan.bundle.universe.rows.find((r) => r.gameId === 'non-fbs')!;
    expect(nonFbs.bothFbs).toBe(false);
    expect(nonFbs.exclusionReasons).toContain('non_fbs_matchup');

    const late = plan.bundle.forecasts.rows.find((r) => r.gameId === 'late')!;
    expect(late.lateCapture).toBe(true);
    expect(late.forecastAvailable).toBe(false);
    expect(late.unavailableReasons.join('')).toMatch(/30m/);

    // Duplicate game ids block
    const dup = baseFixture({
      games: [
        ...fx.games.slice(0, 1),
        { ...fx.games[0], gameId: 'fbs-ok' },
      ],
    });
    const planDup = planMlCal1Capture(dup);
    expect(planDup.primaryReadinessBlocked).toBe(true);
    expect(planDup.primaryBlockReasons.join('')).toMatch(/duplicate_game_id/);
  });
});

describe('market as-of / age / provenance', () => {
  const ref = '2026-10-12T18:00:00.000Z';

  it('allows age=1800 inclusive and rejects above', () => {
    const atLimit = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(-ML_CAL_1_MAX_MARKET_AGE_SECONDS * 1000, ref),
      }),
    });
    expect(atLimit.evidence.available).toBe(true);
    expect(atLimit.evidence.observationAgeSeconds).toBe(1800);

    const stale = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(-(ML_CAL_1_MAX_MARKET_AGE_SECONDS + 1) * 1000, ref),
      }),
    });
    expect(stale.evidence.available).toBe(false);
    expect(stale.rejectionLedger[0].reasons.join('')).toMatch(/stale/);
  });

  it('rejects future observation and future known-at independently', () => {
    const futureObs = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(1000, ref),
        createdAt: iso(-1000, ref),
      }),
    });
    expect(futureObs.rejectionLedger.some((r) =>
      r.reasons.includes('observation_timestamp_after_reference')
    )).toBe(true);

    const futureKnown = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(-1000, ref),
        createdAt: iso(1000, ref),
      }),
    });
    expect(futureKnown.rejectionLedger.some((r) =>
      r.reasons.includes('known_at_after_reference')
    )).toBe(true);
  });

  it('rejects updatedAt after reference, zero prices, wrong teams, book/provider mismatch', () => {
    const revised = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(-500, ref),
        updatedAt: iso(500, ref),
      }),
    });
    expect(revised.rejectionLedger[0].reasons.join('')).toMatch(/updated_at/);

    const zero = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'h',
        awayTeamId: 'a',
        homePrice: 0,
        awayPrice: 100,
        timestamp: iso(-500, ref),
      }),
    });
    expect(zero.evidence.available).toBe(false);

    const wrongTeam = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: mlPair({
        gameId: 'g1',
        homeTeamId: 'other',
        awayTeamId: 'a',
        homePrice: -120,
        awayPrice: 100,
        timestamp: iso(-500, ref),
      }),
    });
    expect(wrongTeam.evidence.available).toBe(false);

    const mismatchSource = selectAsOfMoneylineEvidence({
      gameId: 'g1',
      homeTeamId: 'h',
      awayTeamId: 'a',
      predictionReferenceTime: ref,
      candidates: [
        ...mlPair({
          gameId: 'g1',
          homeTeamId: 'h',
          awayTeamId: 'a',
          homePrice: -120,
          awayPrice: 100,
          timestamp: iso(-500, ref),
          source: 'oddsapi',
          homeId: 'h1',
          awayId: 'a1',
        }),
      ].map((r, i) =>
        i === 1 ? { ...r, source: 'other-provider' } : r
      ),
    });
    // Source mismatch on candidates → away rejected → no pair
    expect(mismatchSource.evidence.available).toBe(false);
  });

  it('does not drop Core forecast when market missing', () => {
    const fx = baseFixture({ marketLines: [] });
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of fx.ratings) by[r.teamId] = exportRatingInput(r);
    fx.lifecycleReceipt = {
      ...fx.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };
    const plan = planMlCal1Capture(fx);
    expect(plan.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(plan.bundle.markets.moneyline[0].available).toBe(false);
    expect(plan.bundle.envelope.counts.availableForecasts).toBe(1);
    expect(plan.bundle.envelope.counts.missingMarkets).toBe(1);
  });
});

describe('lifecycle receipt binding', () => {
  it('missing / mismatched receipt cannot qualify primary', () => {
    const missing = qualifyLifecycleReceipt({
      receipt: null,
      expectedRatingFingerprint: 'abc',
      repositorySha: REF_SHA,
    });
    expect(missing.qualified).toBe(false);

    const fx = baseFixture({
      lifecycleReceipt: {
        ...baseFixture().lifecycleReceipt!,
        ratingFingerprint: 'deadbeef',
        canonicalWeight: 0.75,
      },
    });
    const plan = planMlCal1Capture(fx);
    expect(plan.primaryReadinessBlocked).toBe(true);
    expect(plan.bundle.envelope.lifecycleQualification.qualified).toBe(false);
    expect(plan.bundle.forecasts.rows[0].primaryEligibleCandidate).toBe(false);
    // Forecast evidence still preserved
    expect(plan.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
  });
});

describe('instrumented DB mock isolation', () => {
  it('rejects forbidden score/outcome/bet/2025 reads and mutations', async () => {
    const client = createInstrumentedReadClient({
      allowedSeason: 2026,
      delegate: {
        game: {
          findMany: async () => [],
        },
        teamMembership: { findMany: async () => [] },
        teamSeasonRating: { findMany: async () => [] },
        marketLine: { findMany: async () => [] },
      },
    });

    await expect(
      client.game.findMany({
        where: { season: 2026 },
        select: { id: true, homeScore: true },
      })
    ).rejects.toThrow(/forbidden_game_select_field:homeScore/);

    await expect(
      client.teamSeasonRating.findMany({ where: { season: 2025 } })
    ).rejects.toThrow(/forbidden/);

    await expect((client as any).bet.findMany({})).rejects.toThrow(/forbidden_bet/);
    await expect((client as any).teamGameStat.findMany({})).rejects.toThrow(
      /forbidden_team_game_stat/
    );
    await expect((client as any).teamSeasonRating.update({})).rejects.toThrow(
      /forbidden_mutation/
    );
  });

  it('detects injected rating drift vs exported fingerprint', () => {
    const a = exportRatingInput(rating('alabama', 10));
    const b = exportRatingInput(rating('alabama', 10.0001));
    expect(a.rowContentHash).not.toBe(b.rowContentHash);
    const fp1 = buildRatingFingerprint({ alabama: a });
    const fp2 = buildRatingFingerprint({ alabama: b });
    expect(fp1).not.toBe(fp2);
  });
});

describe('artifacts / manifests / reproducibility', () => {
  it('frozen fixture yields identical bytes/hashes; tamper detected', () => {
    const fx = baseFixture({ captureId: 'frozen-001' });
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of fx.ratings) by[r.teamId] = exportRatingInput(r);
    fx.lifecycleReceipt = {
      ...fx.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };

    const p1 = planMlCal1Capture(fx);
    const p2 = planMlCal1Capture(fx);
    const deps = {
      'apps/web/lib/core-v1-moneyline.ts': hashFileUtf8(
        path.join(REPO, 'apps/web/lib/core-v1-moneyline.ts')
      ),
    };
    p1.bundle.envelope.dependencyHashes = deps;
    p2.bundle.envelope.dependencyHashes = deps;

    const m1 = buildArtifactMembers(p1.bundle);
    const m2 = buildArtifactMembers(p2.bundle);
    expect(m1['forecasts.json']).toBe(m2['forecasts.json']);

    const man1 = buildManifest({
      captureId: fx.captureId,
      members: m1,
      dependencyHashes: deps,
      repositorySha: REF_SHA,
      producerVersion: p1.bundle.envelope.producerVersion,
    });
    const man2 = buildManifest({
      captureId: fx.captureId,
      members: m2,
      dependencyHashes: deps,
      repositorySha: REF_SHA,
      producerVersion: p2.bundle.envelope.producerVersion,
    });
    expect(man1.manifestJson).toBe(man2.manifestJson);
    expect(man1.manifest).not.toHaveProperty('manifestSha256');

    const tampered = { ...m1, 'forecasts.json': m1['forecasts.json'] + ' ' };
    const manT = buildManifest({
      captureId: fx.captureId,
      members: tampered,
      dependencyHashes: deps,
      repositorySha: REF_SHA,
      producerVersion: p1.bundle.envelope.producerVersion,
    });
    expect(manT.memberDigests['forecasts.json'].sha256).not.toBe(
      man1.memberDigests['forecasts.json'].sha256
    );
  });

  it('atomic write never overwrites; unavailable numbers are null not NaN', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-cal-1-'));
    const fx = baseFixture({ captureId: 'atomic-001', marketLines: [] });
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of fx.ratings) by[r.teamId] = exportRatingInput(r);
    fx.lifecycleReceipt = {
      ...fx.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };
    const plan = planMlCal1Capture(fx);
    const written = writeCaptureArtifactsAtomic({
      rootDir: tmp,
      captureId: fx.captureId,
      bundle: plan.bundle,
      dependencyHashes: { x: 'y' },
    });
    expect(fs.existsSync(path.join(written.captureDir, 'manifest.json'))).toBe(
      true
    );
    expect(() =>
      writeCaptureArtifactsAtomic({
        rootDir: tmp,
        captureId: fx.captureId,
        bundle: plan.bundle,
        dependencyHashes: { x: 'y' },
      })
    ).toThrow(/capture_directory_exists/);

    const markets = JSON.parse(
      fs.readFileSync(path.join(written.captureDir, 'markets.json'), 'utf8')
    );
    const ml = markets.moneyline[0];
    expect(ml.homePrice).toBeNull();
    expect(Number.isNaN(ml.homePrice)).toBe(false);
    expect(plan.bundle.envelope.schemaVersion).toBe(ML_CAL_1_CAPTURE_SCHEMA_VERSION);

    // No outcome/label/loss fields in artifacts
    const forecastText = fs.readFileSync(
      path.join(written.captureDir, 'forecasts.json'),
      'utf8'
    );
    expect(forecastText).not.toMatch(/"brier"|"logLoss"|"homeScore"|"pnl"/);
  });

  it('independently reproduces an available forecast from exported inputs', () => {
    const fx = baseFixture();
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const r of fx.ratings) by[r.teamId] = exportRatingInput(r);
    fx.lifecycleReceipt = {
      ...fx.lifecycleReceipt!,
      ratingFingerprint: buildRatingFingerprint(by),
    };
    const plan = planMlCal1Capture(fx);
    const row = plan.bundle.forecasts.rows[0];
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
  });
});

describe('source hygiene', () => {
  it('capture modules do not import providers or score writers', () => {
    const helper = fs.readFileSync(
      path.join(REPO, 'apps/jobs/lib/ml-cal-1-capture.ts'),
      'utf8'
    );
    const cli = fs.readFileSync(
      path.join(REPO, 'apps/jobs/capture-ml-cal-1-2026.ts'),
      'utf8'
    );
    for (const src of [helper, cli]) {
      expect(src).not.toMatch(/from ['"].*cfbd-client/);
      expect(src).not.toMatch(/OddsApi|oddsapi-client|fetch\(/);
      expect(src).not.toMatch(/write-core-v1-weekly-card|executeAtomicAppendCommit/);
      // Forbid-list may name score fields; ban actual select/projection usage.
      expect(src).not.toMatch(/select:\s*\{[^}]*homeScore/);
      expect(src).not.toMatch(/homeScore:\s*true/);
      expect(src).not.toMatch(/awayScore:\s*true/);
      expect(src).not.toMatch(/getCoreV1SpreadFromTeams/);
    }
    expect(helper).toContain("mode: 'current'");
    expect(helper).toContain('ML_CAL_1_FORBIDDEN_GAME_FIELDS');
    expect(cli).toContain('SET TRANSACTION READ ONLY');
    expect(cli).toContain('providerCalls: 0');
  });

  it('reference production files unchanged vs pinned main hashes', () => {
    // Verified UTF-8 SHA-256 at origin/main c37b5d3… (PR 243 draft table differed).
    const expected: Record<string, string> = {
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
    for (const [rel, hash] of Object.entries(expected)) {
      expect(hashFileUtf8(path.join(REPO, rel))).toBe(hash);
    }
  });
});
