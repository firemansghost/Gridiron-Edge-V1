/**
 * Phase 2C-2J-2 repair — Guarded 2026 Live Odds pure tests (no provider, no production DB).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AUTHORITATIVE_FBS_COUNT,
  KICKOFF_MATCH_TOLERANCE_MS,
  LIVE_ODDS_MARKETS,
  LIVE_ODDS_REGION,
  LIVE_ODDS_SEASON,
  LIVE_ODDS_SOURCE,
  MAX_EXPECTED_REQUEST_CREDITS,
  MAX_ABS_SPREAD,
  WEEK1_GAME_COUNT,
  assertCreateManyCountMatches,
  buildCommittedVerificationFailureExecution,
  buildCoverage,
  buildFailedCommitExecution,
  buildLiveOddsPlan,
  buildPreviewExecution,
  buildSuccessfulCommitExecution,
  classifyProviderEvent,
  commitEligible,
  dedupeCandidates,
  evaluateProviderCredits,
  expectedWriteConfirmation,
  finalizeLiveOddsReport,
  fingerprintKey,
  normalizeMoneylinePair,
  normalizeSpreadPair,
  normalizeTotalPair,
  reconcileWithExisting,
  validateAuthoritativeSchedule,
  validateLiveOddsInputs,
  verifyInsertedFingerprints,
  type CandidateMarketLine,
  type ProviderEvent,
  type ScheduledGameRow,
} from '../src/odds/live-odds-2026';

const ROOT = path.resolve(__dirname, '../../..');
const WK1_DATE = '2026-08-30T19:00:00.000Z';
const WK5_DATE = '2026-10-11T19:00:00.000Z';

function fbsIds(n = AUTHORITATIVE_FBS_COUNT): string[] {
  return Array.from({ length: n }, (_, i) => `team-${String(i + 1).padStart(3, '0')}`);
}

function week1Games(ids: string[]): ScheduledGameRow[] {
  const games: ScheduledGameRow[] = [];
  for (let i = 0; i < WEEK1_GAME_COUNT; i++) {
    games.push({
      gameId: `2026-wk1-g${i + 1}`,
      season: 2026,
      week: 1,
      homeTeamId: ids[i * 2],
      awayTeamId: ids[i * 2 + 1],
      date: WK1_DATE,
    });
  }
  return games;
}

function resolveMap(map: Record<string, { teamId: string; method: any }>) {
  return (name: string) => map[name] || { teamId: null, method: null };
}

describe('2C-2J-2 live-odds-2026 guards (repaired)', () => {
  const ids = fbsIds();
  const games = week1Games(ids);

  it('season exactly 2026; week validated; PREVIEW default confirmation phrase', () => {
    expect(LIVE_ODDS_SEASON).toBe(2026);
    expect(expectedWriteConfirmation(1)).toBe('WRITE_2026_WEEK_1_ODDS');
    expect(expectedWriteConfirmation(12)).toBe('WRITE_2026_WEEK_12_ODDS');
    expect(
      validateLiveOddsInputs({ season: 2025, week: 1, mode: 'PREVIEW' }).ok
    ).toBe(false);
    const ok = validateLiveOddsInputs({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
    });
    expect(ok.ok).toBe(true);
    expect(ok.mode).toBe('PREVIEW');
  });

  it('COMMIT exact confirmation computed from week; blocked without it', () => {
    const missing = validateLiveOddsInputs({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: '',
    });
    expect(missing.ok).toBe(false);
    expect(missing.confirmationValid).toBe(false);
    const ok = validateLiveOddsInputs({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_1_ODDS',
    });
    expect(ok.ok).toBe(true);
    expect(ok.confirmationValid).toBe(true);
  });

  it('credits: providerCalls must be 1; overage blocks', () => {
    expect(MAX_EXPECTED_REQUEST_CREDITS).toBe(3);
    expect(LIVE_ODDS_MARKETS).toBe('h2h,spreads,totals');
    expect(LIVE_ODDS_REGION).toBe('us');
    expect(evaluateProviderCredits({ providerCalls: 2, requestsLast: '1' }).ok).toBe(
      false
    );
    expect(
      evaluateProviderCredits({ providerCalls: 1, requestsLast: '4' }).ok
    ).toBe(false);
    expect(
      evaluateProviderCredits({ providerCalls: 1, requestsLast: '3' }).ok
    ).toBe(true);
  });

  it('authoritative FBS 138 + Week1 51 both-FBS required', () => {
    const ok = validateAuthoritativeSchedule({
      week: 1,
      fbsTeamIds: ids,
      games,
    });
    expect(ok.ok).toBe(true);
    expect(ok.bothFbsCount).toBe(51);
    expect(
      validateAuthoritativeSchedule({
        week: 1,
        fbsTeamIds: ids.slice(0, 100),
        games,
      }).ok
    ).toBe(false);
    expect(
      validateAuthoritativeSchedule({
        week: 1,
        fbsTeamIds: ids,
        games: games.slice(0, 50),
      }).ok
    ).toBe(false);
  });

  it('classifies FBS-FCS / later-week / unmatched / ambiguous / fuzzy / unresolved expected', () => {
    const resolve = resolveMap({
      Alabama: { teamId: ids[0], method: 'alias' },
      Georgia: { teamId: ids[1], method: 'alias' },
      'North Dakota State': { teamId: 'north-dakota-state', method: 'alias' },
      FuzzyU: { teamId: ids[2], method: 'fuzzy' },
      FuzzyState: { teamId: ids[3], method: 'fuzzy' },
    });
    const fbs = new Set(ids);

    const fcs = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'North Dakota State',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(fcs.classification).toBe('out_of_scope_fbs_fcs');

    const laterGame: ScheduledGameRow = {
      gameId: '2026-wk5-g1',
      season: 2026,
      week: 5,
      homeTeamId: ids[130],
      awayTeamId: ids[131],
      date: WK5_DATE,
    };
    const resolveLater = resolveMap({
      HomeLater: { teamId: ids[130], method: 'alias' },
      AwayLater: { teamId: ids[131], method: 'alias' },
    });
    const later = classifyProviderEvent({
      event: {
        home_team: 'HomeLater',
        away_team: 'AwayLater',
        commence_time: WK5_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: [...games, laterGame],
      resolveTeam: resolveLater,
    });
    expect(later.classification).toBe('out_of_requested_week');

    const resolveUnmatched = resolveMap({
      A: { teamId: ids[132], method: 'alias' },
      B: { teamId: ids[133], method: 'alias' },
    });
    const um = classifyProviderEvent({
      event: {
        home_team: 'A',
        away_team: 'B',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolveUnmatched,
    });
    expect(um.classification).toBe('unmatched_both_fbs');

    const dupGames = [games[0], { ...games[0], gameId: 'dup-2' }];
    const amb = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: dupGames,
      seasonGames: dupGames,
      resolveTeam: resolve,
    });
    expect(amb.classification).toBe('ambiguous');

    const fuzzy = classifyProviderEvent({
      event: {
        home_team: 'FuzzyU',
        away_team: 'FuzzyState',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: [
        {
          gameId: 'fz',
          season: 2026,
          week: 1,
          homeTeamId: ids[2],
          awayTeamId: ids[3],
          date: WK1_DATE,
        },
      ],
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(fuzzy.classification).toBe('fuzzy_required');

    // One FBS resolved near Week1 kickoff with a Week1 Game; opponent unresolved → fail closed
    const unresolvedExpected = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Unknown Opponent U',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(unresolvedExpected.classification).toBe('unresolved_expected_fbs');
  });

  it('FBS with no requested-week FBS opponent + unresolved side is out_of_scope_fbs_fcs', () => {
    // ids[134]/ids[135] are unused by week1Games (uses 0..101)
    const resolve = resolveMap({
      LoneFbs: { teamId: ids[134], method: 'alias' },
    });
    const diag = classifyProviderEvent({
      event: {
        home_team: 'LoneFbs',
        away_team: 'Some FCS School',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(diag.classification).toBe('out_of_scope_fbs_fcs');
    expect(diag.detail).toMatch(/no authoritative FBS-vs-FBS Game/i);

    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        {
          home_team: 'LoneFbs',
          away_team: 'Some FCS School',
          commence_time: WK1_DATE,
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(plan.eventCounts.out_of_scope_fbs_fcs).toBe(1);
    expect(plan.eventCounts.unresolved_expected_fbs).toBe(0);
    expect(plan.writeSafe).toBe(true);
  });

  it('FBS with Week1 opponent + unresolved provider opponent blocks; later week with other-week FBS game is nonblocking', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
    });
    const aligned = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Missing Alias Opponent',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(aligned.classification).toBe('unresolved_expected_fbs');

    // No near FBS game at later kickoff → out_of_scope (nonblocking)
    const laterNoGame = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Missing Alias Opponent',
        commence_time: WK5_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(laterNoGame.classification).toBe('out_of_scope_fbs_fcs');

    // Near FBS game in another week → out_of_requested_week (nonblocking)
    const week5Game: ScheduledGameRow = {
      gameId: '2026-wk5-alabama',
      season: 2026,
      week: 5,
      homeTeamId: games[0].homeTeamId,
      awayTeamId: ids[120],
      date: WK5_DATE,
    };
    const laterOtherWeek = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Missing Alias Opponent',
        commence_time: WK5_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: [...games, week5Game],
      resolveTeam: resolve,
    });
    expect(laterOtherWeek.classification).toBe('out_of_requested_week');

    const planLater = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: [...games, week5Game],
      providerEvents: [
        {
          home_team: 'Alabama',
          away_team: 'Missing Alias Opponent',
          commence_time: WK5_DATE,
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(planLater.writeSafe).toBe(true);
  });

  it('exact Week1 pair requires kickoff alignment; missing commence blocks', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const fbs = new Set(ids);

    const aligned = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(aligned.classification).toBe('matched_requested_week');

    const farKickoff = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
        // >36h from WK1_DATE
        commence_time: '2026-09-05T19:00:00.000Z',
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(farKickoff.classification).toBe('week_mismatch');
    expect(farKickoff.detail).toMatch(/more than kickoff tolerance/i);

    const missing = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(missing.classification).toBe('week_mismatch');
    expect(missing.detail).toMatch(/missing\/malformed/i);

    const malformed = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
        commence_time: 'not-a-date',
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(malformed.classification).toBe('week_mismatch');
  });

  it('week_mismatch when commence is in Week1 window but pair only stored under other week', () => {
    const misdatedOtherWeek: ScheduledGameRow = {
      gameId: '2026-wk5-wrongbucket',
      season: 2026,
      week: 5,
      homeTeamId: ids[130],
      awayTeamId: ids[131],
      // Intentionally inside Week1 kickoff window despite DB week=5
      date: WK1_DATE,
    };
    const resolve = resolveMap({
      HomeX: { teamId: ids[130], method: 'alias' },
      AwayX: { teamId: ids[131], method: 'alias' },
    });
    const mm = classifyProviderEvent({
      event: {
        home_team: 'HomeX',
        away_team: 'AwayX',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: [...games, misdatedOtherWeek],
      resolveTeam: resolve,
    });
    expect(mm.classification).toBe('week_mismatch');
    expect(KICKOFF_MATCH_TOLERANCE_MS).toBe(36 * 60 * 60 * 1000);
  });

  it('legitimate later-week event remains out_of_requested_week nonblocking', () => {
    const laterGame: ScheduledGameRow = {
      gameId: '2026-wk5-g1',
      season: 2026,
      week: 5,
      homeTeamId: ids[130],
      awayTeamId: ids[131],
      date: WK5_DATE,
    };
    const resolve = resolveMap({
      HomeLater: { teamId: ids[130], method: 'alias' },
      AwayLater: { teamId: ids[131], method: 'alias' },
    });
    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: [...games, laterGame],
      providerEvents: [
        {
          home_team: 'HomeLater',
          away_team: 'AwayLater',
          commence_time: WK5_DATE,
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(plan.eventCounts.out_of_requested_week).toBe(1);
    expect(plan.eventCounts.week_mismatch).toBe(0);
    expect(plan.writeSafe).toBe(true);
    expect(plan.proposedInsert).toHaveLength(0);
  });

  it('deterministic alias resolution accepted as matched_requested_week', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const m = classifyProviderEvent({
      event: {
        home_team: 'Alabama',
        away_team: 'Georgia',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(m.classification).toBe('matched_requested_week');
    expect(m.gameId).toBe(games[0].gameId);
  });

  it('spread/total/moneyline normalization + exact outcome counts', () => {
    const game = games[0];
    const ts = new Date('2026-08-28T12:00:00.000Z');
    const resolve = resolveMap({
      Home: { teamId: game.homeTeamId, method: 'alias' },
      Away: { teamId: game.awayTeamId, method: 'alias' },
      Extra: { teamId: ids[4], method: 'alias' },
    });

    const spreads = normalizeSpreadPair(
      [
        { name: 'Home', point: -7 },
        { name: 'Away', point: 7 },
      ],
      game,
      'DraftKings',
      ts,
      'e1',
      resolve
    );
    expect(spreads.candidates).toHaveLength(2);
    expect(spreads.candidates.every((c) => c.teamId)).toBe(true);
    expect(spreads.candidates[0].source).toBe(LIVE_ODDS_SOURCE);

    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -100.5 },
          { name: 'Away', point: 100.5 },
        ],
        game,
        'DraftKings',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(0);

    // Production-observed large favorites (Ball State @ Ohio State)
    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -51 },
          { name: 'Away', point: 51 },
        ],
        game,
        'DraftKings',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(2);
    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -50.5 },
          { name: 'Away', point: 50.5 },
        ],
        game,
        'FanDuel',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(2);
    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -100 },
          { name: 'Away', point: 100 },
        ],
        game,
        'Bovada',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(2);

    expect(
      normalizeSpreadPair(
        [{ name: 'Home', point: -7 }],
        game,
        'DraftKings',
        ts,
        'e1',
        resolve
      ).rejected[0].reason
    ).toMatch(/exactly two/);

    // 3 spread outcomes rejected
    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -7 },
          { name: 'Away', point: 7 },
          { name: 'Extra', point: 3 },
        ],
        game,
        'DraftKings',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(0);

    // duplicate spread team rejected
    expect(
      normalizeSpreadPair(
        [
          { name: 'Home', point: -7 },
          { name: 'Home', point: 7 },
        ],
        game,
        'DraftKings',
        ts,
        'e1',
        resolve
      ).rejected[0].reason
    ).toMatch(/duplicate team/i);

    const totals = normalizeTotalPair(
      [
        { name: 'Over', point: 48.5 },
        { name: 'Under', point: 48.5 },
      ],
      game,
      'FanDuel',
      ts,
      'e1'
    );
    expect(totals.candidates).toHaveLength(1);
    expect(totals.candidates[0].teamId).toBeNull();

    expect(
      normalizeTotalPair(
        [
          { name: 'Over', point: 48.5 },
          { name: 'Under', point: 49.5 },
        ],
        game,
        'FanDuel',
        ts
      ).candidates
    ).toHaveLength(0);

    expect(
      normalizeTotalPair(
        [
          { name: 'Over', point: 150 },
          { name: 'Under', point: 150 },
        ],
        game,
        'FanDuel',
        ts
      ).candidates
    ).toHaveLength(0);

    // duplicate Over rejected
    expect(
      normalizeTotalPair(
        [
          { name: 'Over', point: 48.5 },
          { name: 'Over', point: 48.5 },
          { name: 'Under', point: 48.5 },
        ],
        game,
        'FanDuel',
        ts
      ).rejected[0].reason
    ).toMatch(/exactly one Over/);

    // duplicate Under rejected
    expect(
      normalizeTotalPair(
        [
          { name: 'Over', point: 48.5 },
          { name: 'Under', point: 48.5 },
          { name: 'Under', point: 48.5 },
        ],
        game,
        'FanDuel',
        ts
      ).rejected[0].reason
    ).toMatch(/Under=/);

    const ml = normalizeMoneylinePair(
      [
        { name: 'Home', price: -150 },
        { name: 'Away', price: 130 },
      ],
      game,
      'Pinnacle',
      ts,
      'e1',
      resolve
    );
    expect(ml.candidates).toHaveLength(2);

    expect(
      normalizeMoneylinePair(
        [
          { name: 'Home', price: -150 },
          { name: 'Unknown', price: 130 },
        ],
        game,
        'Pinnacle',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(0);

    // 3 moneyline outcomes rejected
    expect(
      normalizeMoneylinePair(
        [
          { name: 'Home', price: -150 },
          { name: 'Away', price: 130 },
          { name: 'Extra', price: 100 },
        ],
        game,
        'Pinnacle',
        ts,
        'e1',
        resolve
      ).candidates
    ).toHaveLength(0);

    // duplicate ML team rejected
    expect(
      normalizeMoneylinePair(
        [
          { name: 'Home', price: -150 },
          { name: 'Home', price: 130 },
        ],
        game,
        'Pinnacle',
        ts,
        'e1',
        resolve
      ).rejected[0].reason
    ).toMatch(/duplicate team/i);
  });

  it('dedupe identical collapses; conflicting fingerprints block; existing reconcile', () => {
    const ts = new Date('2026-08-28T12:00:00.000Z');
    const base: CandidateMarketLine = {
      gameId: 'g1',
      season: 2026,
      week: 1,
      lineType: 'total',
      lineValue: 45,
      closingLine: 45,
      bookName: 'DraftKings',
      timestamp: ts,
      source: 'oddsapi',
      teamId: null,
    };
    const dedup = dedupeCandidates([base, { ...base }]);
    expect(dedup.unique).toHaveLength(1);
    expect(dedup.duplicateCandidateCount).toBe(1);

    const conflict = dedupeCandidates([
      base,
      { ...base, lineValue: 46, closingLine: 46 },
    ]);
    expect(conflict.fingerprintCollisions.length).toBe(1);

    const rec = reconcileWithExisting([base], [
      {
        gameId: 'g1',
        lineType: 'total',
        bookName: 'DraftKings',
        timestamp: ts,
        teamId: null,
        lineValue: 45,
        closingLine: 45,
      },
    ]);
    expect(rec.existingIdentical).toBe(1);
    expect(rec.proposedInsert).toHaveLength(0);

    const coll = reconcileWithExisting([base], [
      {
        gameId: 'g1',
        lineType: 'total',
        bookName: 'DraftKings',
        timestamp: ts,
        teamId: null,
        lineValue: 47,
        closingLine: 47,
      },
    ]);
    expect(coll.existingCollisions.length).toBe(1);
    expect(fingerprintKey(base)).toContain('|NULL');
  });

  it('buildLiveOddsPlan: PREVIEW planning; COMMIT gates; unresolved expected blocks', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const ts = '2026-08-28T15:00:00.000Z';
    const event: ProviderEvent = {
      id: 'evt1',
      home_team: 'Alabama',
      away_team: 'Georgia',
      commence_time: WK1_DATE,
      bookmakers: [
        {
          title: 'DraftKings',
          last_update: ts,
          markets: [
            {
              key: 'spreads',
              outcomes: [
                { name: 'Alabama', point: -3.5 },
                { name: 'Georgia', point: 3.5 },
              ],
            },
            {
              key: 'totals',
              outcomes: [
                { name: 'Over', point: 52 },
                { name: 'Under', point: 52 },
              ],
            },
            {
              key: 'h2h',
              outcomes: [
                { name: 'Alabama', price: -160 },
                { name: 'Georgia', price: 140 },
              ],
            },
          ],
        },
      ],
    };

    const preview = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [event],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '3',
        requestsUsed: '10',
        requestsRemaining: '19990',
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(preview.previewConsumesOddsApiCredits).toBe(true);
    expect(preview.previewDbReadOnly).toBe(true);
    expect(preview.appendOnly).toBe(true);
    expect(preview.productionOddsWriteAuthorizedByThisPhase).toBe(false);
    expect(preview.writeSafe).toBe(true);
    expect(preview.proposedInsert.length).toBeGreaterThan(0);
    expect(preview.coverage.gamesWithAnyOdds).toContain(games[0].gameId);
    expect(preview.coverage.gamesWithoutAnyOdds.length).toBe(50);

    const blockedCommit = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: '',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [event],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '3',
        requestsUsed: '10',
        requestsRemaining: '19990',
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(blockedCommit.writeSafe).toBe(false);
    expect(commitEligible(blockedCommit)).toBe(false);

    const commit = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'COMMIT',
      confirmation: 'WRITE_2026_WEEK_1_ODDS',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [event],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '2',
        requestsUsed: '10',
        requestsRemaining: '19990',
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(commit.writeSafe).toBe(true);
    expect(commitEligible(commit)).toBe(true);

    const unresolvedPlan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        {
          home_team: 'Alabama',
          away_team: 'Mystery FCS Alias Gap',
          commence_time: WK1_DATE,
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(unresolvedPlan.eventCounts.unresolved_expected_fbs).toBe(1);
    expect(unresolvedPlan.writeSafe).toBe(false);
  });

  it('final audit report: PREVIEW vs successful COMMIT vs tx failure vs verify failure', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const ts = new Date('2026-08-28T15:00:00.000Z');
    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        {
          home_team: 'Alabama',
          away_team: 'Georgia',
          commence_time: WK1_DATE,
          bookmakers: [
            {
              title: 'DraftKings',
              last_update: ts.toISOString(),
              markets: [
                {
                  key: 'totals',
                  outcomes: [
                    { name: 'Over', point: 50 },
                    { name: 'Under', point: 50 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });

    const previewExec = buildPreviewExecution(plan.proposedInsert.length);
    const previewReport = finalizeLiveOddsReport({
      plan,
      execution: previewExec,
      verification: null,
    });
    expect(previewReport.execution.mutationsInvoked).toBe(false);
    expect(previewReport.execution.marketLinePersistenceInvoked).toBe(false);
    expect(previewReport.execution.commitAttempted).toBe(false);
    expect(previewReport.verification).toBeNull();
    expect(previewReport.productionOddsWriteAuthorizedByThisPhase).toBe(false);

    const inserts = plan.proposedInsert;
    const createManyCount = inserts.length;
    const afterRows = [
      ...inserts.map((c) => ({
        gameId: c.gameId,
        lineType: c.lineType,
        bookName: c.bookName,
        timestamp: c.timestamp,
        teamId: c.teamId,
        lineValue: c.lineValue,
        closingLine: c.closingLine,
      })),
      // preexisting unrelated row must not satisfy verification alone
      {
        gameId: games[1].gameId,
        lineType: 'total',
        bookName: 'FanDuel',
        timestamp: ts,
        teamId: null,
        lineValue: 99,
        closingLine: 99,
      },
    ];
    const verification = verifyInsertedFingerprints({
      expectedInserts: inserts,
      createManyCount,
      afterRows,
    });
    expect(verification.ok).toBe(true);
    expect(verification.createManyCount).toBe(createManyCount);
    expect(verification.insertedFingerprintsFound).toHaveLength(inserts.length);

    const okExec = buildSuccessfulCommitExecution({
      proposedBeforeTransaction: inserts.length,
      stillNewAtTransaction: inserts.length,
      createManyCount,
      postWriteVerificationSucceeded: true,
    });
    const okReport = finalizeLiveOddsReport({
      plan: { ...plan, mode: 'COMMIT' },
      execution: okExec,
      verification,
    });
    expect(okReport.execution.mutationsInvoked).toBe(true);
    expect(okReport.execution.marketLinePersistenceInvoked).toBe(true);
    expect(okReport.execution.commitSucceeded).toBe(true);
    expect(okReport.execution.postWriteVerificationSucceeded).toBe(true);
    expect(okReport.verification?.createManyCount).toBe(createManyCount);

    const txFail = buildFailedCommitExecution({
      proposedBeforeTransaction: inserts.length,
      transactionStarted: true,
      error: 'COMMIT abort: fingerprint collision',
    });
    const txReport = finalizeLiveOddsReport({
      plan: { ...plan, mode: 'COMMIT' },
      execution: txFail,
      verification: null,
    });
    expect(txReport.execution.commitSucceeded).toBe(false);
    expect(txReport.execution.mutationsInvoked).toBe(false);
    expect(txReport.execution.marketLinePersistenceInvoked).toBe(false);

    const verifyFail = verifyInsertedFingerprints({
      expectedInserts: inserts,
      createManyCount: inserts.length,
      afterRows: afterRows.slice(1), // missing expected insert; only unrelated remains
    });
    expect(verifyFail.ok).toBe(false);
    expect(verifyFail.missingInsertedFingerprints.length).toBeGreaterThan(0);

    const persistButVerifyFail = buildSuccessfulCommitExecution({
      proposedBeforeTransaction: inserts.length,
      stillNewAtTransaction: inserts.length,
      createManyCount: inserts.length,
      postWriteVerificationSucceeded: false,
      error: 'post-write verification failed',
    });
    const pvReport = finalizeLiveOddsReport({
      plan: { ...plan, mode: 'COMMIT' },
      execution: persistButVerifyFail,
      verification: verifyFail,
    });
    expect(pvReport.execution.marketLinePersistenceInvoked).toBe(true);
    expect(pvReport.execution.commitSucceeded).toBe(true);
    expect(pvReport.execution.postWriteVerificationSucceeded).toBe(false);

    // Verification-read exception after commit → persistence still true
    const readFailExec = buildCommittedVerificationFailureExecution({
      proposedBeforeTransaction: inserts.length,
      stillNewAtTransaction: inserts.length,
      createManyCount: inserts.length,
      error: 'post-write verification read/error: connection reset',
    });
    const readFailReport = finalizeLiveOddsReport({
      plan: { ...plan, mode: 'COMMIT' },
      execution: readFailExec,
      verification: null,
    });
    expect(readFailReport.execution.mutationsInvoked).toBe(true);
    expect(readFailReport.execution.marketLinePersistenceInvoked).toBe(true);
    expect(readFailReport.execution.commitSucceeded).toBe(true);
    expect(readFailReport.execution.postWriteVerificationSucceeded).toBe(false);
    expect(readFailReport.verification).toBeNull();

    // createManyCount mismatch is a failure
    const countMismatch = verifyInsertedFingerprints({
      expectedInserts: inserts,
      createManyCount: inserts.length + 1,
      afterRows,
    });
    expect(countMismatch.ok).toBe(false);
    expect(countMismatch.reasons.some((r) => /createManyCount/.test(r))).toBe(
      true
    );

    // In-transaction count assert throws (rollback path)
    expect(() => assertCreateManyCountMatches(3, 2)).toThrow(
      /createMany count 2 != expected 3/
    );
    expect(() => assertCreateManyCountMatches(2, 2)).not.toThrow();
  });

  it('CLI/workflow/source guards: live endpoint, truthful summary, no wipe', () => {
    const adapter = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/adapters/OddsApiAdapter.ts'),
      'utf8'
    );
    expect(adapter).toContain('fetchLiveNcaafOddsSnapshot');
    expect(adapter).toContain('/sports/americanfootball_ncaaf/odds');
    expect(adapter).toContain("endpoint: 'live'");
    expect(adapter).toContain('fetchHistoricalOdds');

    const cli = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/write-live-odds-2026.ts'),
      'utf8'
    );
    expect(cli).toContain('fetchLiveNcaafOddsSnapshot');
    expect(cli).toContain('createResult.count');
    expect(cli).toContain('assertCreateManyCountMatches');
    expect(cli).toContain('verifyInsertedFingerprints');
    expect(cli).toContain('buildCommittedVerificationFailureExecution');
    expect(cli).toContain('finalizeLiveOddsReport');
    expect(cli).toContain('date: true');
    expect(cli).not.toMatch(/\.deleteMany\s*\(/);
    expect(cli).not.toMatch(/seed-ratings\.js|seed-ratings\.ts|runRatings/);
    expect(cli).not.toMatch(/\.updateMany\s*\(/);
    expect(cli).not.toMatch(/\.upsert\s*\(/);
    // Count check must occur before transaction return
    const createIdx = cli.indexOf('assertCreateManyCountMatches');
    const returnIdx = cli.indexOf('createManyCount: createResult.count');
    expect(createIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(createIdx);
    expect(cli).toContain('PREVIEW IS DATABASE READ-ONLY BUT DOES CONSUME ODDS API CREDITS');
    expect(cli).not.toMatch(/CFBD_API_KEY/);
    expect(cli).not.toMatch(/SGO_API_KEY/);
    expect(cli).not.toMatch(/GameLookup/);
    expect(cli).not.toMatch(/lookupGame/);

    const pure = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/src/odds/live-odds-2026.ts'),
      'utf8'
    );
    expect(pure).not.toMatch(/\.deleteMany\s*\(/);
    expect(pure).toContain('unresolved_expected_fbs');
    expect(pure).toContain('week_mismatch');
    expect(pure).toContain('KICKOFF_MATCH_TOLERANCE_MS');

    const wf = fs.readFileSync(
      path.join(ROOT, '.github/workflows/write-live-odds-2026.yml'),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toContain('provider call target: exactly 1 per successful execution');
    expect(wf).toContain('actual providerCalls: see audit artifact');
    expect(wf).not.toMatch(/providerCalls: 1 \(live endpoint\)/);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/GITHUB_ENV/);

    const { spawnSync } = require('child_process');
    const invScript = path.join(ROOT, 'scripts/inventory-workflows-2026.py');
    const py = `
import importlib.util
spec = importlib.util.spec_from_file_location('inv', r'${invScript.replace(/\\/g, '\\\\')}')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
text = open(r'${path.join(ROOT, '.github/workflows/write-live-odds-2026.yml').replace(/\\/g, '\\\\')}', encoding='utf-8').read()
print('true' if mod.has_direct_inputs_in_run(text) else 'false')
`;
    const pyResult = spawnSync('python', ['-c', py], { encoding: 'utf8' });
    expect(pyResult.status).toBe(0);
    expect(pyResult.stdout.trim()).toBe('false');

    const hybrid = fs.readFileSync(
      path.join(ROOT, 'apps/web/lib/core-v2-spread.ts'),
      'utf8'
    );
    expect(hybrid).toMatch(/V1_WEIGHT\s*=\s*0\.7/);
    expect(hybrid).toMatch(/HFA\s*=\s*2\.5/);
  });

  it('TeamResolver exposes fuzzy provenance via resolveTeamDetailed', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/adapters/TeamResolver.ts'),
      'utf8'
    );
    expect(src).toContain('resolveTeamDetailed');
    expect(src).toContain("method: 'fuzzy'");
    expect(src).toContain('TeamResolveResult');
  });

  it('invalid bookmaker timestamp rejected', () => {
    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        {
          home_team: 'Alabama',
          away_team: 'Georgia',
          commence_time: WK1_DATE,
          bookmakers: [
            {
              title: 'DraftKings',
              last_update: 'not-a-date',
              markets: [
                {
                  key: 'spreads',
                  outcomes: [
                    { name: 'Alabama', point: -3 },
                    { name: 'Georgia', point: 3 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolveMap({
        Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
        Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
      }),
    });
    expect(plan.rejectedSnapshots.some((r) => /last_update/i.test(r.reason))).toBe(
      true
    );
    expect(plan.proposedInsert).toHaveLength(0);
  });

  it('CLI transaction re-reads before createMany; exact createMany count', () => {
    const cli = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/write-live-odds-2026.ts'),
      'utf8'
    );
    expect(cli).toContain('$transaction');
    expect(cli).toContain('freshExisting');
    expect(cli).toContain('createResult.count');
    expect(cli).toContain('createMany');
    expect(cli).not.toMatch(/return toInsert\.length/);
    expect(cli).not.toMatch(/prisma\.bet\./i);
    expect(cli).not.toMatch(/teamSeasonRating/i);
    expect(cli).not.toMatch(/teamUnitGrade/i);
  });

  it('live snapshot forces markets/region; no historical URL in snapshot method', () => {
    const adapter = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/adapters/OddsApiAdapter.ts'),
      'utf8'
    );
    const start = adapter.indexOf('async fetchLiveNcaafOddsSnapshot');
    const end = adapter.indexOf('private async fetchHistoricalOdds');
    const method = adapter.slice(start, end);
    expect(method).toContain("markets = 'h2h,spreads,totals'");
    expect(method).toContain("region = 'us'");
    expect(method).toContain('/sports/americanfootball_ncaaf/odds');
    expect(method).not.toContain('/historical/');
    expect(method).not.toMatch(/\bretry\b|\bretries\b/i);
    expect(method).toContain('x-requests-last');
    expect(method).toContain('providerCalls: 1');
  });

  it('coverage helper still lists games without odds', () => {
    const cov = buildCoverage({
      requestedWeekGames: games,
      candidates: [],
    });
    expect(cov.gamesWithoutAnyOdds).toHaveLength(51);
  });

  it('MAX_ABS_SPREAD is 100 (production 50.5–51 accepted)', () => {
    expect(MAX_ABS_SPREAD).toBe(100);
  });

  it('production PREVIEW 33186871080 replay classifications', () => {
    // Deterministic IDs matching production alias targets
    const ndsu = 'north-dakota-state';
    const jax = 'jacksonville-state';
    const sac = 'sacramento-state';
    const nmsu = 'new-mexico-state';
    const alabama = 'alabama';
    const ecu = 'east-carolina';
    const cal = 'california';
    const ucla = 'ucla';
    const fbs = new Set([
      ...ids,
      ndsu,
      jax,
      sac,
      nmsu,
      alabama,
      ecu,
      cal,
      ucla,
    ]);

    const resolve = resolveMap({
      'North Dakota State Bison': { teamId: ndsu, method: 'alias' },
      'Jacksonville State Gamecocks': { teamId: jax, method: 'alias' },
      'Sacramento State Hornets': { teamId: sac, method: 'alias' },
      'New Mexico State Aggies': { teamId: nmsu, method: 'alias' },
      'Alabama Crimson Tide': { teamId: alabama, method: 'alias' },
      'East Carolina Pirates': { teamId: ecu, method: 'alias' },
      'California Golden Bears': { teamId: cal, method: 'alias' },
      'UCLA Bruins': { teamId: ucla, method: 'alias' },
    });

    const wk1Games: ScheduledGameRow[] = [
      {
        gameId: '2026-wk1-ndsu-jax',
        season: 2026,
        week: 1,
        homeTeamId: ndsu,
        awayTeamId: jax,
        date: '2026-08-29T21:30:00.000Z',
      },
      {
        gameId: '2026-wk1-alabama-ecu',
        season: 2026,
        week: 1,
        homeTeamId: alabama,
        awayTeamId: ecu,
        date: '2026-09-05T16:00:00.000Z',
      },
      {
        gameId: '2026-wk1-cal-ucla',
        season: 2026,
        week: 1,
        homeTeamId: cal,
        awayTeamId: ucla,
        date: '2026-09-06T02:30:00.000Z',
      },
      // Pad to 51 with synthetic FBS-vs-FBS so schedule gate can pass in plan tests if needed
      ...games.slice(0, 48).map((g, i) => ({
        ...g,
        gameId: `pad-${i}`,
        homeTeamId: ids[i * 2],
        awayTeamId: ids[i * 2 + 1],
      })),
    ];

    // 1. NDSU vs Jax State Week1 tracked
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'North Dakota State Bison',
          away_team: 'Jacksonville State Gamecocks',
          commence_time: '2026-08-29T21:30:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('matched_requested_week');

    // 2. NDSU vs Fordham — no near FBS game
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'North Dakota State Bison',
          away_team: 'Fordham Rams',
          commence_time: '2026-09-05T19:30:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('out_of_scope_fbs_fcs');

    // 3. Sac State vs MVSU
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'Sacramento State Hornets',
          away_team: 'Mississippi Valley State Delta Devils',
          commence_time: '2026-09-06T02:00:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('out_of_scope_fbs_fcs');

    // 4. Jax State vs EKU
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'Jacksonville State Gamecocks',
          away_team: 'Eastern Kentucky Colonels',
          commence_time: '2026-09-05T23:00:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('out_of_scope_fbs_fcs');

    // 5. NMSU vs Mercyhurst
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'New Mexico State Aggies',
          away_team: 'Mercyhurst Lakers',
          commence_time: '2026-09-06T01:00:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('out_of_scope_fbs_fcs');

    // 6. Alabama vs ECU
    expect(
      classifyProviderEvent({
        event: {
          home_team: 'Alabama Crimson Tide',
          away_team: 'East Carolina Pirates',
          commence_time: '2026-09-05T16:00:00.000Z',
        },
        week: 1,
        fbsTeamIds: fbs,
        requestedWeekGames: wk1Games,
        seasonGames: wk1Games,
        resolveTeam: resolve,
      }).classification
    ).toBe('matched_requested_week');

    // 7. Cal vs UCLA — alias (not fuzzy) path in classification
    const calUcla = classifyProviderEvent({
      event: {
        home_team: 'California Golden Bears',
        away_team: 'UCLA Bruins',
        commence_time: '2026-09-06T02:30:00.000Z',
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: wk1Games,
      seasonGames: wk1Games,
      resolveTeam: resolve,
    });
    expect(calUcla.classification).toBe('matched_requested_week');
    expect(calUcla.homeMethod).toBe('alias');
    expect(calUcla.awayMethod).toBe('alias');

    // 8. expected FBS opponent genuinely missing — block
    const missingOpp = classifyProviderEvent({
      event: {
        home_team: 'Alabama Crimson Tide',
        away_team: 'Still Missing Alias Opponent',
        commence_time: '2026-09-05T16:00:00.000Z',
      },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: wk1Games,
      seasonGames: wk1Games,
      resolveTeam: resolve,
    });
    expect(missingOpp.classification).toBe('unresolved_expected_fbs');

    const planFbsIds = [
      ...ids.slice(0, AUTHORITATIVE_FBS_COUNT - 4),
      ndsu,
      jax,
      sac,
      nmsu,
    ];
    const planFcs = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: planFbsIds,
      requestedWeekGames: games,
      seasonGames: [...games, ...wk1Games],
      providerEvents: [
        {
          home_team: 'North Dakota State Bison',
          away_team: 'Fordham Rams',
          commence_time: '2026-09-05T19:30:00.000Z',
          bookmakers: [],
        },
        {
          home_team: 'Jacksonville State Gamecocks',
          away_team: 'Eastern Kentucky Colonels',
          commence_time: '2026-09-05T23:00:00.000Z',
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(planFcs.eventCounts.out_of_scope_fbs_fcs).toBe(2);
    expect(planFcs.eventCounts.unresolved_expected_fbs).toBe(0);
    expect(planFcs.writeSafe).toBe(true);
  });
});

describe('2C-2J-2A production Odds aliases from team_aliases.yml', () => {
  const OBSERVED: Array<{ name: string; teamId: string }> = [
    { name: 'Jacksonville State Gamecocks', teamId: 'jacksonville-state' },
    { name: 'Florida State Seminoles', teamId: 'florida-state' },
    { name: 'New Mexico State Aggies', teamId: 'new-mexico-state' },
    { name: 'Hawaii Rainbow Warriors', teamId: 'hawai-i' },
    { name: 'Akron Zips', teamId: 'akron' },
    { name: 'Georgia State Panthers', teamId: 'georgia-state' },
    { name: 'East Carolina Pirates', teamId: 'east-carolina' },
    { name: 'Army Black Knights', teamId: 'army' },
    { name: 'Coastal Carolina Chanticleers', teamId: 'coastal-carolina' },
    { name: 'Oregon State Beavers', teamId: 'oregon-state' },
    { name: 'Indiana Hoosiers', teamId: 'indiana' },
    { name: 'Liberty Flames', teamId: 'liberty' },
    { name: 'Marshall Thundering Herd', teamId: 'marshall' },
    { name: 'Florida International Panthers', teamId: 'florida-international' },
    { name: 'New Mexico Lobos', teamId: 'new-mexico' },
    { name: 'Western Kentucky Hilltoppers', teamId: 'western-kentucky' },
    { name: 'California Golden Bears', teamId: 'california' },
  ];

  it('every observed production FBS provider name resolves via exact alias (not fuzzy)', () => {
    const yaml = require('js-yaml') as typeof import('js-yaml');
    const aliasDoc = yaml.load(
      fs.readFileSync(
        path.join(ROOT, 'apps/jobs/config/team_aliases.yml'),
        'utf8'
      )
    ) as { aliases: Record<string, string> };

    const fbsSlugs = new Set(
      JSON.parse(
        fs.readFileSync(
          path.join(ROOT, 'apps/jobs/config/fbs_slugs.json'),
          'utf8'
        )
      ) as string[]
    );
    const hfa = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'apps/web/lib/data/core_v1_hfa_config.json'),
        'utf8'
      )
    ) as { teamAdjustments?: Record<string, unknown> };
    const authoritative = new Set<string>([
      ...fbsSlugs,
      ...Object.keys(hfa.teamAdjustments || {}),
    ]);

    for (const { name, teamId } of OBSERVED) {
      expect(aliasDoc.aliases[name]).toBe(teamId);
      expect(authoritative.has(teamId)).toBe(true);
    }

    const { TeamResolver } = require('../adapters/TeamResolver') as typeof import('../adapters/TeamResolver');
    const resolver = new TeamResolver();

    for (const { name, teamId } of OBSERVED) {
      const r = resolver.resolveTeamDetailed(name, 'NCAAF');
      expect(r.teamId).toBe(teamId);
      expect(r.method).toBe('alias');
      expect(r.method).not.toBe('fuzzy');
    }

    const cal = resolver.resolveTeamDetailed('California Golden Bears', 'NCAAF');
    expect(cal.teamId).toBe('california');
    expect(cal.method).toBe('alias');
  });
});

describe('Week 1 Maryland Terrapins alias repair (Hampton FCS nonblocking)', () => {
  it('"Maryland Terrapins" and "Maryland" resolve to canonical FBS teamId maryland', () => {
    const yaml = require('js-yaml') as typeof import('js-yaml');
    const aliasDoc = yaml.load(
      fs.readFileSync(
        path.join(ROOT, 'apps/jobs/config/team_aliases.yml'),
        'utf8'
      )
    ) as { aliases: Record<string, string> };

    expect(aliasDoc.aliases['Maryland']).toBe('maryland');
    expect(aliasDoc.aliases['Maryland Terrapins']).toBe('maryland');
    expect(aliasDoc.aliases['Hampton']).toBeUndefined();
    expect(aliasDoc.aliases['Hampton Pirates']).toBeUndefined();

    const fbsSlugs = new Set(
      JSON.parse(
        fs.readFileSync(
          path.join(ROOT, 'apps/jobs/config/fbs_slugs.json'),
          'utf8'
        )
      ) as string[]
    );
    expect(fbsSlugs.has('maryland')).toBe(true);
    expect(fbsSlugs.has('hampton')).toBe(false);

    const { TeamResolver } = require('../adapters/TeamResolver') as typeof import('../adapters/TeamResolver');
    const resolver = new TeamResolver();
    const maryland = resolver.resolveTeamDetailed('Maryland Terrapins', 'NCAAF');
    expect(maryland.teamId).toBe('maryland');
    expect(maryland.method).toBe('alias');
    expect(maryland.method).not.toBe('fuzzy');

    const plain = resolver.resolveTeamDetailed('Maryland', 'NCAAF');
    expect(plain.teamId).toBe('maryland');
    expect(plain.method).toBe('alias');

    const hampton = resolver.resolveTeamDetailed('Hampton Pirates', 'NCAAF');
    expect(hampton.teamId).toBeNull();
  });

  it('Maryland Terrapins vs Hampton Pirates with no nearby Maryland FBS-vs-FBS Game is out_of_scope_fbs_fcs', () => {
    const { TeamResolver } = require('../adapters/TeamResolver') as typeof import('../adapters/TeamResolver');
    const resolver = new TeamResolver();
    const resolveTeam = (name: string) =>
      resolver.resolveTeamDetailed(name, 'NCAAF');

    const ids = fbsIds();
    ids[134] = 'maryland';
    const games = week1Games(ids);
    const fbsTeamIds = new Set(ids);

    const diag = classifyProviderEvent({
      event: {
        home_team: 'Maryland Terrapins',
        away_team: 'Hampton Pirates',
        commence_time: WK1_DATE,
      },
      week: 1,
      fbsTeamIds,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam,
    });
    expect(diag.homeTeamId).toBe('maryland');
    expect(diag.awayTeamId).toBeNull();
    expect(diag.classification).toBe('out_of_scope_fbs_fcs');
    expect(diag.classification).not.toBe('unresolved_expected_fbs');
    expect(diag.detail).toMatch(/no authoritative FBS-vs-FBS Game/i);

    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        {
          home_team: 'Maryland Terrapins',
          away_team: 'Hampton Pirates',
          commence_time: WK1_DATE,
          bookmakers: [],
        },
      ],
      providerCalls: 1,
      providerUsage: {
        requestsLast: '1',
        requestsUsed: null,
        requestsRemaining: null,
      },
      existingRows: [],
      resolveTeam,
    });
    expect(plan.eventCounts.out_of_scope_fbs_fcs).toBe(1);
    expect(plan.eventCounts.unresolved_expected_fbs).toBe(0);
    expect(plan.writeSafe).toBe(true);
  });
});
