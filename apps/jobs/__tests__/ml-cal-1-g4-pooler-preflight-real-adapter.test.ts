/**
 * Offline mocked-Prisma tests for the G4 pooler preflight real metadata adapter.
 * No DB, credentials, env reads, providers, or live connections.
 */

import { Prisma } from '@prisma/client';
import {
  createG4PoolerPreflightRealAdapter,
  isAllowlistedPreflightSql,
  ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL,
  ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL,
  ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS,
  ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS,
  ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS,
  validatePreflightMetadataRows,
  type MlCal1G4PreflightParentPrismaClient,
  type MlCal1G4PreflightTxPrismaClient,
} from '../lib/ml-cal-1-g4-pooler-preflight-real-adapter';
import {
  createMockPreflightTxAdapter,
  runG4FixturePreflight,
} from '../lib/ml-cal-1-g4-pooler-preflight-fixture';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DB_TS = '2026-10-13T18:00:05.000Z';

function goodRow(overrides: Record<string, unknown> = {}) {
  return {
    transaction_isolation: 'repeatable read',
    transaction_read_only: 'on',
    transaction_timestamp: new Date(DB_TS),
    clock_timestamp: new Date(DB_TS),
    statement_timestamp: new Date(DB_TS),
    ...overrides,
  };
}

type TraceEntry =
  | { kind: 'transaction_open'; options: unknown; txId: symbol }
  | { kind: 'execute'; txId: symbol; sql: unknown }
  | { kind: 'query'; txId: symbol; sql: unknown }
  | { kind: 'parent_forbidden'; method: string };

