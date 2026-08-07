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
  function makeDeps(existing: MembershipRow[] = []) {
    let rows = [...existing];
    let transactions = 0;
    const deps: FbsMembershipWriteDeps = {
      async transaction(fn) {
        transactions += 1;
        return fn();
      },
      async createMembershipRows(input) {
        for (const r of input) {
          rows.push({ ...r });
        }
        return input.length;
      },
      async loadAllMembership() {
        return [...rows];
      },
    };
    return {
      deps,
      getRows: () => rows,
      getTransactions: () => transactions,
    };
  }

  it('write uses exactly one transaction and inserts only membership', async () => {
    const state = makeDeps();
    const snap = buildHealthyMembershipSnapshot();
    const result = await writeFbsMembership({
      snapshot: snap,
      deps: state.deps,
    });
    expect(result.ok).toBe(true);
    expect(result.inserted).toBe(EXPECTED_CANDIDATE_COUNT);
    expect(state.getTransactions()).toBe(1);
    expect(result.verification?.ok).toBe(true);
    expect(result.verification?.targetFbsCount).toBe(138);
  });

  it('rerun-after-success fails safely', async () => {
    const state = makeDeps();
    const snap = buildHealthyMembershipSnapshot();
    const first = await writeFbsMembership({ snapshot: snap, deps: state.deps });
    expect(first.ok).toBe(true);
    const second = await writeFbsMembership({
      snapshot: {
        ...snap,
        existingTargetMembership: state.getRows(),
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
      // intentionally invalid
      transaction: null as unknown as FbsMembershipWriteDeps['transaction'],
      async createMembershipRows() {
        return 0;
      },
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

  it('writer inserts only TeamMembership', () => {
    const writer = fs.readFileSync(
      path.join(__dirname, '../write-fbs-membership.ts'),
      'utf8'
    );
    expect(writer).toMatch(/teamMembership\.createMany/);
    expect(writer).not.toMatch(/prisma\.team\.(update|upsert|delete|create)/);
    expect(writer).not.toMatch(/compute_ratings|seed-ratings|seed-talent|OddsApi|cfbdClient/i);
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
