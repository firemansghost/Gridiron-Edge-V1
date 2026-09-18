/**
 * Adapter tests for summarizeGuardedLiveOddsReport against the real
 * finalizeLiveOddsReport() artifact shape. No provider, DB, or writes.
 */

import {
  buildCommittedVerificationFailureExecution,
  buildFailedCommitExecution,
  buildSuccessfulCommitExecution,
  finalizeLiveOddsReport,
  type LiveOddsPlan,
  type LiveOddsPostWriteVerification,
} from '../src/odds/live-odds-2026';
import {
  readGuardedLiveOddsChildReport,
  summarizeGuardedLiveOddsReport,
} from '../src/generic-shadow-t30-automation-v1-market-refresh-adapter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function planFixture(overrides: Partial<LiveOddsPlan> = {}): LiveOddsPlan {
  return {
    season: 2026,
    week: 3,
    mode: 'COMMIT',
    expectedConfirmation: 'WRITE_2026_WEEK_3_ODDS',
    confirmationValid: true,
    providerCalls: 1,
    providerUsage: {
      requestsLast: '1',
      requestsUsed: '10',
      requestsRemaining: '90',
    },
    requestCreditsLast: 1,
    authoritativeFbsCount: 138,
    scheduledGameCount: 1,
    eventDiagnostics: [],
    eventCounts: {
      matched_requested_week: 1,
      out_of_requested_week: 0,
      out_of_scope_fbs_fcs: 0,
      unresolved_team: 0,
      unresolved_expected_fbs: 0,
      unmatched_both_fbs: 0,
      ambiguous: 0,
      week_mismatch: 0,
      fuzzy_required: 0,
    },
    rejectedSnapshots: [],
    candidates: [],
    candidateDuplicatesCollapsed: 0,
    fingerprintCollisions: 0,
    existingRows: 0,
    proposedInsert: [],
    existingIdentical: 0,
    existingCollisions: 0,
    coverage: {
      gamesWithAnyOdds: [],
      gamesWithSpread: [],
      gamesWithTotal: [],
      gamesWithMoneyline: [],
      gamesWithoutAnyOdds: ['game-1'],
      gamesWithoutSpread: ['game-1'],
      gamesWithoutTotal: ['game-1'],
      gamesWithoutMoneyline: ['game-1'],
      uniqueBookmakers: [],
    },
    writeSafe: true,
    writeBlockers: [],
    productionOddsWriteAuthorizedByThisPhase: false,
    betsWriteAuthorized: false,
    ratingsWriteAuthorized: false,
    schedulesWriteAuthorized: false,
    scoresWriteAuthorized: false,
    unitGradesWriteAuthorized: false,
    previewConsumesOddsApiCredits: true,
    previewDbReadOnly: false,
    appendOnly: true,
    kickoffMatchToleranceMs: 0,
    ...overrides,
  } as LiveOddsPlan;
}

function passedVerification(): LiveOddsPostWriteVerification {
  return {
    expectedInsertCount: 4,
    createManyCount: 4,
    totalRowsAfter: 4,
    distinctGamesAfter: 1,
    spreadsAfter: 2,
    totalsAfter: 1,
    moneylinesAfter: 1,
    distinctBooksAfter: 1,
    insertedFingerprintsExpected: ['fp-1', 'fp-2', 'fp-3', 'fp-4'],
    insertedFingerprintsFound: ['fp-1', 'fp-2', 'fp-3', 'fp-4'],
    missingInsertedFingerprints: [],
    conflictingInsertedFingerprints: [],
    ok: true,
    reasons: [],
  };
}

