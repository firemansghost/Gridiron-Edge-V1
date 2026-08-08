/**
 * Phase 2C-2G-3 — Guarded season conference initializer tests.
 * No network. No production DB. No Odds. No ratings.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  buildFbsFixture,
  buildIdentityResolver,
  buildSeasonConferencePreview,
  canonicalizeConferenceForPersistence,
} from '../src/preseason/season-conference-preview';
import {
  WRITE_CONFIRM_PHRASE,
  assessSeasonConferenceCommit,
  assessTargetConferenceState,
  parseSeasonConferenceInitArgs,
  verifySeasonConferenceWrite,
  writeSeasonConferences,
  type MembershipConferenceRow,
  type SeasonConferenceWriteDeps,
} from '../src/preseason/season-conference-writer';

const WORKFLOW = path.join(
  __dirname,
  '../../../.github/workflows/initialize-2026-season-conferences.yml'
);
const WRITER_SRC = path.join(
  __dirname,
  '../src/preseason/season-conference-writer.ts'
);
const CLI_SRC = path.join(
  __dirname,
  '../initialize-2026-season-conferences.ts'
);

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) {
    map[`Name ${id}`] = id;
    if (id === 'north-dakota-state') map['North Dakota State'] = id;
    if (id === 'sacramento-state') map['Sacramento State'] = id;
  }
  return map;
}

function healthyTeamsFbs(fbs: string[]) {
  return fbs.map((id) => {
    let school = `Name ${id}`;
    let conference = 'SEC';
    if (id === 'north-dakota-state') {
      school = 'North Dakota State';
      conference = 'Mountain West';
    } else if (id === 'sacramento-state') {
      school = 'Sacramento State';
      conference = 'Mid-American';
    } else if (id === fbs[0]) {
      conference = 'FBS Independents';
    } else if (id === fbs[1]) {
      conference = 'FBS Independents';
    } else if (id === fbs[2]) {
      conference = 'ACC';
    } else if (id === fbs[3]) {
      conference = 'Big Ten';
    }
    return { school, conference, classification: 'fbs' };
  });
}

function matchingTeamConference(fbs: string[]): Record<string, string> {
  const rows = healthyTeamsFbs(fbs);
  const out: Record<string, string> = {};
  for (const r of rows) {
    const id =
      r.school === 'North Dakota State'
        ? 'north-dakota-state'
        : r.school === 'Sacramento State'
          ? 'sacramento-state'
          : r.school.replace(/^Name /, '');
    out[id] = canonicalizeConferenceForPersistence(r.conference)!;
  }
  return out;
}

function nullMembershipRows(fbs: string[]): MembershipConferenceRow[] {
  return fbs.map((teamId) => ({
    season: 2026,
    teamId,
    level: 'fbs',
    conference: null,
  }));
}

function buildHealthyPreview(overrides?: {
  fbsIds?: string[];
  teamsFbsRaw?: ReturnType<typeof healthyTeamsFbs>;
  resolveExtras?: Record<string, string>;
}) {
  const fbs = overrides?.fbsIds ?? buildFbsFixture();
  const resolve = buildIdentityResolver({
    ...nameMapForFbs(fbs),
    ...(overrides?.resolveExtras ?? {}),
  });
  return {
    fbs,
    preview: buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: overrides?.teamsFbsRaw ?? healthyTeamsFbs(fbs),
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
      existingTargetSeasonConferenceDataCount: 0,
    }),
  };
}

function makeTransactionalDeps(initial: MembershipConferenceRow[]) {
  let committed = initial.map((r) => ({ ...r }));
  let txWorking: MembershipConferenceRow[] | null = null;
  let updateCalls = 0;
  let transactions = 0;
  let rolledBack = 0;

  const deps: SeasonConferenceWriteDeps = {
    async transaction(fn) {
      transactions += 1;
      txWorking = committed.map((r) => ({ ...r }));
      try {
        const result = await fn({
          async loadFbsMembershipWithConference() {
            return (txWorking ?? []).map((r) => ({ ...r }));
          },
          async updateConferenceIfNull({ teamId, conference, season }) {
            updateCalls += 1;
            const rows = txWorking!;
            const matches = rows.filter(
              (r) =>
                r.season === season &&
                r.teamId === teamId &&
                r.level === 'fbs' &&
                r.conference === null
            );
            if (matches.length === 0) return 0;
            // Simulate >1 if duplicates exist
            for (const m of matches) {
              m.conference = conference;
            }
            return matches.length;
          },
        });
        committed = txWorking.map((r) => ({ ...r }));
        txWorking = null;
        return result;
      } catch (err) {
        rolledBack += 1;
        txWorking = null;
        throw err;
      }
    },
    async loadFbsMembershipWithConference() {
      return committed.map((r) => ({ ...r }));
    },
  };

  return {
    deps,
    getCommitted: () => committed,
    getUpdateCalls: () => updateCalls,
    getTransactions: () => transactions,
    getRolledBack: () => rolledBack,
    setCommitted: (rows: MembershipConferenceRow[]) => {
      committed = rows.map((r) => ({ ...r }));
    },
  };
}

describe('parseSeasonConferenceInitArgs', () => {
  it('defaults to READ_ONLY for --season 2026', () => {
    expect(parseSeasonConferenceInitArgs(['--season', '2026'])).toEqual({
      ok: true,
      season: 2026,
      mode: 'READ_ONLY',
    });
  });

  it('accepts COMMIT with exact confirmation', () => {
    expect(
      parseSeasonConferenceInitArgs([
        '--season',
        '2026',
        '--commit',
        '--confirm',
        WRITE_CONFIRM_PHRASE,
      ])
    ).toEqual({
      ok: true,
      season: 2026,
      mode: 'COMMIT',
      confirm: WRITE_CONFIRM_PHRASE,
    });
  });

  it('rejects season != 2026 and bad confirm', () => {
    expect(parseSeasonConferenceInitArgs(['--season', '2025']).ok).toBe(false);
    expect(
      parseSeasonConferenceInitArgs([
        '--season',
        '2026',
        '--commit',
        '--confirm',
        'YES',
      ]).ok
    ).toBe(false);
  });
});

describe('assessTargetConferenceState / commit eligibility', () => {
  const { fbs, preview } = buildHealthyPreview();

  it('1. exact 138 candidate + 138 NULL rows => commit eligible', () => {
    const assessment = assessSeasonConferenceCommit({
      preview,
      membershipRows: nullMembershipRows(fbs),
    });
    expect(preview.writeEligible).toBe(true);
    expect(assessment.commitEligible).toBe(true);
    expect(assessment.target.pristineNullTarget).toBe(true);
  });

  it('2. DB FBS count 137 => fail', () => {
    const rows = nullMembershipRows(fbs).slice(0, 137);
    const assessment = assessSeasonConferenceCommit({
      preview: buildHealthyPreview({ fbsIds: fbs.slice(0, 137) }).preview,
      membershipRows: rows,
    });
    expect(assessment.commitEligible).toBe(false);
  });

  it('3. DB FBS count 139 => fail', () => {
    const extra = [
      ...nullMembershipRows(fbs),
      { season: 2026, teamId: 'extra-team', level: 'fbs', conference: null },
    ];
    expect(
      assessSeasonConferenceCommit({ preview, membershipRows: extra })
        .commitEligible
    ).toBe(false);
  });

  it('4. provider count !=138 => fail', () => {
    const rows = healthyTeamsFbs(fbs).slice(0, 137);
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(p.writeEligible).toBe(false);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('5. unresolved provider school => fail', () => {
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const rows = healthyTeamsFbs(fbs);
    rows[0] = { ...rows[0], school: 'Unknown School XYZ' };
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(p.unresolvedProviderSchools.length).toBeGreaterThan(0);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('6. provider extra => fail', () => {
    const rows = [
      ...healthyTeamsFbs(fbs),
      { school: 'Extra U', conference: 'SEC', classification: 'fbs' },
    ];
    const resolve = buildIdentityResolver({
      ...nameMapForFbs(fbs),
      'Extra U': 'extra-team',
    });
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(p.providerFbsOutsideDb.length).toBeGreaterThan(0);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('7. DB missing from provider => fail', () => {
    const rows = healthyTeamsFbs(fbs).filter(
      (r) => r.school !== 'North Dakota State'
    );
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(p.dbFbsMissingFromProvider).toContain('north-dakota-state');
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('8. duplicate team mapping => fail', () => {
    const rows = healthyTeamsFbs(fbs);
    rows.push({
      school: 'Alt NDSU',
      conference: 'Mountain West',
      classification: 'fbs',
    });
    const resolve = buildIdentityResolver({
      ...nameMapForFbs(fbs),
      'Alt NDSU': 'north-dakota-state',
    });
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(p.duplicateTeamIds.length).toBeGreaterThan(0);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('9. conference missing => fail', () => {
    const rows = healthyTeamsFbs(fbs);
    rows[5] = { ...rows[5], conference: '' };
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(p.missingConferences.length).toBeGreaterThan(0);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('10. unrecognized conference => fail', () => {
    const rows = healthyTeamsFbs(fbs);
    rows[5] = { ...rows[5], conference: 'Totally Fake Conf' };
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(p.unrecognizedConferences.length).toBeGreaterThan(0);
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('11. NDSU wrong conference => fail', () => {
    const rows = healthyTeamsFbs(fbs).map((r) =>
      r.school === 'North Dakota State'
        ? { ...r, conference: 'Big Ten' }
        : r
    );
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('12. Sacramento State wrong conference => fail', () => {
    const rows = healthyTeamsFbs(fbs).map((r) =>
      r.school === 'Sacramento State' ? { ...r, conference: 'Big 12' } : r
    );
    const p = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingTeamConference(fbs),
      resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      providerRequestCount: 1,
    });
    expect(
      assessSeasonConferenceCommit({
        preview: p,
        membershipRows: nullMembershipRows(fbs),
      }).commitEligible
    ).toBe(false);
  });

  it('13. one pre-populated target row => commit refused', () => {
    const rows = nullMembershipRows(fbs);
    rows[0].conference = 'SEC';
    expect(
      assessSeasonConferenceCommit({ preview, membershipRows: rows })
        .commitEligible
    ).toBe(false);
  });

  it('14. partial populated target => commit refused', () => {
    const rows = nullMembershipRows(fbs).map((r, i) =>
      i < 50 ? { ...r, conference: 'SEC' } : r
    );
    expect(
      assessSeasonConferenceCommit({ preview, membershipRows: rows })
        .commitEligible
    ).toBe(false);
  });

  it('15. all 138 already populated => commit refused, not success', () => {
    const rows = nullMembershipRows(fbs).map((r) => ({
      ...r,
      conference: 'SEC',
    }));
    const assessment = assessSeasonConferenceCommit({
      preview,
      membershipRows: rows,
    });
    expect(assessment.commitEligible).toBe(false);
    expect(assessment.target.populatedConferenceCount).toBe(138);
    expect(assessment.target.nullConferenceCount).toBe(0);
  });
});

describe('writeSeasonConferences transaction', () => {
  it('16. one update affects 0 rows => transaction throws / rollback', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = nullMembershipRows(fbs);
    // Remove one row so update finds 0
    const incomplete = rows.filter((r) => r.teamId !== fbs[10]);
    const state = makeTransactionalDeps(incomplete);
    // Preflight uses full 138 null — but we force commitEligible bypass by using
    // deps that start incomplete only inside... Actually assessment runs first on
    // membershipRows passed in. Pass pristine null for assessment, then mutate
    // committed before write? writeSeasonConferences re-reads inside tx from deps.
    // So start committed incomplete; assessment must use same rows → not eligible.
    // Instead: start pristine, but make updateConferenceIfNull return 0 for one id.
    const pristine = makeTransactionalDeps(rows);
    const originalTx = pristine.deps.transaction.bind(pristine.deps);
    pristine.deps.transaction = async (fn) =>
      originalTx(async (tx) =>
        fn({
          loadFbsMembershipWithConference: tx.loadFbsMembershipWithConference,
          async updateConferenceIfNull(opts) {
            if (opts.teamId === fbs[10]) return 0;
            return tx.updateConferenceIfNull(opts);
          },
        })
      );

    await expect(
      writeSeasonConferences({
        preview,
        membershipRows: rows,
        deps: pristine.deps,
      })
    ).rejects.toThrow(/affected 0 rows/);
    expect(pristine.getCommitted().every((r) => r.conference === null)).toBe(
      true
    );
    expect(pristine.getRolledBack()).toBe(1);
  });

  it('17. one update affects >1 row => transaction throws / rollback', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = [
      ...nullMembershipRows(fbs),
      // Duplicate membership row for same teamId (pathological)
      {
        season: 2026,
        teamId: fbs[0],
        level: 'fbs',
        conference: null,
      },
    ];
    // Assessment uses distinct count from filtered fbs — fbsCount would be 139
    // Force: start with pristine 138, override update to return 2
    const pristineRows = nullMembershipRows(fbs);
    const state = makeTransactionalDeps(pristineRows);
    const originalTx = state.deps.transaction.bind(state.deps);
    state.deps.transaction = async (fn) =>
      originalTx(async (tx) =>
        fn({
          loadFbsMembershipWithConference: tx.loadFbsMembershipWithConference,
          async updateConferenceIfNull(opts) {
            if (opts.teamId === fbs[0]) return 2;
            return tx.updateConferenceIfNull(opts);
          },
        })
      );

    await expect(
      writeSeasonConferences({
        preview,
        membershipRows: pristineRows,
        deps: state.deps,
      })
    ).rejects.toThrow(/affected 2 rows/);
    expect(state.getCommitted().every((r) => r.conference === null)).toBe(true);
  });

  it('18. post-write one row mismatches candidate => rollback', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = nullMembershipRows(fbs);
    const state = makeTransactionalDeps(rows);
    const originalTx = state.deps.transaction.bind(state.deps);
    state.deps.transaction = async (fn) =>
      originalTx(async (tx) => {
        const result = await fn({
          loadFbsMembershipWithConference: tx.loadFbsMembershipWithConference,
          async updateConferenceIfNull(opts) {
            const count = await tx.updateConferenceIfNull(opts);
            if (opts.teamId === 'north-dakota-state') {
              // Corrupt after update for in-tx verification
              const all = await tx.loadFbsMembershipWithConference(2026);
              const hit = all.find((r) => r.teamId === 'north-dakota-state');
              if (hit) hit.conference = 'Big Ten';
              // mutate underlying via setCommitted mid-tx — use working copy:
            }
            return count;
          },
        });
        return result;
      });

    // Better approach: wrap load after updates to return corrupted data
    const state2 = makeTransactionalDeps(rows);
    let updatesDone = 0;
    const orig2 = state2.deps.transaction.bind(state2.deps);
    state2.deps.transaction = async (fn) =>
      orig2(async (tx) =>
        fn({
          async loadFbsMembershipWithConference(season) {
            const loaded = await tx.loadFbsMembershipWithConference(season);
            if (updatesDone >= EXPECTED_FBS_COUNT) {
              return loaded.map((r) =>
                r.teamId === 'north-dakota-state'
                  ? { ...r, conference: 'Big Ten' }
                  : r
              );
            }
            return loaded;
          },
          async updateConferenceIfNull(opts) {
            const c = await tx.updateConferenceIfNull(opts);
            updatesDone += 1;
            return c;
          },
        })
      );

    await expect(
      writeSeasonConferences({
        preview,
        membershipRows: rows,
        deps: state2.deps,
      })
    ).rejects.toThrow(/post-write verification failed/);
    expect(state2.getCommitted().every((r) => r.conference === null)).toBe(
      true
    );
  });

  it('19. post-write one NULL remains => rollback', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = nullMembershipRows(fbs);
    const state = makeTransactionalDeps(rows);
    let updatesDone = 0;
    const orig = state.deps.transaction.bind(state.deps);
    state.deps.transaction = async (fn) =>
      orig(async (tx) =>
        fn({
          async loadFbsMembershipWithConference(season) {
            const loaded = await tx.loadFbsMembershipWithConference(season);
            if (updatesDone >= EXPECTED_FBS_COUNT) {
              return loaded.map((r, i) =>
                i === 0 ? { ...r, conference: null } : r
              );
            }
            return loaded;
          },
          async updateConferenceIfNull(opts) {
            const c = await tx.updateConferenceIfNull(opts);
            updatesDone += 1;
            return c;
          },
        })
      );

    await expect(
      writeSeasonConferences({
        preview,
        membershipRows: rows,
        deps: state.deps,
      })
    ).rejects.toThrow(/post-write verification failed/);
    expect(state.getRolledBack()).toBe(1);
  });

  it('20. canonical distribution mismatch => rollback', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = nullMembershipRows(fbs);
    const state = makeTransactionalDeps(rows);
    let updatesDone = 0;
    const orig = state.deps.transaction.bind(state.deps);
    state.deps.transaction = async (fn) =>
      orig(async (tx) =>
        fn({
          async loadFbsMembershipWithConference(season) {
            const loaded = await tx.loadFbsMembershipWithConference(season);
            if (updatesDone >= EXPECTED_FBS_COUNT) {
              // Force all SEC — distribution mismatch
              return loaded.map((r) => ({ ...r, conference: 'SEC' }));
            }
            return loaded;
          },
          async updateConferenceIfNull(opts) {
            const c = await tx.updateConferenceIfNull(opts);
            updatesDone += 1;
            return c;
          },
        })
      );

    await expect(
      writeSeasonConferences({
        preview,
        membershipRows: rows,
        deps: state.deps,
      })
    ).rejects.toThrow(/post-write verification failed/);
  });

  it('21. READ_ONLY assessment invokes zero mutations', () => {
    const { fbs, preview } = buildHealthyPreview();
    const state = makeTransactionalDeps(nullMembershipRows(fbs));
    const assessment = assessSeasonConferenceCommit({
      preview,
      membershipRows: nullMembershipRows(fbs),
    });
    expect(assessment.commitEligible).toBe(true);
    expect(state.getUpdateCalls()).toBe(0);
    expect(state.getTransactions()).toBe(0);
  });

  it('22. COMMIT mode exact valid candidate updates exactly 138', async () => {
    const { fbs, preview } = buildHealthyPreview();
    const rows = nullMembershipRows(fbs);
    const state = makeTransactionalDeps(rows);
    const result = await writeSeasonConferences({
      preview,
      membershipRows: rows,
      deps: state.deps,
    });
    expect(result.ok).toBe(true);
    expect(result.rowsUpdated).toBe(138);
    expect(result.writeCommitted).toBe(true);
    expect(result.mutationsInvoked).toBe(true);
    expect(state.getUpdateCalls()).toBe(138);
    expect(
      state.getCommitted().filter((r) => r.conference !== null)
    ).toHaveLength(138);
    expect(
      state.getCommitted().find((r) => r.teamId === 'north-dakota-state')
        ?.conference
    ).toBe('Mountain West');
    expect(
      state.getCommitted().find((r) => r.teamId === 'sacramento-state')
        ?.conference
    ).toBe('Mid-American');
  });
});

describe('isolation / workflow static checks', () => {
  it('23-27. no Team/ratings/talent/Odds; provider budget 1', () => {
    const writer = fs.readFileSync(WRITER_SRC, 'utf8');
    const cli = fs.readFileSync(CLI_SRC, 'utf8');
    expect(writer).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(writer).not.toMatch(/compute_ratings|ODDS_API_KEY|seed-talent/);
    expect(cli).toMatch(/updateMany/);
    expect(cli).toMatch(/TeamMembership/);
    expect(cli).not.toMatch(/prisma\.team\.(update|upsert|createMany)/);
    expect(cli).not.toMatch(/compute_ratings|seed-ratings|OddsApi/);
    expect(cli).toMatch(/TransactionIsolationLevel\.Serializable/);
    expect(cli).toMatch(/PROVIDER_BUDGET|providerBudget=1|providerBudget=\$\{PROVIDER_BUDGET\}/);
    expect(writer).toMatch(/PROVIDER_BUDGET = 1/);
  });

  it('28. season !=2026 rejected', () => {
    expect(parseSeasonConferenceInitArgs(['--season', '2024']).ok).toBe(false);
  });

  it('29-31. workflow confirm/env/dispatch safety', () => {
    const text = fs.readFileSync(WORKFLOW, 'utf8');
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/WRITE_2026_CONFERENCES/);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*['"]?20['"]?/);
    expect(text).toMatch(/TARGET_SEASON:\s*\$\{\{\s*inputs\.season\s*\}\}/);
    expect(text).toMatch(/WRITE_CONFIRM:\s*\$\{\{\s*inputs\.confirm\s*\}\}/);
    expect(text).toMatch(/RUN_MODE:\s*\$\{\{\s*inputs\.mode\s*\}\}/);
    expect(text).toMatch(/prisma migrate: not invoked/);
    expect(text).not.toMatch(/prisma migrate deploy/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);

    // Extract only YAML `run: |` bodies (not env: mappings)
    const runBodies: string[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s+run:\s*\|/.test(lines[i])) continue;
      const baseIndent = (lines[i].match(/^(\s*)/)?.[1].length ?? 0);
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
    const joined = runBodies.join('\n---\n');
    expect(joined).not.toMatch(/\$\{\{\s*inputs\.(season|confirm|mode)\s*\}\}/);
    expect(joined).toMatch(/\$TARGET_SEASON/);
    expect(joined).toMatch(/\$WRITE_CONFIRM|\$RUN_MODE/);
  });
});

describe('verify helpers', () => {
  it('assessTargetConferenceState pristine vs populated', () => {
    const fbs = buildFbsFixture();
    expect(assessTargetConferenceState(nullMembershipRows(fbs)).pristineNullTarget).toBe(
      true
    );
    expect(
      assessTargetConferenceState(
        nullMembershipRows(fbs).map((r) => ({ ...r, conference: 'SEC' }))
      ).pristineNullTarget
    ).toBe(false);
  });

  it('verifySeasonConferenceWrite exact success', () => {
    const { fbs, preview } = buildHealthyPreview();
    const written = preview.candidates.map((c) => ({
      season: 2026,
      teamId: c.teamId,
      level: 'fbs' as const,
      conference: c.conference,
    }));
    const v = verifySeasonConferenceWrite({
      writtenRows: written,
      candidates: preview.candidates,
      expectedDistribution: preview.normalizedConferenceCounts,
    });
    expect(v.ok).toBe(true);
    expect(v.verificationExact).toBe(true);
  });
});
