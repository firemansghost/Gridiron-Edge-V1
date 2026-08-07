/**
 * Phase 2C-2B — Mocked tests for guarded 2026 FBS membership init.
 * No network. No production DB. No providers.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  APPROVED_2026_ADDITIONS,
  EXPECTED_BASE_FBS_COUNT,
  EXPECTED_CANDIDATE_COUNT,
  WRITE_CONFIRM_PHRASE,
  buildBaseFbsFixture,
  buildCandidateSet,
  buildHealthyMembershipSnapshot,
  parsePreviewMembershipArgs,
  parseWriteMembershipArgs,
  previewFbsMembership,
  verifyMembershipWrite,
  writeFbsMembership,
  type FbsMembershipWriteDeps,
  type MembershipRow,
} from '../src/preseason/fbs-membership-init';
import { sanitizeMembershipRuntimeError } from '../preview-fbs-membership';

describe('parse args', () => {
  it('preview accepts --season 2026 --preview', () => {
    expect(
      parsePreviewMembershipArgs(['--season', '2026', '--preview'])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects wrong season', () => {
    expect(parsePreviewMembershipArgs(['--season', '2025', '--preview']).ok).toBe(
      false
    );
    expect(parseWriteMembershipArgs(['--season', '2025', '--confirm-write', WRITE_CONFIRM_PHRASE]).ok).toBe(
      false
    );
  });

  it('rejects duplicate --season', () => {
    const r = parsePreviewMembershipArgs([
      '--season',
      '2026',
      '--season',
      '2026',
      '--preview',
    ]);
    expect(r.ok).toBe(false);
  });

  it('preview rejects write-related flags', () => {
    const r = parsePreviewMembershipArgs([
      '--season',
      '2026',
      '--preview',
      '--confirm-write',
      WRITE_CONFIRM_PHRASE,
    ]);
    expect(r.ok).toBe(false);
  });

  it('write rejects wrong confirmation', () => {
    const r = parseWriteMembershipArgs([
      '--season',
      '2026',
      '--confirm-write',
      'WRONG',
    ]);
    expect(r.ok).toBe(false);
  });

  it('write accepts exact confirmation', () => {
    expect(
      parseWriteMembershipArgs([
        '--season',
        '2026',
        '--confirm-write',
        WRITE_CONFIRM_PHRASE,
      ])
    ).toEqual({
      ok: true,
      season: 2026,
      confirmWrite: WRITE_CONFIRM_PHRASE,
    });
  });

  it('rejects duplicate --confirm-write with identical phrases', () => {
    const r = parseWriteMembershipArgs([
      '--season',
      '2026',
      '--confirm-write',
      WRITE_CONFIRM_PHRASE,
      '--confirm-write',
      WRITE_CONFIRM_PHRASE,
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors.some((e) => e.includes('--confirm-write may be provided exactly once'))).toBe(
        true
      );
    }
  });

  it('rejects duplicate --confirm-write when wrong then correct', () => {
    const r = parseWriteMembershipArgs([
      '--season',
      '2026',
      '--confirm-write',
      'WRONG',
      '--confirm-write',
      WRITE_CONFIRM_PHRASE,
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors.some((e) => e.includes('--confirm-write may be provided exactly once'))).toBe(
        true
      );
    }
  });

  it('rejects duplicate --confirm-write when correct then wrong', () => {
    const r = parseWriteMembershipArgs([
      '--season',
      '2026',
      '--confirm-write',
      WRITE_CONFIRM_PHRASE,
      '--confirm-write',
      'WRONG',
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors.some((e) => e.includes('--confirm-write may be provided exactly once'))).toBe(
        true
      );
    }
  });
});

describe('candidate construction and preview', () => {
  it('healthy 136 + 2 candidate construction', () => {
    const base = buildBaseFbsFixture();
    const built = buildCandidateSet(base);
    expect(base.length).toBe(EXPECTED_BASE_FBS_COUNT);
    expect(built.candidateIds.length).toBe(EXPECTED_CANDIDATE_COUNT);
    expect(built.candidateIds).toEqual(
      expect.arrayContaining([...APPROVED_2026_ADDITIONS])
    );
  });

  it('exact set equality against schedule yields writeEligible', () => {
    const result = previewFbsMembership(buildHealthyMembershipSnapshot());
    expect(result.candidateCount).toBe(138);
    expect(result.scheduleTeamCount).toBe(138);
    expect(result.exactSetMatch).toBe(true);
    expect(result.existingTargetMembershipCount).toBe(0);
    expect(result.writeEligible).toBe(true);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('schedule missing candidate fails', () => {
    const snap = buildHealthyMembershipSnapshot();
    snap.scheduleTeamIds = snap.scheduleTeamIds.filter(
      (id) => id !== 'north-dakota-state'
    );
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'candidate_absent_from_schedule')
    ).toBe(true);
  });

  it('schedule has unexpected team fails', () => {
    const snap = buildHealthyMembershipSnapshot();
    snap.scheduleTeamIds = [...snap.scheduleTeamIds, 'rogue-team'];
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'schedule_absent_from_candidate')
    ).toBe(true);
  });

  it('explicit addition missing from Team fails', () => {
    const snap = buildHealthyMembershipSnapshot();
    snap.teamIdsPresent = snap.teamIdsPresent.filter(
      (id) => id !== 'sacramento-state'
    );
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'candidate_missing_from_team')
    ).toBe(true);
  });

  it('non-approved extra candidate fails via schedule mismatch path', () => {
    const snap = buildHealthyMembershipSnapshot();
    // Simulate polluted base that sneaks an extra id into candidate construction
    snap.baseFbsIds = [...snap.baseFbsIds, 'non-approved-extra'];
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(result.candidateCount).toBeGreaterThan(138);
  });

  it('existing 2026 membership blocks write', () => {
    const snap = buildHealthyMembershipSnapshot({
      existingTargetMembership: [
        { season: 2026, teamId: 'team-001', level: 'fbs' },
      ],
    });
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'existing_target_membership')
    ).toBe(true);
  });

  it('conflicting existing 2026 membership blocks write', () => {
    const snap = buildHealthyMembershipSnapshot({
      existingTargetMembership: [
        { season: 2026, teamId: 'team-001', level: 'fcs' },
      ],
    });
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'existing_target_non_fbs')
    ).toBe(true);
  });

  it('wrong 2025 base count blocks write', () => {
    const snap = buildHealthyMembershipSnapshot({
      baseFbsIds: buildBaseFbsFixture(135),
    });
    // schedule still 138 from default candidate of 136+2 — mismatch
    const result = previewFbsMembership(snap);
    expect(result.writeEligible).toBe(false);
    expect(
      result.findings.some((f) => f.code === 'wrong_base_fbs_count')
    ).toBe(true);
  });
});

describe('writeFbsMembership', () => {
  /**
   * Fake transaction with commit/rollback semantics:
   * - clone committed rows at start
   * - tx reads/writes hit the clone only
   * - on resolve: copy clone → committed
   * - on throw: discard clone (committed unchanged)
   */
  function makeTransactionalDeps(
    existing: MembershipRow[] = [],
    options: { reportedInsertCount?: number } = {}
  ) {
    let committed: MembershipRow[] = existing.map((r) => ({ ...r }));
    let transactions = 0;
    let outerLoadCalls = 0;
    let txLoadCalls = 0;
    let txCreateCalls = 0;
    let lastCreateRows: Array<{ season: number; teamId: string; level: string }> =
      [];

    const deps: FbsMembershipWriteDeps = {
      async transaction(fn) {
        transactions += 1;
        const working = committed.map((r) => ({ ...r }));
        const txStore = {
          async loadAllMembership(_season: number) {
            txLoadCalls += 1;
            return working.filter((r) => r.season === _season);
          },
          async createMembershipRows(
            rows: Array<{ season: number; teamId: string; level: string }>
          ) {
            txCreateCalls += 1;
            lastCreateRows = rows.map((r) => ({ ...r }));
            for (const r of rows) {
              working.push({ ...r });
            }
            // Optionally lie about insert count while still mutating working copy
            return options.reportedInsertCount ?? rows.length;
          },
        };
        // Narrow surface — only membership load/create (no Team/schedules/etc.)
        expect(Object.keys(txStore).sort()).toEqual([
          'createMembershipRows',
          'loadAllMembership',
        ]);
        try {
          const result = await fn(txStore);
          committed = working.map((r) => ({ ...r }));
          return result;
        } catch (err) {
          // rollback — discard working clone
          return Promise.reject(err);
        }
      },
      async loadAllMembership(season: number) {
        outerLoadCalls += 1;
        return committed.filter((r) => r.season === season).map((r) => ({ ...r }));
      },
    };

    return {
      deps,
      getCommitted: () => committed.map((r) => ({ ...r })),
      getTransactions: () => transactions,
      getOuterLoadCalls: () => outerLoadCalls,
      getTxLoadCalls: () => txLoadCalls,
      getTxCreateCalls: () => txCreateCalls,
      getLastCreateRows: () => lastCreateRows,
    };
  }

  it('write uses exactly one transaction and inserts only membership', async () => {
    const state = makeTransactionalDeps();
    const snap = buildHealthyMembershipSnapshot();
    const result = await writeFbsMembership({
      snapshot: snap,
      deps: state.deps,
    });
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(EXPECTED_CANDIDATE_COUNT);
    expect(state.getTransactions()).toBe(1);
    expect(state.getTxCreateCalls()).toBe(1);
    expect(state.getTxLoadCalls()).toBe(1);
    expect(state.getLastCreateRows()).toHaveLength(EXPECTED_CANDIDATE_COUNT);
    expect(
      state.getLastCreateRows().every(
        (r) => r.season === 2026 && r.level === 'fbs'
      )
    ).toBe(true);
    expect(result.verification?.ok).toBe(true);
    expect(result.verification?.targetFbsCount).toBe(138);
    expect(state.getCommitted()).toHaveLength(EXPECTED_CANDIDATE_COUNT);
  });

  it('insert and emptiness check use only transaction-scoped store', async () => {
    const state = makeTransactionalDeps();
    const snap = buildHealthyMembershipSnapshot();
    const outerBefore = state.getOuterLoadCalls();
    await writeFbsMembership({ snapshot: snap, deps: state.deps });
    // Outer reader used only for post-commit verification (not mutation)
    expect(state.getTxLoadCalls()).toBe(1);
    expect(state.getTxCreateCalls()).toBe(1);
    expect(state.getOuterLoadCalls()).toBe(outerBefore + 1);
    expect(state.getTransactions()).toBe(1);
  });

  it('outer post-write reader is not used for mutation', async () => {
    let mutationPhaseOuterLoads = 0;
    let inTransaction = false;
    let committed: MembershipRow[] = [];
    const deps: FbsMembershipWriteDeps = {
      async transaction(fn) {
        inTransaction = true;
        const working: MembershipRow[] = [];
        const result = await fn({
          async loadAllMembership() {
            return [...working];
          },
          async createMembershipRows(rows) {
            // Prove outer reader was not consulted during mutation
            expect(mutationPhaseOuterLoads).toBe(0);
            working.push(...rows.map((r) => ({ ...r })));
            return rows.length;
          },
        });
        committed = working;
        inTransaction = false;
        return result;
      },
      async loadAllMembership() {
        if (inTransaction) {
          mutationPhaseOuterLoads += 1;
          throw new Error('outer loadAllMembership must not run during transaction');
        }
        return [...committed];
      },
    };
    const result = await writeFbsMembership({
      snapshot: buildHealthyMembershipSnapshot(),
      deps,
    });
    expect(result.ok).toBe(true);
    expect(mutationPhaseOuterLoads).toBe(0);
  });

  it('transaction callback failure prevents commit (rollback)', async () => {
    const state = makeTransactionalDeps();
    const snap = buildHealthyMembershipSnapshot();
    // Force create to throw after emptiness check would pass
    const originalTx = state.deps.transaction.bind(state.deps);
    state.deps.transaction = async (fn) =>
      originalTx(async (tx) => {
        await tx.loadAllMembership(2026);
        throw new Error('simulated mid-transaction failure');
      });

    await expect(
      writeFbsMembership({ snapshot: snap, deps: state.deps })
    ).rejects.toThrow(/simulated mid-transaction failure/);
    expect(state.getCommitted()).toHaveLength(0);
    expect(state.getTxCreateCalls()).toBe(0);
  });

  it('existing membership inside transaction yields zero committed inserts', async () => {
    const preexisting = [
      { season: 2026, teamId: 'team-001', level: 'fbs' },
    ];
    // Snapshot appears empty so preview allows write; DB (committed) already has a row
    const state = makeTransactionalDeps(preexisting);
    const snap = buildHealthyMembershipSnapshot();
    await expect(
      writeFbsMembership({ snapshot: snap, deps: state.deps })
    ).rejects.toThrow(/no longer empty inside transaction/);
    expect(state.getCommitted()).toEqual(preexisting);
    expect(state.getTxCreateCalls()).toBe(0);
    expect(state.getTransactions()).toBe(1);
  });

  it('insert-count mismatch 137 rolls back with zero committed rows', async () => {
    const state = makeTransactionalDeps([], { reportedInsertCount: 137 });
    const outerBefore = state.getOuterLoadCalls();
    await expect(
      writeFbsMembership({
        snapshot: buildHealthyMembershipSnapshot(),
        deps: state.deps,
      })
    ).rejects.toThrow(
      /membership insert count mismatch inside transaction: 137 != 138/
    );
    expect(state.getCommitted()).toHaveLength(0);
    expect(state.getTxCreateCalls()).toBe(1);
    expect(state.getTransactions()).toBe(1);
    // No successful post-commit verification read
    expect(state.getOuterLoadCalls()).toBe(outerBefore);
  });

  it('insert-count mismatch 139 rolls back with zero committed rows', async () => {
    const state = makeTransactionalDeps([], { reportedInsertCount: 139 });
    const outerBefore = state.getOuterLoadCalls();
    await expect(
      writeFbsMembership({
        snapshot: buildHealthyMembershipSnapshot(),
        deps: state.deps,
      })
    ).rejects.toThrow(
      /membership insert count mismatch inside transaction: 139 != 138/
    );
    expect(state.getCommitted()).toHaveLength(0);
    expect(state.getTxCreateCalls()).toBe(1);
    expect(state.getTransactions()).toBe(1);
    expect(state.getOuterLoadCalls()).toBe(outerBefore);
  });

  it('passes exactly 138 rows with season=2026 and level=fbs', async () => {
    const state = makeTransactionalDeps();
    await writeFbsMembership({
      snapshot: buildHealthyMembershipSnapshot(),
      deps: state.deps,
    });
    const rows = state.getLastCreateRows();
    expect(rows).toHaveLength(138);
    expect(new Set(rows.map((r) => r.teamId)).size).toBe(138);
    for (const r of rows) {
      expect(r.season).toBe(2026);
      expect(r.level).toBe('fbs');
    }
  });

  it('rerun-after-success fails safely', async () => {
    const state = makeTransactionalDeps();
    const snap = buildHealthyMembershipSnapshot();
    const first = await writeFbsMembership({ snapshot: snap, deps: state.deps });
    expect(first.ok).toBe(true);
    const second = await writeFbsMembership({
      snapshot: {
        ...snap,
        existingTargetMembership: state.getCommitted(),
      },
      deps: state.deps,
    });
    expect(second.ok).toBe(false);
    expect(second.inserted).toBe(0);
  });

  it('post-write verification success fixture', () => {
    const snap = buildHealthyMembershipSnapshot();
    const written = snap.candidateIds.map((teamId) => ({
      season: 2026,
      teamId,
      level: 'fbs',
    }));
    const v = verifyMembershipWrite({
      writtenMembership: written,
      candidateIds: snap.candidateIds,
      scheduleTeamIds: snap.scheduleTeamIds,
    });
    expect(v.ok).toBe(true);
  });

  it('transaction unavailable refuses write', async () => {
    const snap = buildHealthyMembershipSnapshot();
    const deps: FbsMembershipWriteDeps = {
      transaction: null as unknown as FbsMembershipWriteDeps['transaction'],
      async loadAllMembership() {
        return [];
      },
    };
    await expect(writeFbsMembership({ snapshot: snap, deps })).rejects.toThrow(
      /transaction support unavailable/
    );
  });
});