function createMockParent(config: {
  rows?: unknown;
  failOpen?: boolean;
  failSetRo?: boolean;
  failMetadata?: boolean;
  rejectAfterCallback?: boolean;
  onExecute?: (sql: unknown) => void;
  onQuery?: (sql: unknown) => void;
}): {
  prisma: MlCal1G4PreflightParentPrismaClient & {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  trace: TraceEntry[];
  txClients: MlCal1G4PreflightTxPrismaClient[];
} {
  const trace: TraceEntry[] = [];
  const txClients: MlCal1G4PreflightTxPrismaClient[] = [];

  const parentForbidden = (method: string) => {
    const fn = jest.fn(async () => {
      trace.push({ kind: 'parent_forbidden', method });
      throw new Error(`parent_${method}_forbidden`);
    });
    return fn;
  };

  const prisma = {
    $queryRaw: parentForbidden('$queryRaw'),
    $executeRaw: parentForbidden('$executeRaw'),
    $transaction: jest.fn(
      async (
        fn: (tx: MlCal1G4PreflightTxPrismaClient) => Promise<unknown>,
        options: unknown
      ) => {
        if (config.failOpen) {
          // Synthetic token assembled without a literal credential assignment in source.
          const synTok = ['syn', 'token', 'openFAIL99'].join('.');
          const synBearer = ['Bearer', synTok].join(' ');
          const synAuth = ['Authorization:', synBearer].join(' ');
          const synPg = ['postgres', '://u:p@h/db'].join('');
          throw new Error(`${synAuth} connection=${synPg}`);
        }
        const txId = Symbol('tx');
        trace.push({ kind: 'transaction_open', options, txId });
        const tx: MlCal1G4PreflightTxPrismaClient = {
          $executeRaw: jest.fn(async (sql: unknown) => {
            if (!isAllowlistedPreflightSql(sql)) {
              throw new Error('sql_not_allowlisted');
            }
            trace.push({ kind: 'execute', txId, sql });
            config.onExecute?.(sql);
            if (config.failSetRo) {
              throw new Error('set_ro_failed');
            }
            return 0;
          }),
          $queryRaw: jest.fn(async (sql: unknown) => {
            if (!isAllowlistedPreflightSql(sql)) {
              throw new Error('sql_not_allowlisted');
            }
            trace.push({ kind: 'query', txId, sql });
            config.onQuery?.(sql);
            if (config.failMetadata) {
              throw new Error('metadata_query_failed');
            }
            return config.rows ?? [goodRow()];
          }),
        };
        txClients.push(tx);
        const result = await fn(tx);
        if (config.rejectAfterCallback) {
          throw new Error('transaction_lost_after_metadata');
        }
        return result;
      }
    ),
  };

  return {
    prisma: prisma as unknown as MlCal1G4PreflightParentPrismaClient & {
      $queryRaw: jest.Mock;
      $executeRaw: jest.Mock;
    },
    trace,
    txClients,
  };
}

function clockAround(dbIso: string): () => Date {
  const dbMs = Date.parse(dbIso);
  let n = 0;
  return () => {
    const offsets = [-2000, 2000, 3000];
    return new Date(dbMs + offsets[Math.min(n++, offsets.length - 1)]);
  };
}

describe('ML-CAL-1 G4 pooler preflight real adapter — gate / passive', () => {
  it('disabled/default gate: zero transaction, query, connection, or env activity', async () => {
    const envKeysBefore = Object.keys(process.env).length;
    const { prisma, trace } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: false,
    });
    expect(adapter.enabled).toBe(false);
    await expect(
      adapter.withRepeatableReadTransaction(async () => null)
    ).rejects.toThrow(/preflight_adapter_disabled/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(trace).toEqual([]);
    expect(Object.keys(process.env).length).toBe(envKeysBefore);
  });

  it('missing/invalid enablement refuses without Prisma activity', async () => {
    const { prisma } = createMockParent({});
    for (const enabled of [undefined, null, 0, 'true', {}, []] as unknown[]) {
      const adapter = createG4PoolerPreflightRealAdapter({
        prisma,
        enabled,
      });
      await expect(
        adapter.withRepeatableReadTransaction(async () => 'x')
      ).rejects.toThrow(/preflight_adapter_disabled/);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('passive construction/import: no client startup or credential dependency', () => {
    const { prisma } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    expect(adapter.kind).toContain('real-adapter');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    // Module must not reference DATABASE_URL assignment patterns in runtime path
    // beyond redaction helpers (covered by CI secret-free scan).
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — ordering / options', () => {
  it('exact ordering and same-client identity; parent query methods throw if touched', async () => {
    const { prisma, trace, txClients } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });

    const meta = await adapter.withRepeatableReadTransaction(async (client) => {
      await client.setTransactionReadOnly();
      return client.queryTransactionMetadata();
    });

    expect(meta.transactionIsolation.toLowerCase()).toBe('repeatable read');
    expect(meta.transactionReadOnly.toLowerCase()).toBe('on');
    expect(meta.transactionTimestamp).toBe(DB_TS);

    expect(trace.map((t) => t.kind)).toEqual([
      'transaction_open',
      'execute',
      'query',
    ]);
    const open = trace[0] as Extract<TraceEntry, { kind: 'transaction_open' }>;
    const exec = trace[1] as Extract<TraceEntry, { kind: 'execute' }>;
    const query = trace[2] as Extract<TraceEntry, { kind: 'query' }>;
    expect(exec.txId).toBe(open.txId);
    expect(query.txId).toBe(open.txId);
    expect(exec.sql).toBe(ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL);
    expect(query.sql).toBe(ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL);

    expect(txClients).toHaveLength(1);
    await expect(prisma.$queryRaw(Prisma.sql`SELECT 1`)).rejects.toThrow(
      /parent_\$queryRaw_forbidden/
    );
    await expect(prisma.$executeRaw(Prisma.sql`SELECT 1`)).rejects.toThrow(
      /parent_\$executeRaw_forbidden/
    );
  });

  it('transaction options pinned by explicit assertions', async () => {
    const { prisma, trace } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    expect(adapter.transactionOptions).toEqual(ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS);
    expect(adapter.transactionOptions.maxWait).toBe(
      ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS
    );
    expect(adapter.transactionOptions.timeout).toBe(
      ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS
    );
    expect(adapter.transactionOptions.isolationLevel).toBe(
      Prisma.TransactionIsolationLevel.RepeatableRead
    );

    await adapter.withRepeatableReadTransaction(async (c) => {
      await c.setTransactionReadOnly();
      return c.queryTransactionMetadata();
    });
    const open = trace[0] as Extract<TraceEntry, { kind: 'transaction_open' }>;
    expect(open.options).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 15_000,
    });
  });

  it('business/DDL/mutation SQL rejected by strict allowlist mocks', async () => {
    expect(isAllowlistedPreflightSql(Prisma.sql`SELECT * FROM "TeamSeasonRating"`)).toBe(
      false
    );
    expect(isAllowlistedPreflightSql(Prisma.sql`DELETE FROM "Game"`)).toBe(false);
    expect(
      isAllowlistedPreflightSql(ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL)
    ).toBe(true);
    expect(
      isAllowlistedPreflightSql(ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL)
    ).toBe(true);
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — metadata validation', () => {
  it('wrong isolation / READ ONLY → structured rejection', async () => {
    const badIso = createMockParent({
      rows: [goodRow({ transaction_isolation: 'read committed' })],
    });
    const a1 = createG4PoolerPreflightRealAdapter({
      prisma: badIso.prisma,
      enabled: true,
    });
    await expect(
      a1.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/isolation_not_repeatable_read/);

    const badRo = createMockParent({
      rows: [goodRow({ transaction_read_only: 'off' })],
    });
    const a2 = createG4PoolerPreflightRealAdapter({
      prisma: badRo.prisma,
      enabled: true,
    });
    await expect(
      a2.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/transaction_not_read_only/);
  });

  it('missing row / extra rows / null / array / incorrect scalar / invalid timestamp', () => {
    expect(() => validatePreflightMetadataRows([])).toThrow(/metadata_row_missing/);
    expect(() => validatePreflightMetadataRows([goodRow(), goodRow()])).toThrow(
      /metadata_row_cardinality/
    );
    expect(() => validatePreflightMetadataRows(null)).toThrow(
      /metadata_rows_not_array/
    );
    expect(() => validatePreflightMetadataRows('x')).toThrow(
      /metadata_rows_not_array/
    );
    expect(() => validatePreflightMetadataRows([[]])).toThrow(
      /metadata_row_not_object/
    );
    expect(() =>
      validatePreflightMetadataRows([
        goodRow({ transaction_isolation: 1 }),
      ])
    ).toThrow(/transaction_isolation_type_invalid/);
    expect(() =>
      validatePreflightMetadataRows([
        goodRow({ transaction_timestamp: 'not-a-timestamp' }),
      ])
    ).toThrow(/transaction_timestamp_invalid/);
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — failures', () => {
  it('open / set RO / metadata / post-callback reject leave no successful output', async () => {
    const openFail = createMockParent({ failOpen: true });
    const aOpen = createG4PoolerPreflightRealAdapter({
      prisma: openFail.prisma,
      enabled: true,
    });
    await expect(
      aOpen.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow();

    const roFail = createMockParent({ failSetRo: true });
    const aRo = createG4PoolerPreflightRealAdapter({
      prisma: roFail.prisma,
      enabled: true,
    });
    await expect(
      aRo.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/set_ro_failed/);

    const metaFail = createMockParent({ failMetadata: true });
    const aMeta = createG4PoolerPreflightRealAdapter({
      prisma: metaFail.prisma,
      enabled: true,
    });
    await expect(
      aMeta.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/metadata_query_failed/);

    const after = createMockParent({ rejectAfterCallback: true });
    const aAfter = createG4PoolerPreflightRealAdapter({
      prisma: after.prisma,
      enabled: true,
    });
    await expect(
      aAfter.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/transaction_lost_after_metadata/);
  });

  it('redacts synthetic bearer/connection-string from adapter errors', async () => {
    const { prisma } = createMockParent({ failOpen: true });
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    try {
      await adapter.withRepeatableReadTransaction(async () => null);
      throw new Error('expected failure');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain('openFAIL99');
      expect(msg).not.toMatch(/postgres:\/\//i);
      expect(msg).toMatch(/\[redacted\]/i);
    }
  });

  it('no automatic retries: single $transaction invocation on failure', async () => {
    const { prisma } = createMockParent({ failOpen: true });
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async () => null)
    ).rejects.toThrow();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — F1 sequence latches', () => {
  it('rejects metadata query before successful READ ONLY', async () => {
    const { prisma, trace } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async (c) =>
        c.queryTransactionMetadata()
      )
    ).rejects.toThrow(/read_only_not_set_before_metadata/);
    expect(trace.map((t) => t.kind)).toEqual(['transaction_open']);
    expect(trace.some((t) => t.kind === 'query')).toBe(false);
  });

  it('rejects when callback omits metadata query', async () => {
    const { prisma } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return { skipped: true };
      })
    ).rejects.toThrow(/metadata_not_obtained/);
  });

  it('swallowed SET READ ONLY failure cannot yield successful TX output', async () => {
    const { prisma } = createMockParent({ failSetRo: true });
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async (c) => {
        try {
          await c.setTransactionReadOnly();
        } catch {
          /* swallow */
        }
        return { ok: true };
      })
    ).rejects.toThrow(/set_ro_failed/);
  });

  it('swallowed metadata failure cannot yield successful TX output', async () => {
    const { prisma } = createMockParent({ failMetadata: true });
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        try {
          await c.queryTransactionMetadata();
        } catch {
          /* swallow */
        }
        return { ok: true };
      })
    ).rejects.toThrow(/metadata_query_failed/);
  });

  it('transaction rejection after callback still fails closed', async () => {
    const { prisma } = createMockParent({ rejectAfterCallback: true });
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    await expect(
      adapter.withRepeatableReadTransaction(async (c) => {
        await c.setTransactionReadOnly();
        return c.queryTransactionMetadata();
      })
    ).rejects.toThrow(/transaction_lost_after_metadata/);
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — F2 immutable gate/options', () => {
  it('mutating caller options after construction cannot re-enable a disabled adapter', async () => {
    const { prisma } = createMockParent({});
    const options = { prisma, enabled: false as unknown };
    const adapter = createG4PoolerPreflightRealAdapter(options);
    expect(adapter.enabled).toBe(false);
    options.enabled = true;
    expect(adapter.enabled).toBe(false);
    await expect(
      adapter.withRepeatableReadTransaction(async () => null)
    ).rejects.toThrow(/preflight_adapter_disabled/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mutating caller options after construction cannot disable an enabled adapter', async () => {
    const { prisma } = createMockParent({});
    const options = { prisma, enabled: true as unknown };
    const adapter = createG4PoolerPreflightRealAdapter(options);
    expect(adapter.enabled).toBe(true);
    options.enabled = false;
    expect(adapter.enabled).toBe(true);
    const meta = await adapter.withRepeatableReadTransaction(async (c) => {
      await c.setTransactionReadOnly();
      return c.queryTransactionMetadata();
    });
    expect(meta.transactionTimestamp).toBe(DB_TS);
  });

  it('pinned transaction options resist runtime mutation', async () => {
    const { prisma, trace } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    const opts = adapter.transactionOptions as {
      maxWait: number;
      timeout: number;
      isolationLevel: Prisma.TransactionIsolationLevel;
    };
    expect(() => {
      opts.maxWait = 1;
    }).toThrow();
    expect(() => {
      opts.timeout = 1;
    }).toThrow();
    expect(adapter.transactionOptions.maxWait).toBe(
      ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS
    );
    expect(adapter.transactionOptions.timeout).toBe(
      ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS
    );

    // Module-level freeze also resists mutation.
    const shared = ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS as {
      maxWait: number;
    };
    expect(() => {
      shared.maxWait = 999;
    }).toThrow();

    await adapter.withRepeatableReadTransaction(async (c) => {
      await c.setTransactionReadOnly();
      return c.queryTransactionMetadata();
    });
    const open = trace[0] as Extract<TraceEntry, { kind: 'transaction_open' }>;
    expect(open.options).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 15_000,
    });
  });
});

