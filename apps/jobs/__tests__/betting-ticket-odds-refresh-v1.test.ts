/**
 * Betting Ticket Odds Refresh V1 regression tests.
 * No DB, provider, or production mutation.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  planBettingTicketOddsRefresh,
  BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES,
  BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES,
} from '../src/betting-ticket-odds-refresh-v1';

const ROOT = path.resolve(__dirname, '../../..');
const WF = path.join(
  ROOT,
  '.github/workflows/run-betting-ticket-odds-refresh-v1-2026.yml'
);
const CLI = path.join(
  ROOT,
  'apps/jobs/plan-betting-ticket-odds-refresh-v1.ts'
);

function stepBlock(src: string, stepName: string): string {
  const marker = `- name: ${stepName}`;
  const idx = src.indexOf(marker);
  if (idx < 0) return '';
  const rest = src.slice(idx);
  const next = rest.search(/\n\s*- name:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Betting Ticket Odds Refresh V1 planner', () => {
  const now = new Date('2026-09-29T18:00:00.000Z');

  it('keeps a complete <150-minute board fresh with zero provider calls', () => {
    const plan = planBettingTicketOddsRefresh({
      now,
      frames: [
        {
          gameId: 'g1',
          kickoffIso: '2026-09-30T00:00:00.000Z',
          status: 'scheduled',
          recentMarketTypes: ['spread', 'total', 'moneyline'],
        },
      ],
    });

    expect(BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES).toBe(150);
    expect(plan.outcome).toBe('BOARD_FRESH');
    expect(plan.shouldRefresh).toBe(false);
    expect(plan.providerCalls).toBe(0);
    expect(plan.databaseWrites).toBe(false);
  });

  it('requests one future board refresh if any required market is stale/missing', () => {
    const plan = planBettingTicketOddsRefresh({
      now,
      frames: [
        {
          gameId: 'g1',
          kickoffIso: '2026-09-30T00:00:00.000Z',
          status: 'scheduled',
          recentMarketTypes: ['spread', 'moneyline'],
        },
        {
          gameId: 'g2',
          kickoffIso: '2026-09-30T01:00:00.000Z',
          status: 'scheduled',
          recentMarketTypes: ['spread', 'total', 'moneyline'],
        },
      ],
    });

    expect(plan.outcome).toBe('REFRESH_NEEDED');
    expect(plan.shouldRefresh).toBe(true);
    expect(plan.staleGameIds).toEqual(['g1']);
    expect(plan.missingMarketsByGame.g1).toEqual(['total']);
  });

  it('hands off to T-30 when any scheduled kickoff is within 60 minutes', () => {
    const plan = planBettingTicketOddsRefresh({
      now,
      frames: [
        {
          gameId: 'near',
          kickoffIso: '2026-09-29T18:45:00.000Z',
          status: 'scheduled',
          recentMarketTypes: [],
        },
        {
          gameId: 'later',
          kickoffIso: '2026-09-30T00:00:00.000Z',
          status: 'scheduled',
          recentMarketTypes: [],
        },
      ],
    });

    expect(BETTING_TICKET_ODDS_REFRESH_T30_HANDOFF_MINUTES).toBe(60);
    expect(plan.outcome).toBe('T30_HANDOFF');
    expect(plan.shouldRefresh).toBe(false);
    expect(plan.handoffGameIds).toEqual(['near']);
    expect(plan.providerCalls).toBe(0);
  });

  it('does nothing when there are no future scheduled games', () => {
    const plan = planBettingTicketOddsRefresh({
      now,
      frames: [
        {
          gameId: 'past',
          kickoffIso: '2026-09-29T17:00:00.000Z',
          status: 'scheduled',
          recentMarketTypes: [],
        },
        {
          gameId: 'final',
          kickoffIso: '2026-09-30T00:00:00.000Z',
          status: 'final',
          recentMarketTypes: [],
        },
      ],
    });

    expect(plan.outcome).toBe('NO_FUTURE_GAMES');
    expect(plan.shouldRefresh).toBe(false);
  });
});

describe('Betting Ticket Odds Refresh V1 workflow boundary', () => {
  const wf = fs.readFileSync(WF, 'utf8');
  const cli = fs.readFileSync(CLI, 'utf8');

  it('uses workflow_dispatch only; Supabase is the intended external clock', () => {
    expect(wf).toContain('workflow_dispatch');
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toMatch(/^\s*pull_request:/m);
    expect(wf).toContain('clockAuthority');
    expect(wf).toContain('SUPABASE_EXTERNAL');
    expect(wf).toContain('cancel-in-progress: false');
  });

  it('loads the version-controlled active week and refuses non-main execution', () => {
    const load = stepBlock(wf, 'Load version-controlled active week');
    const guard = stepBlock(wf, 'Source/ref guard');
    expect(load).toContain('GENERIC_SHADOW_T30_ACTIVE_WEEK_2026.json');
    expect(load).toContain('INPUT_WEEK');
    expect(guard).toContain('refs/heads/main');
    expect(guard).toContain('git rev-parse HEAD');
  });

  it('keeps ODDS_API_KEY only on the conditional provider step', () => {
    const plan = stepBlock(wf, 'Plan operator-board freshness (read-only)');
    const refresh = stepBlock(wf, 'Conditional guarded Live Odds refresh');
    expect(plan).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(plan).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(refresh).toMatch(/ODDS_API_KEY:\s*\$\{\{\s*secrets\.ODDS_API_KEY\s*\}\}/);
    expect(refresh).toContain('write-live-odds-2026.ts');
    expect(refresh).toContain('WRITE_2026_WEEK_${INPUT_WEEK}_ODDS');
    expect(wf.match(/secrets\.ODDS_API_KEY/g)).toHaveLength(1);
    expect(wf).not.toMatch(/secrets\.CFBD_API_KEY/);
    expect(wf).not.toMatch(/secrets\.SGO_API_KEY/);
    expect(wf).not.toMatch(/secrets\.VISUALCROSSING_API_KEY/);
  });

  it('planner has no provider secret and no database mutation API', () => {
    expect(cli).toContain('providerCalls=0 databaseWrites=false');
    expect(cli).toContain('ODDS_API_KEY: not provided');
    expect(cli).not.toContain('process.env.ODDS_API_KEY');
    expect(cli).not.toMatch(/\.create\(|\.createMany\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(cli).not.toContain('prisma migrate');
  });

  it('does not invoke T-30 closing or unrelated writers', () => {
    expect(wf).not.toContain('capture-shadow-model-t30-closing-v1-2026.ts');
    expect(wf).not.toContain('capture-shadow-t30-closing-v1-2026.ts');
    expect(wf).not.toContain('write-core-v1');
    expect(wf).not.toContain('grade-bets');
    expect(wf).not.toContain('prisma migrate deploy');
    expect(wf).not.toContain('prisma db push');
  });

  it('uploads both planner and Live Odds evidence when a refresh occurs', () => {
    expect(wf).toContain('actions/upload-artifact@v4');
    expect(wf).toContain('betting-ticket-odds-refresh-v1-2026-week-*.json');
    expect(wf).toContain('betting-ticket-live-odds-2026-week-*.json');
    expect(wf).toContain('provider call: conditional, at most 1');
  });
});
