/**
 * Phase 2B — 2026 Week Archive persisted-history truth.
 * Pure helpers + static API/page checks. No provider / DB / workflow execution.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  OFFICIAL_CARD_SOURCE,
  OFFICIAL_CARD_STRATEGY_TAG,
  OfficialCardIntegrityError,
  type OfficialCardBetInput,
} from '@/lib/official-card';
import {
  WEEK_ARCHIVE_AWAITING_GRADING,
  WEEK_ARCHIVE_MIN_SEASON,
  WEEK_ARCHIVE_NO_WAGER_MESSAGE,
  WEEK_ARCHIVE_SOURCE,
  WEEK_ARCHIVE_STRATEGY_TAG,
  buildWeekArchiveBetWhere,
  buildWeekArchiveView,
  parseWeekArchiveSeasonParam,
  parseWeekArchiveWeekParam,
  selectWeekArchiveOfficialRows,
  weekArchiveGamePrismaSelect,
  type WeekArchiveGameInput,
} from '@/lib/week-archive';

const webRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '../../..');

function makeGame(
  id: string,
  names: { away: string; home: string },
  status: WeekArchiveGameInput['status'] = 'scheduled',
  date = '2026-08-29T16:00:00.000Z'
): WeekArchiveGameInput {
  return {
    id,
    season: 2026,
    week: 1,
    date,
    status,
    homeScore: status === 'final' ? 31 : null,
    awayScore: status === 'final' ? 27 : null,
    venue: 'Stadium',
    city: 'Atlanta',
    neutralSite: false,
    homeTeamId: `${id}-home`,
    awayTeamId: `${id}-away`,
    homeTeam: { id: `${id}-home`, name: names.home },
    awayTeam: { id: `${id}-away`, name: names.away },
  };
}

function gameForBet(game: WeekArchiveGameInput): OfficialCardBetInput['game'] {
  return {
    id: game.id,
    season: game.season,
    week: game.week,
    date: game.date,
    status: game.status,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
  };
}

function makeBet(
  game: WeekArchiveGameInput,
  overrides: Partial<OfficialCardBetInput> & Pick<OfficialCardBetInput, 'id' | 'marketType' | 'side'>
): OfficialCardBetInput {
  return {
    id: overrides.id,
    season: 2026,
    week: 1,
    gameId: game.id,
    marketType: overrides.marketType,
    side: overrides.side,
    modelPrice: -4,
    closePrice: -4,
    stake: 100,
    result: null,
    pnl: null,
    clv: null,
    strategyTag: OFFICIAL_CARD_STRATEGY_TAG,
    source: OFFICIAL_CARD_SOURCE,
    notes: null,
    createdAt: '2026-08-28T12:00:00.000Z',
    game: gameForBet(game),
    ...overrides,
  };
}

function buildWeek1ReferenceFixture() {
  const games: WeekArchiveGameInput[] = [];
  const bets: OfficialCardBetInput[] = [];

  for (let i = 1; i <= 51; i += 1) {
    const isNoWager = i === 51;
    const isGradedPair = i <= 7;
    const status = isGradedPair || isNoWager ? 'final' : 'scheduled';
    const names =
      i === 51
        ? { away: 'North Carolina', home: 'TCU' }
        : { away: `Away ${i}`, home: `Home ${i}` };
    games.push(
      makeGame(`g${i}`, names, status, `2026-08-29T${String(10 + (i % 10)).padStart(2, '0')}:00:00.000Z`)
    );
  }

  // Input order must not be the display order.
  games.reverse();

  for (let i = 1; i <= 50; i += 1) {
    const game = games.find((row) => row.id === `g${i}`)!;
    const graded = i <= 7;
    const spreadResult = graded
      ? ((i <= 3 ? 'win' : 'loss') as 'win' | 'loss')
      : null;
    const mlResult = graded
      ? ((i <= 3 ? 'win' : 'loss') as 'win' | 'loss')
      : null;

    bets.push(
      makeBet(game, {
        id: `spread-${i}`,
        marketType: 'spread',
        side: 'away',
        closePrice: i === 1 ? 0 : 6.5,
        modelPrice: 4,
        result: spreadResult,
        pnl: graded ? (i === 7 ? -223.768421 : 0) : null,
        clv: graded ? (i === 7 ? 0 : 0.1) : null,
        notes: 'book=DraftKings; edgePts=2.5; grade=C; model=Core V1',
      })
    );

    if (i <= 48) {
      bets.push(
        makeBet(game, {
          id: `ml-${i}`,
          marketType: 'moneyline',
          side: 'away',
          closePrice: 200,
          modelPrice: 189,
          result: mlResult,
          pnl: graded ? 0 : null,
          clv: graded ? 0 : null,
          notes: 'book=DraftKings; valuePercent=3.1; grade=B; model=Core V1',
        })
      );
    }
  }

  return { games, bets };
}

describe('Phase 2B Week Archive query contract', () => {
  it('locks official archive bets to official_flat_100 / strategy_run for the requested season/week', () => {
    expect(buildWeekArchiveBetWhere(2026, 1)).toEqual({
      season: 2026,
      week: 1,
      strategyTag: 'official_flat_100',
      source: 'strategy_run',
    });
    expect(WEEK_ARCHIVE_STRATEGY_TAG).toBe('official_flat_100');
    expect(WEEK_ARCHIVE_SOURCE).toBe('strategy_run');
    expect(WEEK_ARCHIVE_MIN_SEASON).toBe(2026);
  });

  it('accepts weeks 1–16 and seasons >= 2026 only', () => {
    expect(parseWeekArchiveWeekParam('1')).toBe(1);
    expect(parseWeekArchiveWeekParam('16')).toBe(16);
    expect(parseWeekArchiveWeekParam('0')).toBeNull();
    expect(parseWeekArchiveWeekParam('17')).toBeNull();
    expect(parseWeekArchiveSeasonParam('2026')).toBe(2026);
    expect(parseWeekArchiveSeasonParam('2027')).toBe(2027);
    expect(parseWeekArchiveSeasonParam('2025')).toBeNull();
  });

  it('selects Game fields without market or matchup output relations', () => {
    const select = weekArchiveGamePrismaSelect();
    expect(select).toEqual(
      expect.objectContaining({
        date: true,
        status: true,
        homeScore: true,
        awayScore: true,
        venue: true,
        neutralSite: true,
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      })
    );
    expect(select).not.toHaveProperty('marketLines');
    expect(select).not.toHaveProperty('matchupOutputs');
  });
});

describe('Phase 2B Week Archive game frame', () => {
  it('returns every persisted Game, including the no-wager game', () => {
    const { games, bets } = buildWeek1ReferenceFixture();
    const view = buildWeekArchiveView(games, bets, 2026);
    expect(view.games).toHaveLength(51);
    expect(view.summary.gamesScheduled).toBe(51);
    expect(view.summary.officialGames).toBe(50);
    expect(view.summary.gamesWithoutOfficialWager).toBe(1);
    expect(view.summary.totalBets).toBe(98);

    const noWager = view.games.find((game) => game.gameId === 'g51');
    expect(noWager).toBeDefined();
    expect(noWager?.hasOfficialWager).toBe(false);
    expect(noWager?.awayTeamName).toBe('North Carolina');
    expect(noWager?.homeTeamName).toBe('TCU');
    expect(noWager?.markets).toEqual([]);
  });

  it('sorts games by kickoff ascending', () => {
    const early = makeGame('early', { away: 'A', home: 'B' }, 'scheduled', '2026-08-29T12:00:00.000Z');
    const late = makeGame('late', { away: 'C', home: 'D' }, 'scheduled', '2026-08-30T12:00:00.000Z');
    const view = buildWeekArchiveView([late, early], [], 2026);
    expect(view.games.map((game) => game.gameId)).toEqual(['early', 'late']);
  });
});

describe('Phase 2B Week Archive integrity and filtering', () => {
  it('fails closed on duplicate official game+market rows', () => {
    const game = makeGame('g1', { away: 'Away', home: 'Home' });
    const rows = [
      makeBet(game, { id: 'a', marketType: 'spread', side: 'home' }),
      makeBet(game, { id: 'b', marketType: 'spread', side: 'away' }),
    ];
    expect(() => buildWeekArchiveView([game], rows, 2026)).toThrow(OfficialCardIntegrityError);
    expect(() => buildWeekArchiveView([game], rows, 2026)).toThrow(/duplicate official rows/i);
  });

  it('excludes hybrid and non-strategy_run rows from the canonical archive', () => {
    const game = makeGame('g1', { away: 'Away', home: 'Home' });
    const rows = [
      makeBet(game, { id: 'official', marketType: 'spread', side: 'home' }),
      makeBet(game, { id: 'hybrid', marketType: 'spread', side: 'away', strategyTag: 'hybrid_v2' }),
      makeBet(game, { id: 'manual', marketType: 'moneyline', side: 'home', source: 'manual' }),
    ];
    const selected = selectWeekArchiveOfficialRows(rows, 2026);
    expect(selected.map((row) => row.id)).toEqual(['official']);
    const view = buildWeekArchiveView([game], rows, 2026);
    expect(view.summary.totalBets).toBe(1);
    expect(view.games[0].markets).toHaveLength(1);
  });
});

describe('Phase 2B Week Archive Week 1 metrics', () => {
  it('matches the Week 1 official reference counts and ROI', () => {
    const { games, bets } = buildWeek1ReferenceFixture();
    const view = buildWeekArchiveView(games, bets, 2026);
    expect(view.summary.totalBets).toBe(98);
    expect(view.summary.officialGames).toBe(50);
    expect(view.summary.spreadBets).toBe(50);
    expect(view.summary.moneylineBets).toBe(48);
    expect(view.summary.totalsBets).toBe(0);
    expect(view.summary.gradedBets).toBe(14);
    expect(view.summary.pendingBets).toBe(84);
    expect(view.summary.wins).toBe(6);
    expect(view.summary.losses).toBe(8);
    expect(view.summary.pushes).toBe(0);
    expect(view.summary.gradedStake).toBe(1400);
    expect(view.summary.totalPnL).toBeCloseTo(-223.768421, 6);
    expect(view.summary.roi).toBeCloseTo(-0.159834586, 9);
    expect(view.summary.hitRate).toBeCloseTo(6 / 14, 10);
  });
});

describe('Phase 2B Week Archive persisted truth', () => {
  it('passes through result, pnl, and clv without score/line reconstruction', () => {
    const game = makeGame('g1', { away: 'Colorado', home: 'Georgia Tech' }, 'final');
    game.awayScore = 50;
    game.homeScore = 0;
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'spread',
      side: 'home',
      closePrice: 6.5,
      modelPrice: 4,
      result: 'loss',
      pnl: -100,
      clv: -1.5,
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    const wager = view.games[0].markets[0];
    expect(wager.result).toBe('loss');
    expect(wager.pnl).toBe(-100);
    expect(wager.clv).toBe(-1.5);
    expect(wager.awaitingGrading).toBe(false);
  });

  it('keeps a wager when notes metadata is malformed and does not reconstruct it', () => {
    const game = makeGame('g1', { away: 'Away', home: 'Home' });
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'spread',
      side: 'away',
      closePrice: 6.5,
      notes: 'not-valid-notes {grade:A}',
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    const wager = view.games[0].markets[0];
    expect(wager.pickLabel).toBe('Away +6.5');
    expect(wager.notesMeta.metadataAvailable).toBe(false);
    expect(wager.notesMeta.grade).toBeNull();
    expect(wager.notesMeta.edgePts).toBeNull();
    expect(wager.notesMeta.warning).toMatch(/malformed/i);
  });

  it('preserves closePrice 0 as PK and preserves pnl/clv zeros', () => {
    const game = makeGame('g1', { away: 'Away', home: 'Home' }, 'final');
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'spread',
      side: 'away',
      closePrice: 0,
      modelPrice: 0,
      result: 'push',
      pnl: 0,
      clv: 0,
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    const wager = view.games[0].markets[0];
    expect(wager.closePrice).toBe(0);
    expect(wager.pickLabel).toBe('Away PK');
    expect(wager.pnl).toBe(0);
    expect(wager.clv).toBe(0);
  });

  it('formats positive moneyline odds with a + sign', () => {
    const game = makeGame('g1', { away: 'Colorado', home: 'Georgia Tech' });
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'moneyline',
      side: 'away',
      closePrice: 200,
      modelPrice: 189,
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    const wager = view.games[0].markets[0];
    expect(wager.pickLabel).toBe('Colorado +200');
    expect(wager.lockedLineLabel).toBe('+200');
    expect(wager.modelLineLabel).toBe('+189');
  });

  it('marks final ungraded official bets as awaiting grading', () => {
    const game = makeGame('g1', { away: 'Away', home: 'Home' }, 'final');
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'spread',
      side: 'away',
      result: null,
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    expect(view.games[0].markets[0].awaitingGrading).toBe(true);
  });

  it('uses persisted notes metadata without mixed-market average edge', () => {
    const game = makeGame('g1', { away: 'Colorado', home: 'Georgia Tech' });
    const bet = makeBet(game, {
      id: 'b1',
      marketType: 'spread',
      side: 'away',
      closePrice: 6.5,
      modelPrice: 4,
      notes: 'book=DraftKings; edgePts=2.5; grade=C; model=Core V1; marketTimestamp=2026-08-29T16:00:00.000Z',
    });
    const view = buildWeekArchiveView([game], [bet], 2026);
    const meta = view.games[0].markets[0].notesMeta;
    expect(meta.metadataAvailable).toBe(true);
    expect(meta.grade).toBe('C');
    expect(meta.edgePts).toBe(2.5);
    expect(meta.book).toBe('DraftKings');
    expect(view.summary).not.toHaveProperty('avgEdge');
  });
});

describe('Phase 2B Week Archive static API/page gates', () => {
  const helper = fs.readFileSync(path.join(webRoot, 'lib/week-archive.ts'), 'utf8');
  const route = fs.readFileSync(path.join(webRoot, 'app/api/weeks/archive/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(webRoot, 'app/weeks/page.tsx'), 'utf8');
  const table = fs.readFileSync(path.join(webRoot, 'components/WeekArchiveTable.tsx'), 'utf8');

  it('archive API is GET/read-only over Game + official Bet rows', () => {
    expect(route).toContain('export async function GET');
    expect(route).not.toContain('export async function POST');
    expect(route).not.toContain('export async function PUT');
    expect(route).not.toContain('export async function PATCH');
    expect(route).not.toContain('export async function DELETE');
    expect(route).toContain('prisma.game.findMany');
    expect(route).toContain('where: { season, week }');
    expect(route).toContain('prisma.bet.findMany');
    expect(route).toContain('buildWeekArchiveBetWhere(season, week)');
    expect(route).toContain('officialCardPrismaSelect()');
    expect(route).toContain('weekArchiveGamePrismaSelect()');
    expect(route).toContain('status: 409');
    expect(route).toContain('Week archive data integrity error');
  });

  it('does not use MarketLine, MatchupOutput, or live pick/model calculation', () => {
    for (const src of [route, helper]) {
      expect(src).not.toMatch(/\bMarketLine\b/);
      expect(src).not.toContain('marketLines');
      expect(src).not.toContain('matchupOutputs');
      expect(src).not.toMatch(/\bMatchupOutput\b/);
      expect(src).not.toContain('pickMarketLine');
      expect(src).not.toContain('computeSpreadPick');
      expect(src).not.toContain('computeTotalPick');
      expect(src).not.toContain('/api/weeks/slate');
      expect(src).not.toContain('slate-model');
      expect(src).not.toContain('core-v1-spread');
      expect(src).not.toContain('gradeAvailableBets');
      expect(src).not.toContain('prisma.bet.create');
      expect(src).not.toContain('prisma.bet.update');
      expect(src).not.toContain('prisma.game.update');
      expect(src).not.toContain('prisma.game.create');
    }
  });

  it('does not hardcode Week 1 reference counts in runtime archive code', () => {
    expect(helper).not.toMatch(/\b51\b/);
    expect(helper).not.toContain('North Carolina');
    expect(helper).not.toContain('TCU');
    expect(route).not.toMatch(/\b51\b/);
    expect(route).not.toContain('UNC');
  });

  it('2026 page uses Week Archive, not live slate', () => {
    expect(page).toContain('Week Archive');
    expect(page).toContain('/api/weeks/archive');
    expect(page).toContain('if (nextSeason >= 2026)');
    expect(page).toContain('{season >= 2026 ? (');
    expect(page).toContain('<WeekArchiveTable games={archiveGames} />');
    expect(page).toContain('Official Card');
    expect(page).toContain('Week Review');
    expect(page).toContain('Season Review');
    expect(page).toContain('Current Slate');
    expect(page).toContain("href=\"/picks\"");
    expect(page).toContain("href=\"/weeks/review\"");
    expect(page).toContain("href=\"/season-review\"");
    expect(page).toContain('href="/"');
    expect(page).toContain('LEGACY / RECONSTRUCTED');
    expect(page).toContain(
      'Historical seasons through 2025 use the legacy reconstructed model'
    );
    expect(page).not.toContain('ProductionModelSelector');
    expect(page).not.toContain('useProductionModel');
    expect(page).not.toContain('buildSlateApiUrl');
    expect(page).not.toContain('/api/weeks/slate');
    expect(page).not.toContain('useState(2025)');
    expect(page).not.toContain('useState(9)');
    expect(page).toContain('useState(0)');
    expect(page).toContain('/api/current-season-week');
    expect(page).toContain('const [paramsReady, setParamsReady] = useState(false)');
    expect(page).toContain('if (!paramsReady) return');
    expect(page).toContain('option value={2026}');
    expect(page).toContain('Array.from({ length: 16 }');
  });

  it('does not render SlateTable for 2026 archive mode', () => {
    expect(page).toContain('season >= 2026 ? (');
    expect(page).toMatch(
      /season >= 2026 \? \([\s\S]*WeekArchiveTable[\s\S]*\) : \([\s\S]*SlateTable/
    );
    expect(table).not.toContain('/api/weeks/slate');
    expect(table).not.toContain('fetch(');
    expect(table).toContain('WEEK_ARCHIVE_NO_WAGER_MESSAGE');
    expect(table).toContain('WEEK_ARCHIVE_AWAITING_GRADING');
    expect(WEEK_ARCHIVE_NO_WAGER_MESSAGE).toBe('No official wager');
    expect(WEEK_ARCHIVE_AWAITING_GRADING).toBe('Awaiting grading');
    expect(table).not.toContain('ProductionModelSelector');
  });
});

describe('Phase 2B does not modify workflows, Current Slate, or model formulas', () => {
  function gitDiffNames(paths: string[]): string[] {
    const result = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main', '--', ...paths],
      { encoding: 'utf8', cwd: repoRoot }
    );
    expect(result.status).toBe(0);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  it('does not modify guarded 2026 GitHub workflow files', () => {
    expect(gitDiffNames(['.github/workflows'])).toEqual([]);
  });

  it('does not modify Core/Hybrid/ratings/Odds/scores/grading calculation code', () => {
    expect(
      gitDiffNames([
        'apps/jobs/lib/grade-bets-2026.ts',
        'apps/jobs/src/ratings',
        'apps/web/lib/core-v2-spread.ts',
        'apps/web/lib/grading',
        'apps/jobs/src/odds',
        'apps/jobs/src/cfbd-game-results.ts',
        'apps/jobs/write-live-odds-2026.ts',
        'apps/jobs/write-core-v1-weekly-card-2026.ts',
        'apps/jobs/write-cfbd-scores-2026.ts',
        'apps/jobs/grade-bets-2026.ts',
      ])
    ).toEqual([]);
  });

  it('does not modify Current Slate or Official Card semantics files', () => {
    expect(
      gitDiffNames([
        'apps/web/app/page.tsx',
        'apps/web/components/SlateTable.tsx',
        'apps/web/lib/official-card.ts',
        'apps/web/app/api/official-card/route.ts',
        'apps/web/app/picks/page.tsx',
      ])
    ).toEqual([]);
  });
});
