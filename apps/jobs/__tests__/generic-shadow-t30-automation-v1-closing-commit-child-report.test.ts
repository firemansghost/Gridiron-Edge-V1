/**
 * Adapter tests for summarizeGuardedClosingReport against the real
 * Generic T-30 closing CLI report shape. No provider, DB, or writes.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readGuardedClosingChildReport,
  summarizeGuardedClosingReport,
} from '../src/generic-shadow-t30-automation-v1-closing-commit-adapter';
import {
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
  GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
} from '../../web/lib/shadow-model-t30-closing-v1';

const IDENTITY = { season: 2026, week: 3, captureRunId: 'run-a' };

function cliShapedReport(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    season: 2026,
    week: 3,
    captureRunId: 'run-a',
    modelDefinitionId: 'candidate_b_roster_prior_v1',
    modelDefinitionHash: 'hash',
    captureContext: 'ctx',
    evaluationProtocol: 'CORE_EVAL_V1',
    closingDefinitionId: GENERIC_SHADOW_T30_CLOSING_DEFINITION_ID,
    closingDefinitionHash: GENERIC_SHADOW_T30_CLOSING_DEFINITION_HASH,
    mode: 'COMMIT',
    observedTimestamp: '2026-09-19T19:31:00.000Z',
    writeSafe: true,
    writeBlockers: [],
    counts: {
      totalPredictions: 1,
      existingCount: 0,
      futureCount: 0,
      dueCount: 0,
      missedCount: 0,
      plannedAvailableCount: 1,
      plannedUnavailableCount: 0,
      plannedInsertCount: 1,
    },
    predictions: [],
    rowsToInsert: [],
    confirmationValid: true,
    providerCalls: 0,
    previewTimestampWillNotBecomeCommitTimestamp: true,
    mutationsInvoked: true,
    transactionStarted: true,
    transactionalNoOp: false,
    commitSucceeded: true,
    persistenceCommitted: true,
    rolledBack: false,
    insertedClosingCount: 1,
    insertedClosingIds: ['close-1'],
    verificationOk: true,
    verificationReasons: [],
    isolationLevel: 'Serializable',
    repoCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    marketLineWrites: false,
    ...extra,
  };
}

describe('summarizeGuardedClosingReport against Generic T-30 closing CLI shape', () => {
  it('preserves a successful COMMIT persist and verification', () => {
    const summary = summarizeGuardedClosingReport(cliShapedReport(), IDENTITY);
    expect(summary.persistenceStatus).toBe('PERSISTED');
    expect(summary.persistenceCommitted).toBe(true);
    expect(summary.insertedClosingCount).toBe(1);
    expect(summary.verificationOk).toBe(true);
    expect(summary.providerCalls).toBe(0);
    expect(summary.rolledBack).toBe(false);
  });

  it('treats a transactional no-op EXISTING/MISSED as proven NOT_PERSISTED', () => {
    const summary = summarizeGuardedClosingReport(
      cliShapedReport({
        mutationsInvoked: false,
        transactionalNoOp: true,
        insertedClosingCount: 0,
        insertedClosingIds: [],
        counts: {
          totalPredictions: 1,
          existingCount: 1,
          futureCount: 0,
          dueCount: 0,
          missedCount: 0,
          plannedAvailableCount: 0,
          plannedUnavailableCount: 0,
          plannedInsertCount: 0,
        },
      }),
      IDENTITY
    );
    expect(summary.persistenceStatus).toBe('NOT_PERSISTED');
    expect(summary.mutationsInvoked).toBe(false);
    expect(summary.insertedClosingCount).toBe(0);
    expect(summary.commitSucceeded).toBe(true);
  });

  it('treats rolled-back count mismatch as NOT_PERSISTED, not UNKNOWN', () => {
    const summary = summarizeGuardedClosingReport(
      cliShapedReport({
        persistenceCommitted: false,
        rolledBack: true,
        commitSucceeded: false,
        verificationOk: false,
        insertedClosingCount: 0,
        insertedClosingIds: [],
        verificationReasons: ['in_transaction_closing_count_mismatch'],
        error: 'in_transaction_closing_count_mismatch',
      }),
      IDENTITY
    );
    expect(summary.persistenceStatus).toBe('NOT_PERSISTED');
    expect(summary.rolledBack).toBe(true);
    expect(summary.verificationOk).toBe(false);
    expect(summary.commitSucceeded).toBe(false);
  });

  it('treats a missing child report as UNKNOWN persistence, not proven zero mutation', () => {
    const missingPath = path.join(os.tmpdir(), `missing-closing-child-${Date.now()}.json`);
    const summary = readGuardedClosingChildReport(missingPath, IDENTITY);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.persistenceCommitted).toBeNull();
    expect(summary.mutationsInvoked).toBeNull();
    expect(summary.insertedClosingCount).toBeNull();
    expect(summary.insertedClosingIds).toBeNull();
    expect(summary.commitSucceeded).toBeNull();
    expect(summary.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
    expect(summary.error).toBe('child_report_missing');
  });

  it('treats an unreadable child report as UNKNOWN persistence', () => {
    const tmp = path.join(os.tmpdir(), `unreadable-closing-child-${Date.now()}.json`);
    fs.writeFileSync(tmp, '{not-json', 'utf8');
    try {
      const summary = readGuardedClosingChildReport(tmp, IDENTITY);
      expect(summary.persistenceStatus).toBe('UNKNOWN');
      expect(summary.insertedClosingCount).toBeNull();
      expect(summary.insertedClosingIds).toBeNull();
      expect(summary.blockers).toEqual(expect.arrayContaining(['persistence_state_unknown']));
      expect(String(summary.error)).toContain('child_report_unreadable');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('treats a parsed report without mutationsInvoked proof as UNKNOWN', () => {
    const summary = summarizeGuardedClosingReport({ hello: 'world' }, IDENTITY);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.mutationsInvoked).toBeNull();
    expect(summary.insertedClosingCount).toBeNull();
    expect(summary.insertedClosingIds).toBeNull();
  });

  it('does not attribute a report with the wrong captureRunId', () => {
    const summary = summarizeGuardedClosingReport(
      cliShapedReport({ captureRunId: 'run-stale' }),
      IDENTITY
    );
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.insertedClosingCount).toBeNull();
    expect(summary.insertedClosingIds).toBeNull();
    expect(summary.error).toBe('child_report_identity_mismatch:captureRunId');
  });

  it('does not attribute a report with the wrong week', () => {
    const summary = summarizeGuardedClosingReport(cliShapedReport({ week: 4 }), IDENTITY);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.error).toBe('child_report_identity_mismatch:week');
  });

  it('does not attribute a report with the wrong closingDefinitionHash', () => {
    const summary = summarizeGuardedClosingReport(
      cliShapedReport({ closingDefinitionHash: 'deadbeef' }),
      IDENTITY
    );
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.error).toBe('child_report_identity_mismatch:closingDefinitionHash');
  });

  it('does not attribute a report with the wrong mode', () => {
    const summary = summarizeGuardedClosingReport(cliShapedReport({ mode: 'PLAN' }), IDENTITY);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.error).toBe('child_report_identity_mismatch:mode');
  });

  it('does not attribute a report missing a required identity field', () => {
    const raw = cliShapedReport();
    delete raw.evaluationProtocol;
    const summary = summarizeGuardedClosingReport(raw, IDENTITY);
    expect(summary.persistenceStatus).toBe('UNKNOWN');
    expect(summary.error).toBe('child_report_identity_missing:evaluationProtocol');
  });

  it('preserves a nonzero providerCalls value instead of normalizing it to zero', () => {
    const summary = summarizeGuardedClosingReport(cliShapedReport({ providerCalls: 2 }), IDENTITY);
    expect(summary.providerCalls).toBe(2);
    expect(summary.writeSafe).toBe(false);
    expect(summary.blockers).toContain('child_provider_calls_nonzero');
    expect(summary.persistenceStatus).toBe('PERSISTED');
    expect(summary.insertedClosingCount).toBe(1);
  });

  it('preserves commitSucceeded=true on a successful persist', () => {
    const summary = summarizeGuardedClosingReport(cliShapedReport(), IDENTITY);
    expect(summary.commitSucceeded).toBe(true);
    expect(summary.persistenceStatus).toBe('PERSISTED');
  });
});