describe('ML-CAL-1 G4 pooler preflight real adapter — fixture compatibility', () => {
  it('existing fixture mock path unchanged; mock success is not deployed acceptance', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'g4-preflight-real-compat-')
    );
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-compat-real',
      retainRoot: root,
      txAdapter: createMockPreflightTxAdapter({
        transactionTimestamp: DB_TS,
      }),
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.fixtureProvenance).toBe(true);
    const prov = JSON.parse(
      fs.readFileSync(path.join(r.packageDir!, 'PROVENANCE.json'), 'utf8')
    );
    expect(prov.deployedPoolerProof).toBe(false);
  });

  it('enabled real adapter plugs into fixture runner timing (caller-owned)', async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'g4-preflight-real-run-')
    );
    const { prisma } = createMockParent({});
    const adapter = createG4PoolerPreflightRealAdapter({
      prisma,
      enabled: true,
    });
    const r = await runG4FixturePreflight({
      mode: 'fixture',
      preflightId: 'preflight-real-plug',
      retainRoot: root,
      txAdapter: adapter,
      now: clockAround(DB_TS),
    });
    expect(r.ok).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.dbTransactionTime).toBe(DB_TS);
    expect(r.readMode).toBe('fixture_injected');
    // Still fixture provenance from runner — adapter does not mint live acceptance
    expect(r.fixtureProvenance).toBe(true);
  });
});
