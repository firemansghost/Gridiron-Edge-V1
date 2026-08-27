/**
 * Phase 2C-2H-2 — Mocked tests for guarded 2026 TeamSeasonTalent initializer.
 * No network. No production DB. No live providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  WRITE_CONFIRM_PHRASE,
  assertTalentCandidatesIntegrity,
  assessTalentInitialization,
  parseTalentInitArgs,
  sanitizeTalentInitError,
  verifyStoredTalentRows,
  writeTeamTalent,
  type ExistingTalentRow,
  type TalentCandidateRow,
  type TalentInitTransactionStore,
  type TalentInitWriteDeps,
} from '../src/preseason/initialize-2026-team-talent';
import {
  buildFbsFixture,
  buildIdentityResolver,
} from '../src/preseason/ratings-input-provider-preview';
import { assertLegacyTalentWriterSeasonAllowed } from '../src/talent/cfbd_team_roster_talent';
import { runTalentInitializer } from '../initialize-2026-team-talent';

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) map[`Name ${id}`] = id;
  return map;
}

function healthyTalentRows(fbs: string[]) {
  return fbs.map((id, i) => ({
    school: `Name ${id}`,
    year: 2026,
    talent: 600 + i * 0.01,
  }));
}

function assessHealthy(
  overrides: Partial<Parameters<typeof assessTalentInitialization>[0]> = {}
) {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));
  return {
    fbs,
    assessment: assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
      ...overrides,
    }),
  };
}

describe('parseTalentInitArgs', () => {
  it('1. PREVIEW 2026 accepted', () => {
    expect(
      parseTalentInitArgs(['--season', '2026', '--mode', 'PREVIEW'])
    ).toEqual({ ok: true, season: 2026, mode: 'PREVIEW', confirm: undefined });
  });

  it('2. COMMIT 2026 + exact token accepted', () => {
    expect(
      parseTalentInitArgs([
        '--season',
        '2026',
        '--mode',
        'COMMIT',
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

  it('3. COMMIT without token rejected', () => {
    expect(
      parseTalentInitArgs(['--season', '2026', '--mode', 'COMMIT']).ok
    ).toBe(false);
  });

  it('4. Wrong token rejected', () => {
    expect(
      parseTalentInitArgs([
        '--season',
        '2026',
        '--mode',
        'COMMIT',
        '--confirm',
        'WRITE_TALENT',
      ]).ok
    ).toBe(false);
  });

  it('5. season != 2026 rejected', () => {
    expect(
      parseTalentInitArgs(['--season', '2025', '--mode', 'PREVIEW']).ok
    ).toBe(false);
  });

  it('6. arbitrary force/write flags rejected', () => {
    for (const flag of ['--write', '--force', '--upsert', '--persist']) {
      expect(
        parseTalentInitArgs([
          '--season',
          '2026',
          '--mode',
          'PREVIEW',
          flag,
        ]).ok
      ).toBe(false);
    }
  });
});

describe('structural candidate gates', () => {
  it('7. healthy 138-row school/year/talent → structurally complete + writeEligible', () => {
    const { assessment } = assessHealthy();
    expect(assessment.structurallyComplete).toBe(true);
    expect(assessment.writeEligible).toBe(true);
    expect(assessment.candidates).toHaveLength(EXPECTED_FBS_COUNT);
    expect(assessment.candidateSetExact).toBe(true);
  });

  it('8. 137 DB FBS → false', () => {
    const fbs = buildFbsFixture().slice(0, 137);
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.writeEligible).toBe(false);
  });

  it('9. 139 DB FBS → false', () => {
    const fbs = [...buildFbsFixture(), 'extra-team'];
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
  });

  it('10. raw rows != 138 → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs).slice(0, 100),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
  });

  it('11. one missing FBS → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs.slice(1)),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.talent.missingFbsIds.length).toBe(1);
  });

  it('12. unresolved provider team → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const rows = healthyTalentRows(fbs);
    rows[0] = { school: 'Unknown School XYZ', year: 2026, talent: 700 };
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: rows,
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.talent.unresolvedProviderNames.length).toBeGreaterThan(0);
  });

  it('13. duplicate team mapping → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const rows = healthyTalentRows(fbs);
    rows.push({ school: `Name ${fbs[0]}`, year: 2026, talent: 999 });
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: rows,
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.talent.duplicateTeamIds.length).toBeGreaterThan(0);
  });

  it('14. unexpected non-FBS provider row → false', () => {
    const fbs = buildFbsFixture();
    const map = nameMapForFbs(fbs);
    map['Extra FCS'] = 'extra-fcs-team';
    const resolve = buildIdentityResolver(map);
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: [
        ...healthyTalentRows(fbs),
        { school: 'Extra FCS', year: 2026, talent: 400 },
      ],
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.talent.unexpectedNonFbsIds).toContain('extra-fcs-team');
  });

  it('15. provider year 2025 → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: fbs.map((id, i) => ({
        school: `Name ${id}`,
        year: 2025,
        talent: 600 + i,
      })),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
    expect(a.talent.seasonMismatch).toBe(true);
  });

  it('16. non-finite talent composite → false', () => {
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const rows = healthyTalentRows(fbs);
    rows[0] = { school: `Name ${fbs[0]}`, year: 2026, talent: Number.NaN };
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: rows,
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.structurallyComplete).toBe(false);
  });

  it('17. exact candidate team set mismatch → false', () => {
    // Simulate via missing one FBS row (set cannot match)
    const fbs = buildFbsFixture();
    const resolve = buildIdentityResolver(nameMapForFbs(fbs));
    const a = assessTalentInitialization({
      fbsIds: fbs,
      talentRaw: healthyTalentRows(fbs.slice(0, 137)),
      resolveTeamId: resolve,
      existingTalent: [],
      providerRequestCount: 1,
      commitRequested: false,
      confirmationValid: true,
    });
    expect(a.candidateSetExact).toBe(false);
    expect(a.structurallyComplete).toBe(false);
  });
});

describe('target-state gates', () => {
  it('18. targetExistingRows=0 → eligible if all other checks pass', () => {
    const { assessment } = assessHealthy({ existingTalent: [] });
    expect(assessment.target.targetExistingRows).toBe(0);
    expect(assessment.writeEligible).toBe(true);
  });

  it('19-21. targetExistingRows=1 → not eligible; no fill/overwrite', () => {
    const fbs = buildFbsFixture();
    const existing: ExistingTalentRow[] = [
      {
        season: 2026,
        teamId: fbs[0],
        talentComposite: 500,
        blueChipsPct: null,
        sourceUpdatedAt: null,
        fiveStar: 0,
        fourStar: 0,
        threeStar: 0,
        unrated: 0,
      },
    ];
    const { assessment } = assessHealthy({ existingTalent: existing });
    expect(assessment.structurallyComplete).toBe(true);
    expect(assessment.writeEligible).toBe(false);
    expect(assessment.commitEligible).toBe(false);
    expect(
      assessment.findings.some((f) => f.includes('not empty'))
    ).toBe(true);
  });
});

describe('candidate field truthfulness', () => {
  it('22-25. candidates set null blueChips/sourceUpdatedAt; no star claims', () => {
    const { assessment } = assessHealthy();
    for (const c of assessment.candidates) {
      expect(c.blueChipsPct).toBeNull();
      expect(c.sourceUpdatedAt).toBeNull();
      expect(c).not.toHaveProperty('fiveStar');
      expect(c).not.toHaveProperty('fourStar');
      expect(c).not.toHaveProperty('threeStar');
      expect(c).not.toHaveProperty('unrated');
    }
    const reportSrc = fs.readFileSync(
      path.join(__dirname, '../src/preseason/initialize-2026-team-talent.ts'),
      'utf8'
    );
    expect(reportSrc).toMatch(/UNSOURCED_SCHEMA_DEFAULTS/);
    expect(reportSrc).toMatch(/NOT_AVAILABLE_FROM_\/talent/);
  });
});

describe('mutation safety', () => {
  it('26. PREVIEW pure module has no Prisma/fetch', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/initialize-2026-team-talent.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(src).not.toMatch(/ODDS_API_KEY/);
  });

  it('27-31. COMMIT uses one atomic transaction; create only; no upsert/skipDuplicates', async () => {
    const { assessment, fbs } = assessHealthy({
      commitRequested: true,
      confirmationValid: true,
    });
    expect(assessment.commitEligible).toBe(true);

    let txCalls = 0;
    const store = new Map<string, ExistingTalentRow>();

    const makeTxStore = (): TalentInitTransactionStore => ({
      async loadFbsTeamIds() {
        return [...fbs];
      },
      async loadExistingTalent() {
        return [...store.values()].sort((a, b) =>
          a.teamId.localeCompare(b.teamId)
        );
      },
      async insertTalentRow(row: TalentCandidateRow) {
        if (store.has(row.teamId)) {
          throw new Error('duplicate insert');
        }
        store.set(row.teamId, {
          season: row.season,
          teamId: row.teamId,
          talentComposite: row.talentComposite,
          blueChipsPct: null,
          sourceUpdatedAt: null,
          fiveStar: 0,
          fourStar: 0,
          threeStar: 0,
          unrated: 0,
        });
        return 1;
      },
    });

    const deps: TalentInitWriteDeps = {
      async transaction(fn) {
        txCalls += 1;
        return fn(makeTxStore());
      },
      async loadExistingTalent() {
        return [...store.values()].sort((a, b) =>
          a.teamId.localeCompare(b.teamId)
        );
      },
      async loadFbsTeamIds() {
        return [...fbs];
      },
    };

    const result = await writeTeamTalent({
      candidates: assessment.candidates,
      expectedFbsIds: fbs,
      deps,
    });
    expect(txCalls).toBe(1);
    expect(result.rowsInserted).toBe(138);
    expect(result.verification.verificationExact).toBe(true);
    expect(result.postCommit.verificationExact).toBe(true);
    expect(store.size).toBe(138);

    const cli = fs.readFileSync(
      path.join(__dirname, '../initialize-2026-team-talent.ts'),
      'utf8'
    );
    expect(cli).toMatch(/teamSeasonTalent\.create/);
    expect(cli).not.toMatch(/\.upsert\s*\(/);
    expect(cli).not.toMatch(/skipDuplicates/);
    expect(cli).not.toMatch(/compute_ratings|ODDS_API_KEY|OddsApi/);
    expect(cli).toMatch(/Serializable/);
  });

  it('29. in-transaction mismatch rolls back (throws)', async () => {
    const { assessment, fbs } = assessHealthy({
      commitRequested: true,
      confirmationValid: true,
    });
    const deps: TalentInitWriteDeps = {
      async transaction(fn) {
        return fn({
          async loadFbsTeamIds() {
            return fbs.slice(0, 137); // mismatch
          },
          async loadExistingTalent() {
            return [];
          },
          async insertTalentRow() {
            return 1;
          },
        });
      },
      async loadExistingTalent() {
        return [];
      },
      async loadFbsTeamIds() {
        return fbs;
      },
    };
    await expect(
      writeTeamTalent({
        candidates: assessment.candidates,
        expectedFbsIds: fbs,
        deps,
      })
    ).rejects.toThrow(/membership mismatch/i);
  });

  it('pre-mutation: bad candidate season/value/null-policy rejected with zero inserts', async () => {
    const { assessment, fbs } = assessHealthy({
      commitRequested: true,
      confirmationValid: true,
    });
    const base = assessment.candidates.map((c) => ({ ...c }));

    const cases: Array<{
      label: string;
      mutate: (rows: TalentCandidateRow[]) => void;
      match: RegExp;
    }> = [
      {
        label: 'season=2025',
        mutate: (rows) => {
          rows[0] = { ...rows[0], season: 2025 };
        },
        match: /candidate season must be 2026/,
      },
      {
        label: 'season=2027',
        mutate: (rows) => {
          rows[0] = { ...rows[0], season: 2027 };
        },
        match: /candidate season must be 2026/,
      },
      {
        label: 'talentComposite=NaN',
        mutate: (rows) => {
          rows[0] = { ...rows[0], talentComposite: Number.NaN };
        },
        match: /talentComposite must be finite/,
      },
      {
        label: 'talentComposite=Infinity',
        mutate: (rows) => {
          rows[0] = { ...rows[0], talentComposite: Number.POSITIVE_INFINITY };
        },
        match: /talentComposite must be finite/,
      },
      {
        label: 'blueChipsPct non-null',
        mutate: (rows) => {
          rows[0] = { ...rows[0], blueChipsPct: 0.5 as unknown as null };
        },
        match: /blueChipsPct must be null/,
      },
      {
        label: 'sourceUpdatedAt non-null',
        mutate: (rows) => {
          rows[0] = {
            ...rows[0],
            sourceUpdatedAt: new Date() as unknown as null,
          };
        },
        match: /sourceUpdatedAt must be null/,
      },
    ];

    for (const c of cases) {
      const candidates = base.map((r) => ({ ...r }));
      c.mutate(candidates);
      let insertCalls = 0;
      let txCalls = 0;
      const deps: TalentInitWriteDeps = {
        async transaction(fn) {
          txCalls += 1;
          return fn({
            async loadFbsTeamIds() {
              return [...fbs];
            },
            async loadExistingTalent() {
              return [];
            },
            async insertTalentRow() {
              insertCalls += 1;
              return 1;
            },
          });
        },
        async loadExistingTalent() {
          return [];
        },
        async loadFbsTeamIds() {
          return [...fbs];
        },
      };
      await expect(
        writeTeamTalent({ candidates, expectedFbsIds: fbs, deps })
      ).rejects.toThrow(c.match);
      expect(insertCalls).toBe(0);
      expect(txCalls).toBe(0);
      expect(() =>
        assertTalentCandidatesIntegrity({
          candidates,
          expectedFbsIds: fbs,
        })
      ).toThrow(c.match);
    }
  });

  it('sanitizer: sensitive connection string never printed on initializer failure', async () => {
    const fbs = buildFbsFixture();
    const sensitive =
      'postgresql://audit_user:SuperSecretPassw0rd@db.example/gridiron CFBD_API_KEY=sk-live-secret';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { exitCode } = await runTalentInitializer({
        season: 2026,
        mode: 'PREVIEW',
        store: {
          async loadFbsTeamIds() {
            return fbs;
          },
          async loadExistingTalent() {
            return [];
          },
        },
        provider: {
          async fetchTalent() {
            throw new Error(sensitive);
          },
        },
        resolveTeamId: buildIdentityResolver(nameMapForFbs(fbs)),
      });
      expect(exitCode).toBe(1);
      const output = errorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(output).toContain(sanitizeTalentInitError());
      expect(output).not.toContain('postgresql://');
      expect(output).not.toContain('SuperSecretPassw0rd');
      expect(output).not.toContain('audit_user');
      expect(output).not.toContain('sk-live-secret');
      expect(output).not.toContain('detail=');
      expect(output).not.toContain(sensitive);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('CLI source no longer prints raw err.message detail', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../initialize-2026-team-talent.ts'),
      'utf8'
    );
    expect(cli).not.toMatch(/detail=\$\{err\.message\}/);
    expect(cli).not.toMatch(/detail=\$\{.*\.message/);
  });

  it('32-34. no ratings/Odds; provider budget exactly 1', () => {
    const { assessment } = assessHealthy({ providerRequestCount: 1 });
    expect(assessment.providerBudgetOk).toBe(true);
    const bad = assessHealthy({ providerRequestCount: 2 }).assessment;
    expect(bad.providerBudgetOk).toBe(false);
    expect(bad.structurallyComplete).toBe(false);

    const wf = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/initialize-2026-team-talent.yml'
      ),
      'utf8'
    );
    expect(wf).toMatch(/workflow_dispatch:/);
    expect(wf).not.toMatch(/^\s*schedule:/m);
    expect(wf).toMatch(/ODDS_API_KEY: not provided/);
    expect(wf).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(wf).toMatch(/ratings: not invoked/);
    expect(wf).toMatch(/providerBudget=1/);
  });
});

describe('legacy hardening', () => {
  it('35-36. legacy talent workflows have no schedule', () => {
    for (const name of ['talent-cfbd.yml', 'talent-roster-sync.yml']) {
      const text = fs.readFileSync(
        path.join(__dirname, '../../../.github/workflows', name),
        'utf8'
      );
      expect(text).toMatch(/workflow_dispatch:/);
      expect(text).not.toMatch(/^\s*schedule:/m);
      expect(text).not.toMatch(/cron:/);
      expect(text).toMatch(/LEGACY/);
    }
  });

  it('37. legacy writer rejects season 2026 before provider call', () => {
    expect(() => assertLegacyTalentWriterSeasonAllowed(2026)).toThrow(
      /guarded initializer/i
    );
    expect(() => assertLegacyTalentWriterSeasonAllowed(2027)).toThrow(
      /refuses season/
    );
  });

  it('38. legacy writer still permits historical ≤2025', () => {
    expect(() => assertLegacyTalentWriterSeasonAllowed(2025)).not.toThrow();
    expect(() => assertLegacyTalentWriterSeasonAllowed(2024)).not.toThrow();
  });
});

describe('verifyStoredTalentRows', () => {
  it('accepts exact 138 stored rows matching candidates', () => {
    const fbs = buildFbsFixture();
    const candidates: TalentCandidateRow[] = fbs.map((id, i) => ({
      season: 2026,
      teamId: id,
      talentComposite: 600 + i,
      blueChipsPct: null,
      sourceUpdatedAt: null,
    }));
    const stored: ExistingTalentRow[] = candidates.map((c) => ({
      season: 2026,
      teamId: c.teamId,
      talentComposite: c.talentComposite,
      blueChipsPct: null,
      sourceUpdatedAt: null,
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      unrated: 0,
    }));
    const v = verifyStoredTalentRows({
      stored,
      candidates,
      rowsInserted: 138,
      fbsIds: fbs,
    });
    expect(v.verificationExact).toBe(true);
  });
});