describe('isolation', () => {
  it('preview source contains no mutation APIs', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/fbs-membership-init.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
    expect(src).not.toMatch(/from ['"].*compute_ratings/);
    expect(src).not.toMatch(/CFBD_API_KEY|ODDS_API_KEY/);

    const preview = fs.readFileSync(
      path.join(__dirname, '../preview-fbs-membership.ts'),
      'utf8'
    );
    expect(preview).toMatch(/findMany/);
    expect(preview).not.toMatch(/createMany|updateMany|upsert|deleteMany/);
  });

  it('writer inserts only TeamMembership via transaction-scoped client', () => {
    const writer = fs.readFileSync(
      path.join(__dirname, '../write-fbs-membership.ts'),
      'utf8'
    );
    expect(writer).toMatch(/\$transaction\(async \(tx\)/);
    expect(writer).toMatch(/tx\.teamMembership\.createMany/);
    expect(writer).toMatch(/tx\.teamMembership\.findMany/);
    expect(writer).not.toMatch(/prisma\.teamMembership\.createMany/);
    expect(writer).not.toMatch(/prisma\.team\.(update|upsert|delete|create)/);
    expect(writer).not.toMatch(/skipDuplicates:\s*true/);
    expect(writer).not.toMatch(/compute_ratings|seed-ratings|seed-talent|OddsApi|cfbdClient/i);
  });

  it('writeFbsMembership mutation path uses only tx store methods', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/fbs-membership-init.ts'),
      'utf8'
    );
    expect(src).toMatch(/transaction\(async \(tx\) => \{/);
    expect(src).toMatch(/await tx\.loadAllMembership\(TARGET_SEASON\)/);
    expect(src).toMatch(
      /const count = await tx\.createMembershipRows\(rows\)/
    );
    expect(src).toMatch(
      /membership insert count mismatch inside transaction/
    );
    expect(src).not.toMatch(/deps\.createMembershipRows/);
    // Inside-transaction emptiness must not use outer deps reader
    expect(src).not.toMatch(
      /transaction\(async \(tx\) => \{[^}]*options\.deps\.loadAllMembership/
    );
  });

  it('secret-safe runtime errors', () => {
    expect(
      sanitizeMembershipRuntimeError({
        message: 'postgresql://user:pass@host/db',
      })
    ).toBe('Database read failed; connection details suppressed');
  });

  it('preview workflow is dispatch-only and read-only', () => {
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/preview-2026-fbs-membership.yml'
      ),
      'utf8'
    );
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).toMatch(/contents:\s*read/);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/preview-fbs-membership\.ts/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).not.toMatch(/secrets\.CFBD_API_KEY/);
  });

  it('write workflow is dispatch-only and confirmation-gated', () => {
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/init-2026-fbs-membership.yml'
      ),
      'utf8'
    );
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/WRITE_2026_FBS_MEMBERSHIP/);
    expect(text).toMatch(/write-fbs-membership\.ts/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).not.toMatch(/compute_ratings|ratings-v1|talent-cfbd|stats-cfbd/);
  });
});
