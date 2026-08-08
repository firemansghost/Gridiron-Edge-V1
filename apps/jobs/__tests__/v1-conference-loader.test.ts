/**
 * Phase 2C-2G-4 — Core V1 season-aware conference loader tests.
 * No network. No production DB. No CFBD. No Odds. No ratings writes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CONFERENCE_ADJUSTMENTS,
  getConferenceAdjustment,
} from '../src/ratings/conference-adjustments';
import {
  loadV1ConferenceMap,
  type V1ConferenceStore,
} from '../src/ratings/v1-conference-loader';
import { buildFbsFixture } from '../src/preseason/season-conference-preview';

const LOADER_SRC = path.join(
  __dirname,
  '../src/ratings/v1-conference-loader.ts'
);
const COMPUTE_SRC = path.join(
  __dirname,
  '../src/ratings/compute_ratings_v1.ts'
);
const AUDIT_CLI = path.join(__dirname, '../audit-v1-conference-source.ts');
const WORKFLOW = path.join(
  __dirname,
  '../../../.github/workflows/audit-v1-conference-source.yml'
);

function makeStore(options: {
  membership?: Array<{ teamId: string; conference: string | null }>;
  legacy?: Array<{ teamId: string; conference: string | null }>;
}): V1ConferenceStore {
  return {
    async loadSeasonMembershipConferences() {
      return (options.membership ?? []).map((r) => ({ ...r }));
    },
    async loadLegacyTeamConferences() {
      return (options.legacy ?? []).map((r) => ({ ...r }));
    },
  };
}

function membershipFor(fbs: string[], conference = 'SEC') {
  return fbs.map((teamId) => {
    let conf = conference;
    if (teamId === 'north-dakota-state') conf = 'Mountain West';
    else if (teamId === 'sacramento-state') conf = 'Mid-American';
    else if (teamId === fbs[0] || teamId === fbs[1]) conf = 'Independent';
    return { teamId, conference: conf };
  });
}

describe('loadV1ConferenceMap 2026+', () => {
  const fbs = buildFbsFixture();

  it('1. exact expected set + all recognized season conferences → success', async () => {
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership: membershipFor(fbs) }),
    });
    expect(result.ok).toBe(true);
    expect(result.conferenceSource).toBe('TeamMembership.conference');
    expect(result.loadedConferenceCount).toBe(138);
    expect(result.usedLegacyFallback).toBe(false);
    expect(result.legacyConferenceMode).toBe(false);
  });

  it('2. one missing membership row → fail', async () => {
    const membership = membershipFor(fbs).filter(
      (r) => r.teamId !== 'north-dakota-state'
    );
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership }),
    });
    expect(result.ok).toBe(false);
    expect(result.missingTeamIds).toContain('north-dakota-state');
  });

  it('3. one NULL conference → fail', async () => {
    const membership = membershipFor(fbs).map((r) =>
      r.teamId === fbs[5] ? { ...r, conference: null } : r
    );
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership }),
    });
    expect(result.ok).toBe(false);
    expect(result.missingTeamIds).toContain(fbs[5]);
  });

  it('4. one blank conference → fail', async () => {
    const membership = membershipFor(fbs).map((r) =>
      r.teamId === fbs[5] ? { ...r, conference: '   ' } : r
    );
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership }),
    });
    expect(result.ok).toBe(false);
    expect(result.missingTeamIds).toContain(fbs[5]);
  });

  it('5. one unrecognized conference → fail', async () => {
    const membership = membershipFor(fbs).map((r) =>
      r.teamId === fbs[5] ? { ...r, conference: 'Totally Fake Conf' } : r
    );
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership }),
    });
    expect(result.ok).toBe(false);
    expect(result.unrecognizedTeamIds).toContain(fbs[5]);
  });

  it('6. duplicate membership team ID → fail', async () => {
    const membership = [
      ...membershipFor(fbs),
      { teamId: fbs[0], conference: 'SEC' },
    ];
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership }),
    });
    expect(result.ok).toBe(false);
    expect(result.duplicateTeamIds).toContain(fbs[0]);
  });

  it('7. season data missing but static Team.conference valid → fail / no fallback', async () => {
    const membership = membershipFor(fbs).map((r) =>
      r.teamId === fbs[5] ? { ...r, conference: null } : r
    );
    const legacy = fbs.map((teamId) => ({ teamId, conference: 'SEC' }));
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership, legacy }),
    });
    expect(result.ok).toBe(false);
    expect(result.usedLegacyFallback).toBe(false);
    expect(result.conferenceMap.size).toBe(0);
    // Critical: static SEC must not rescue NULL membership
    expect(result.conferenceMap.get(fbs[5])).toBeUndefined();
  });

  it('8. all season values valid → usedLegacyFallback=false', async () => {
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({
        membership: membershipFor(fbs),
        legacy: fbs.map((teamId) => ({ teamId, conference: 'Independent' })),
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.usedLegacyFallback).toBe(false);
  });

  it('9. 2027 missing season-aware data → fail closed', async () => {
    const result = await loadV1ConferenceMap({
      season: 2027,
      expectedFbsIds: fbs,
      store: makeStore({ membership: [] }),
    });
    expect(result.ok).toBe(false);
    expect(result.conferenceSource).toBe('TeamMembership.conference');
    expect(result.legacyConferenceMode).toBe(false);
  });

  it('12-13. NDSU Mountain West; Sacramento State Mid-American', async () => {
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership: membershipFor(fbs) }),
    });
    expect(result.ok).toBe(true);
    expect(result.conferenceMap.get('north-dakota-state')).toBe('Mountain West');
    expect(result.conferenceMap.get('sacramento-state')).toBe('Mid-American');
  });
});

describe('loadV1ConferenceMap historical <2026', () => {
  it('10. 2025 uses legacy static Team.conference', async () => {
    const ids = ['alabama', 'ohio-state'];
    const result = await loadV1ConferenceMap({
      season: 2025,
      expectedFbsIds: ids,
      store: makeStore({
        legacy: [
          { teamId: 'alabama', conference: 'SEC' },
          { teamId: 'ohio-state', conference: 'Big Ten' },
        ],
        membership: [], // must not be required
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.conferenceSource).toBe('Team.conference');
    expect(result.legacyConferenceMode).toBe(true);
    expect(result.conferenceMap.get('alabama')).toBe('SEC');
    expect(result.conferenceMap.get('ohio-state')).toBe('Big Ten');
  });

  it('11. 2025 missing static conference preserves Unknown/Independent behavior', async () => {
    const result = await loadV1ConferenceMap({
      season: 2025,
      expectedFbsIds: ['alabama', 'ghost-team'],
      store: makeStore({
        legacy: [{ teamId: 'alabama', conference: 'SEC' }],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.conferenceMap.get('alabama')).toBe('SEC');
    // ghost-team absent from map → undefined → getConferenceAdjustment(null) = Unknown
    expect(result.conferenceMap.get('ghost-team')).toBeUndefined();
    expect(getConferenceAdjustment(null)).toBe(-5.0);
    expect(getConferenceAdjustment(result.conferenceMap.get('ghost-team') ?? null)).toBe(
      -5.0
    );
  });
});

describe('conference adjustment constants unchanged', () => {
  it('14. all conference adjustment numeric constants unchanged', () => {
    expect(CONFERENCE_ADJUSTMENTS['SEC']).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['Big Ten']).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['B1G']).toBe(5.0);
    expect(CONFERENCE_ADJUSTMENTS['ACC']).toBe(2.0);
    expect(CONFERENCE_ADJUSTMENTS['Big 12']).toBe(2.0);
    expect(CONFERENCE_ADJUSTMENTS['Pac-12']).toBe(2.0);
    expect(CONFERENCE_ADJUSTMENTS['American Athletic']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['AAC']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['Mountain West']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['MWC']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['Sun Belt']).toBe(-2.0);
    expect(CONFERENCE_ADJUSTMENTS['Mid-American']).toBe(-3.5);
    expect(CONFERENCE_ADJUSTMENTS['MAC']).toBe(-3.5);
    expect(CONFERENCE_ADJUSTMENTS['Conference USA']).toBe(-3.5);
    expect(CONFERENCE_ADJUSTMENTS['C-USA']).toBe(-3.5);
    expect(CONFERENCE_ADJUSTMENTS['Independent']).toBe(-5.0);
    expect(CONFERENCE_ADJUSTMENTS['Unknown']).toBe(-5.0);
    expect(CONFERENCE_ADJUSTMENTS['FCS']).toBe(-6.0);
  });

  it('seam: returned map feeds getConferenceAdjustment', async () => {
    const fbs = buildFbsFixture();
    const result = await loadV1ConferenceMap({
      season: 2026,
      expectedFbsIds: fbs,
      store: makeStore({ membership: membershipFor(fbs) }),
    });
    expect(result.ok).toBe(true);
    const ndsu = result.conferenceMap.get('north-dakota-state');
    const sac = result.conferenceMap.get('sacramento-state');
    expect(getConferenceAdjustment(ndsu ?? null)).toBe(-2.0);
    expect(getConferenceAdjustment(sac ?? null)).toBe(-3.5);
    expect(getConferenceAdjustment('SEC')).toBe(5.0);
  });
});

describe('isolation / workflow', () => {
  it('15-19. no CFBD/Odds/Team/TeamMembership/ratings writes in loader', () => {
    const loader = fs.readFileSync(LOADER_SRC, 'utf8');
    expect(loader).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY|collegefootballdata/);
    expect(loader).not.toMatch(/updateMany|createMany|upsert|\$transaction/);
    expect(loader).not.toMatch(/compute_ratings|teamSeasonRating/);
    expect(loader).toMatch(/resolveSeasonAwareConferenceMap/);
    expect(loader).toMatch(/allowLegacyTeamConferenceFallback: false/);

    const compute = fs.readFileSync(COMPUTE_SRC, 'utf8');
    expect(compute).toMatch(/loadV1ConferenceMap/);
    expect(compute).toMatch(/conferenceSource=TeamMembership\.conference/);
    // Old static-only path removed from main conference load
    expect(compute).not.toMatch(
      /Loading team conferences for strength adjustments/
    );

    const audit = fs.readFileSync(AUDIT_CLI, 'utf8');
    expect(audit).toMatch(/READ_ONLY/);
    expect(audit).not.toMatch(/updateMany|createMany|upsert/);
    expect(audit).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);
  });

  it('workflow is read-only manual-only with env-mapped season', () => {
    const text = fs.readFileSync(WORKFLOW, 'utf8');
    expect(text).toMatch(/^name:\s*Audit V1 Season Conference Source/m);
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*['"]?20['"]?/);
    expect(text).toMatch(/TARGET_SEASON:\s*\$\{\{\s*inputs\.season\s*\}\}/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).toMatch(/ratingsCompute=false/);
    expect(text).toMatch(/mutationsInvoked=false/);
    expect(text).not.toMatch(/prisma migrate deploy/);
    expect(text).not.toMatch(/initialize-2026-season-conferences/);

    const runBodies: string[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s+run:\s*\|/.test(lines[i])) continue;
      const baseIndent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '') {
          body.push(line);
          continue;
        }
        const ind = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (ind <= baseIndent) break;
        body.push(line);
      }
      runBodies.push(body.join('\n'));
    }
    expect(runBodies.join('\n')).not.toMatch(/\$\{\{\s*inputs\.season\s*\}\}/);
    expect(runBodies.join('\n')).toMatch(/\$TARGET_SEASON/);
  });
});