describe('summarizeGuardedLiveOddsReport against finalizeLiveOddsReport shape', () => {
  it('preserves a successful COMMIT: one provider call, persistence, inserted count, credits, verification.ok', () => {
    const raw = finalizeLiveOddsReport({
      plan: planFixture({
        proposedInsert: [{ gameId: 'g1' }, { gameId: 'g1' }, { gameId: 'g1' }, { gameId: 'g1' }] as LiveOddsPlan['proposedInsert'],
      }),
      execution: buildSuccessfulCommitExecution({
        proposedBeforeTransaction: 4,
        stillNewAtTransaction: 4,
        createManyCount: 4,
        postWriteVerificationSucceeded: true,
      }),
      verification: passedVerification(),
      meta: { endpoint: 'live' },
    });

    const summary = summarizeGuardedLiveOddsReport(raw, 0);
    expect(summary.providerCalls).toBe(1);
    expect(summary.providerCallSucceeded).toBe(true);
    expect(summary.persistenceStatus).toBe('PERSISTED');
    expect(summary.persistenceInvoked).toBe(true);
    expect(summary.insertedCount).toBe(4);
    expect(summary.proposedInsertCount).toBe(4);
    expect(summary.verificationOk).toBe(true);
    expect(summary.postwriteVerificationStatus).toBe('PASSED');
    expect(summary.providerCredits).toEqual({
      requestsLast: '1',
      requestsUsed: '10',
      requestsRemaining: '90',
      requestCreditsLast: 1,
    });
    expect(summary.writeSafe).toBe(true);
  });

  it('preserves blocked COMMIT after a successful provider response without claiming persistence', () => {
    const raw = finalizeLiveOddsReport({
      plan: planFixture({
        writeSafe: false,
        writeBlockers: ['unresolved_expected_fbs:East Texas A&M'],
        confirmationValid: false,
        proposedInsert: [],
      }),
      execution: buildFailedCommitExecution({
        proposedBeforeTransaction: 0,
        error: 'COMMIT blocked — see writeBlockers / confirmation',
      }),
      verification: null,
    });

    const summary = summarizeGuardedLiveOddsReport(raw, 1);
    expect(summary.providerCalls).toBe(1);
    expect(summary.providerCallSucceeded).toBe(true);
    expect(summary.writeSafe).toBe(false);
    expect(summary.blockers).toContain('unresolved_expected_fbs:East Texas A&M');
    expect(summary.persistenceStatus).toBe('NOT_PERSISTED');
    expect(summary.persistenceInvoked).toBe(false);
    expect(summary.postwriteVerificationStatus).toBe('COMMIT_BLOCKED');
  });

  it('retains inserted count and FAILED verification after committed persistence', () => {
    const verification = {
      ...passedVerification(),
      ok: false,
      missingInsertedFingerprints: ['fp-4'],
      insertedFingerprintsFound: ['fp-1', 'fp-2', 'fp-3'],
      reasons: ['missing 1 expected inserted fingerprint(s)'],
    };
    const raw = finalizeLiveOddsReport({
      plan: planFixture({
        proposedInsert: [{ gameId: 'g1' }, { gameId: 'g1' }, { gameId: 'g1' }, { gameId: 'g1' }] as LiveOddsPlan['proposedInsert'],
      }),
      execution: buildCommittedVerificationFailureExecution({
        proposedBeforeTransaction: 4,
        stillNewAtTransaction: 4,
        createManyCount: 4,
        error: 'post-write verification failed: missing 1 expected inserted fingerprint(s)',
      }),
      verification,
    });

    const summary = summarizeGuardedLiveOddsReport(raw, 1);
    expect(summary.persistenceStatus).toBe('PERSISTED');
    expect(summary.persistenceInvoked).toBe(true);
    expect(summary.insertedCount).toBe(4);
    expect(summary.verificationOk).toBe(false);
    expect(summary.postwriteVerificationStatus).toBe('FAILED');
  });

  it('treats a missing child report as UNKNOWN persistence, not proven false', () => {
    const missingPath = path.join(
      os.tmpdir(),
      `missing-live-odds-child-${Date.now()}.json`
    );
    const summary = readGuardedLiveOddsChildReport(missingPath, 1);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.persistenceInvoked).toBeNull();
    expect(summary.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
    expect(summary.blockers).toEqual(expect.arrayContaining(['child_report_missing']));
    expect(summary.error).toBe('child_report_missing');
  });

  it('treats an unreadable child report as UNKNOWN persistence, not proven false', () => {
    const tmp = path.join(os.tmpdir(), `unreadable-live-odds-child-${Date.now()}.json`);
    fs.writeFileSync(tmp, '{not-json', 'utf8');
    try {
      const summary = readGuardedLiveOddsChildReport(tmp, 1);
      expect(summary.persistenceStatus).toBe('UNKNOWN');
      expect(summary.persistenceInvoked).toBeNull();
      expect(summary.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
      expect(String(summary.error)).toContain('child_report_unreadable');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('treats a parsed report without execution persistence proof as UNKNOWN', () => {
    const summary = summarizeGuardedLiveOddsReport({ hello: 'world' }, 1);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.persistenceInvoked).toBeNull();
    expect(summary.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
  });
});
