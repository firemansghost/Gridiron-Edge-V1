/**
 * Phase 2C-2J-2 — Guarded 2026 Live Odds pure tests (no provider, no production DB).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AUTHORITATIVE_FBS_COUNT,
  LIVE_ODDS_MARKETS,
  LIVE_ODDS_REGION,
  LIVE_ODDS_SEASON,
  LIVE_ODDS_SOURCE,
  MAX_EXPECTED_REQUEST_CREDITS,
  WEEK1_GAME_COUNT,
  buildCoverage,
  buildLiveOddsPlan,
  commitEligible,
  dedupeCandidates,
  evaluateProviderCredits,
  expectedWriteConfirmation,
  fingerprintKey,
  normalizeMoneylinePair,
  normalizeSpreadPair,
  normalizeTotalPair,
  reconcileWithExisting,
  validateAuthoritativeSchedule,
  validateLiveOddsInputs,
  classifyProviderEvent,
  type CandidateMarketLine,
  type ProviderEvent,
  type ScheduledGameRow,
} from '../src/odds/live-odds-2026';

const ROOT = path.resolve(__dirname, '../../..');

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
    });
  }
  return games;
}

function resolveMap(map: Record<string, { teamId: string; method: any }>) {
  return (name: string) =>
    map[name] || { teamId: null, method: null };
}

describe('2C-2J-2 live-odds-2026 guards', () => {
  const ids = fbsIds();
  const games = week1Games(ids);

  it('season exactly 2026; week validated; PREVIEW default confirmation phrase', () => {
    expect(LIVE_ODDS_SEASON).toBe(2026);
    expect(expectedWriteConfirmation(1)).toBe('WRITE_2026_WEEK_1_ODDS');
    expect(expectedWriteConfirmation(12)).toBe('WRITE_2026_WEEK_12_ODDS');
    const badSeason = validateLiveOddsInputs({
      season: 2025,
      week: 1,
      mode: 'PREVIEW',
    });
    expect(badSeason.ok).toBe(false);
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
    const bad = validateAuthoritativeSchedule({
      week: 1,
      fbsTeamIds: ids.slice(0, 100),
      games,
    });
    expect(bad.ok).toBe(false);
    const short = validateAuthoritativeSchedule({
      week: 1,
      fbsTeamIds: ids,
      games: games.slice(0, 50),
    });
    expect(short.ok).toBe(false);
  });

  it('classifies FBS-FCS / later-week / unmatched / ambiguous / fuzzy', () => {
    const resolve = resolveMap({
      Alabama: { teamId: ids[0], method: 'alias' },
      Georgia: { teamId: ids[1], method: 'alias' },
      'North Dakota State': { teamId: 'north-dakota-state', method: 'alias' },
      FuzzyU: { teamId: ids[2], method: 'fuzzy' },
      FuzzyState: { teamId: ids[3], method: 'fuzzy' },
    });
    const fbs = new Set(ids);

    const fcs = classifyProviderEvent({
      event: { home_team: 'Alabama', away_team: 'North Dakota State' },
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
    };
    const resolveLater = resolveMap({
      HomeLater: { teamId: ids[130], method: 'alias' },
      AwayLater: { teamId: ids[131], method: 'alias' },
    });
    const later = classifyProviderEvent({
      event: { home_team: 'HomeLater', away_team: 'AwayLater' },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: [...games, laterGame],
      resolveTeam: resolveLater,
    });
    expect(later.classification).toBe('out_of_requested_week');

    const unmatched = classifyProviderEvent({
      event: { home_team: 'Alabama', away_team: 'Georgia' },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    // ids[0]/ids[1] is game 1 — actually matched
    expect(['matched_requested_week', 'unmatched_both_fbs']).toContain(
      unmatched.classification
    );

    const resolveUnmatched = resolveMap({
      A: { teamId: ids[132], method: 'alias' },
      B: { teamId: ids[133], method: 'alias' },
    });
    const um = classifyProviderEvent({
      event: { home_team: 'A', away_team: 'B' },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolveUnmatched,
    });
    expect(um.classification).toBe('unmatched_both_fbs');

    const dupGames = [
      games[0],
      { ...games[0], gameId: 'dup-2' },
    ];
    const amb = classifyProviderEvent({
      event: { home_team: 'Alabama', away_team: 'Georgia' },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: dupGames,
      seasonGames: dupGames,
      resolveTeam: resolve,
    });
    expect(amb.classification).toBe('ambiguous');

    const fuzzy = classifyProviderEvent({
      event: { home_team: 'FuzzyU', away_team: 'FuzzyState' },
      week: 1,
      fbsTeamIds: fbs,
      requestedWeekGames: [
        {
          gameId: 'fz',
          season: 2026,
          week: 1,
          homeTeamId: ids[2],
          awayTeamId: ids[3],
        },
      ],
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(fuzzy.classification).toBe('fuzzy_required');
  });

  it('deterministic alias resolution accepted as matched_requested_week', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const m = classifyProviderEvent({
      event: { home_team: 'Alabama', away_team: 'Georgia' },
      week: 1,
      fbsTeamIds: new Set(ids),
      requestedWeekGames: games,
      seasonGames: games,
      resolveTeam: resolve,
    });
    expect(m.classification).toBe('matched_requested_week');
    expect(m.gameId).toBe(games[0].gameId);
  });

  it('spread/total/moneyline normalization rules', () => {
    const game = games[0];
    const ts = new Date('2026-08-28T12:00:00.000Z');
    const resolve = resolveMap({
      Home: { teamId: game.homeTeamId, method: 'alias' },
      Away: { teamId: game.awayTeamId, method: 'alias' },
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

    const badSpread = normalizeSpreadPair(
      [
        { name: 'Home', point: -60 },
        { name: 'Away', point: 60 },
      ],
      game,
      'DraftKings',
      ts,
      'e1',
      resolve
    );
    expect(badSpread.candidates).toHaveLength(0);

    const malformed = normalizeSpreadPair(
      [{ name: 'Home', point: -7 }],
      game,
      'DraftKings',
      ts,
      'e1',
      resolve
    );
    expect(malformed.rejected[0].reason).toMatch(/two team/);

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
    expect(totals.candidates[0].lineType).toBe('total');

    const disagree = normalizeTotalPair(
      [
        { name: 'Over', point: 48.5 },
        { name: 'Under', point: 49.5 },
      ],
      game,
      'FanDuel',
      ts
    );
    expect(disagree.candidates).toHaveLength(0);

    const outOfRange = normalizeTotalPair(
      [
        { name: 'Over', point: 150 },
        { name: 'Under', point: 150 },
      ],
      game,
      'FanDuel',
      ts
    );
    expect(outOfRange.candidates).toHaveLength(0);

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

    const badMl = normalizeMoneylinePair(
      [
        { name: 'Home', price: -150 },
        { name: 'Unknown', price: 130 },
      ],
      game,
      'Pinnacle',
      ts,
      'e1',
      resolve
    );
    expect(badMl.candidates).toHaveLength(0);
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

    // NULL-team fingerprint stable
    expect(fingerprintKey(base)).toContain('|NULL');
  });

  it('buildLiveOddsPlan: PREVIEW mutation flags false; COMMIT gates; coverage lists', () => {
    const resolve = resolveMap({
      Alabama: { teamId: games[0].homeTeamId, method: 'alias' },
      Georgia: { teamId: games[0].awayTeamId, method: 'alias' },
    });
    const ts = '2026-08-28T15:00:00.000Z';
    const event: ProviderEvent = {
      id: 'evt1',
      home_team: 'Alabama',
      away_team: 'Georgia',
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
    expect(preview.mutationsInvoked).toBe(false);
    expect(preview.marketLinePersistenceInvoked).toBe(false);
    expect(preview.previewConsumesOddsApiCredits).toBe(true);
    expect(preview.previewDbReadOnly).toBe(true);
    expect(preview.appendOnly).toBe(true);
    expect(preview.productionOddsWriteAuthorizedByThisPhase).toBe(false);
    expect(preview.betsWriteAuthorized).toBe(false);
    expect(preview.ratingsWriteAuthorized).toBe(false);
    expect(preview.writeSafe).toBe(true);
    expect(preview.proposedInsert.length).toBeGreaterThan(0);
    expect(preview.coverage.gamesWithAnyOdds).toContain(games[0].gameId);
    expect(preview.coverage.gamesWithoutAnyOdds.length).toBe(50);

    const blockedCommit = buildLiveOddsPlan({
      ...{
        season: 2026,
        week: 1,
        mode: 'COMMIT' as const,
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
      },
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
  });

  it('unmatched both-FBS and fuzzy block writeSafe; FCS/later-week do not alone', () => {
    const resolve = resolveMap({
      A: { teamId: ids[120], method: 'alias' },
      B: { teamId: ids[121], method: 'alias' },
      C: { teamId: ids[0], method: 'alias' },
      FCS: { teamId: 'fcs-x', method: 'alias' },
    });
    const plan = buildLiveOddsPlan({
      season: 2026,
      week: 1,
      mode: 'PREVIEW',
      fbsTeamIds: ids,
      requestedWeekGames: games,
      seasonGames: games,
      providerEvents: [
        { home_team: 'A', away_team: 'B', bookmakers: [] },
        { home_team: 'C', away_team: 'FCS', bookmakers: [] },
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
    expect(plan.eventCounts.unmatched_both_fbs).toBe(1);
    expect(plan.eventCounts.out_of_scope_fbs_fcs).toBe(1);
    expect(plan.writeSafe).toBe(false);
  });

  it('CLI/workflow/source guards: live endpoint, no wipe, no ratings/bets, PR60', () => {
    const adapter = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/adapters/OddsApiAdapter.ts'),
      'utf8'
    );
    expect(adapter).toContain('fetchLiveNcaafOddsSnapshot');
    expect(adapter).toContain('/sports/americanfootball_ncaaf/odds');
    expect(adapter).toContain("endpoint: 'live'");
    // historical path still present for legacy
    expect(adapter).toContain('fetchHistoricalOdds');

    const cli = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/write-live-odds-2026.ts'),
      'utf8'
    );
    expect(cli).toContain('fetchLiveNcaafOddsSnapshot');
    expect(cli).not.toMatch(/\.deleteMany\s*\(/);
    expect(cli).not.toMatch(/seed-ratings\.js|seed-ratings\.ts|runRatings/);
    expect(cli).not.toMatch(/\.updateMany\s*\(/);
    expect(cli).toContain('createMany');
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
    expect(pure).not.toMatch(/seed-ratings\.js|runRatings/);

    const wf = fs.readFileSync(
      path.join(ROOT, '.github/workflows/write-live-odds-2026.yml'),
      'utf8'
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    // Prefer inventory helper: env ${{ inputs.* }} is SAFE; run-shell is not.
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
    expect(wf).toContain('INPUT_SEASON');
    expect(wf).toContain('prisma_generate_placeholder');
    expect(wf).toContain('WRITE_2026_WEEK_');
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/GITHUB_ENV/);
    // ODDS only on preflight + execute (not install)
    expect(wf).toContain('ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}');
    expect(wf).not.toMatch(/env:\s*\n\s*DATABASE_URL: \$\{\{ secrets\.DIRECT_URL/ );

    const ingestMinimal = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/ingest-minimal.ts'),
      'utf8'
    );
    expect(ingestMinimal).toContain('deleteMany'); // untouched legacy wipe still exists

    const hybrid = fs.readFileSync(
      path.join(ROOT, 'apps/web/lib/core-v2-spread.ts'),
      'utf8'
    );
    expect(hybrid).toMatch(/V1_WEIGHT\s*=\s*0\.7/);
    expect(hybrid).toMatch(/HFA\s*=\s*2\.5/);
  });

  it('TeamResolver exposes fuzzy provenance via resolveTeamDetailed', () => {
    // Source contract — avoids constructing TeamResolver (loads YAML / may exit).
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/adapters/TeamResolver.ts'),
      'utf8'
    );
    expect(src).toContain('resolveTeamDetailed');
    expect(src).toContain("method: 'fuzzy'");
    expect(src).toContain('TeamResolveResult');
  });

  it('invalid bookmaker timestamp rejected; later-week coverage does not write', () => {
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
      providerUsage: { requestsLast: '1', requestsUsed: null, requestsRemaining: null },
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

  it('later-week events do not alone block; never produce requested-week inserts', () => {
    const laterGame: ScheduledGameRow = {
      gameId: '2026-wk5-g1',
      season: 2026,
      week: 5,
      homeTeamId: ids[130],
      awayTeamId: ids[131],
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
          bookmakers: [
            {
              title: 'DraftKings',
              last_update: '2026-08-28T12:00:00.000Z',
              markets: [
                {
                  key: 'spreads',
                  outcomes: [
                    { name: 'HomeLater', point: -7 },
                    { name: 'AwayLater', point: 7 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      providerCalls: 1,
      providerUsage: { requestsLast: '1', requestsUsed: null, requestsRemaining: null },
      existingRows: [],
      resolveTeam: resolve,
    });
    expect(plan.eventCounts.out_of_requested_week).toBe(1);
    expect(plan.proposedInsert).toHaveLength(0);
    expect(plan.writeSafe).toBe(true);
    expect(plan.candidates.every((c) => c.week === 1)).toBe(true);
  });

  it('CLI transaction re-reads before createMany; no upsert/Bet/Team mutation', () => {
    const cli = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/write-live-odds-2026.ts'),
      'utf8'
    );
    expect(cli).toContain('$transaction');
    expect(cli).toContain('freshExisting');
    expect(cli).toContain('createMany');
    expect(cli).not.toMatch(/\.upsert\s*\(/);
    expect(cli).not.toMatch(/prisma\.bet\./i);
    expect(cli).not.toMatch(/teamSeasonRating/i);
    expect(cli).not.toMatch(/teamUnitGrade/i);
    expect(cli).not.toMatch(/prisma\.game\.(create|update|delete)/i);
    expect(cli).not.toMatch(/prisma\.team\.(create|update|delete)/i);
    expect(cli).toContain('post-write verification');
    expect(cli).toContain('insertedThisRun');
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
    expect(method).not.toMatch(/retry|retries/i);
    expect(method).toContain('x-requests-last');
    expect(method).toContain("providerCalls: 1");
  });
});
