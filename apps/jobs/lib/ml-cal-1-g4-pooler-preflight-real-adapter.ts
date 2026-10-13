/**
 * ML-CAL-1 G4 pooler preflight — real metadata-only Prisma TX adapter (offline).
 *
 * Implements the accepted P-PREFLIGHT TX contract against an *injected* narrow
 * Prisma-client interface. Construction is passive: no PrismaClient creation,
 * env/credential reads, connect, query, or transaction at import/factory time.
 *
 * Default execution is disabled. `enabled: true` is a testable gate only — this
 * module does not authorize live pooler execution, CLI dispatch, or workflows.
 *
 * Timing ownership: host-start ≤ dbTransactionTime ≤ host-end remains with the
 * accepted P-PREFLIGHT caller (e.g. fixture runner). This adapter returns
 * validated metadata observations only.
 *
 * Design: research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md
 * Design SHA-256 (git/LF): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 * Base #253 tip: 7375d9ba1b3e8c1d5b0b337958b537cc0334fc10
 */

import { Prisma } from '@prisma/client';
import {
  MlCal1G4PreflightTxAdapter,
  MlCal1G4PreflightTxClient,
  MlCal1G4PreflightTxMetadata,
  redactError,
} from './ml-cal-1-g4-pooler-preflight-fixture';

// ---------------------------------------------------------------------------
// Constants — fixed SQL allowlist + pinned TX options
// ---------------------------------------------------------------------------

export const ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND =
  'ml-cal-1-g4-pooler-preflight-real-adapter-v1' as const;

export const ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN =
  '55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f' as const;

export const ML_CAL_1_G4_PREFLIGHT_BASE_253_TIP =
  '7375d9ba1b3e8c1d5b0b337958b537cc0334fc10' as const;

/**
 * Interactive TX bounds for metadata-only preflight.
 * - maxWait 10s matches existing initializer conventions (talent/conferences).
 * - timeout 15s is intentionally tighter than write paths (30–120s): RO metadata
 *   must complete quickly; Prisma default timeout is 5s which is too tight under
 *   pooler acquire pressure, so we raise modestly while remaining bounded.
 */
export const ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS = 10_000 as const;
export const ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS = 15_000 as const;

export const ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS,
  timeout: ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS,
} as const;

/** Exact allowlisted SET — no interpolation. */
export const ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_SQL =
  'SET TRANSACTION READ ONLY' as const;

/**
 * Exact allowlisted metadata SELECT — no interpolation, no business tables.
 * Aliases match adapter field names for stable mapping.
 */
export const ML_CAL_1_G4_PREFLIGHT_METADATA_SQL =
  "SELECT current_setting('transaction_isolation') AS transaction_isolation, current_setting('transaction_read_only') AS transaction_read_only, transaction_timestamp() AS transaction_timestamp, clock_timestamp() AS clock_timestamp, statement_timestamp() AS statement_timestamp" as const;

export const ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL = Prisma.sql`
SET TRANSACTION READ ONLY
`;

export const ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL = Prisma.sql`
SELECT
  current_setting('transaction_isolation') AS transaction_isolation,
  current_setting('transaction_read_only') AS transaction_read_only,
  transaction_timestamp() AS transaction_timestamp,
  clock_timestamp() AS clock_timestamp,
  statement_timestamp() AS statement_timestamp
`;

// ---------------------------------------------------------------------------
// Narrow Prisma surfaces (injected; never constructed here)
// ---------------------------------------------------------------------------

export interface MlCal1G4PreflightTxPrismaClient {
  $executeRaw: (query: Prisma.Sql) => Promise<unknown>;
  $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
}

export interface MlCal1G4PreflightParentPrismaClient {
  $transaction: <T>(
    fn: (tx: MlCal1G4PreflightTxPrismaClient) => Promise<T>,
    options: {
      isolationLevel: Prisma.TransactionIsolationLevel;
      maxWait: number;
      timeout: number;
    }
  ) => Promise<T>;
}

export interface MlCal1G4PreflightRealAdapterOptions {
  /** Injected narrow parent client — must already exist; never created here. */
  prisma: MlCal1G4PreflightParentPrismaClient;
  /**
   * Explicit enable gate. Only boolean `true` permits a transaction call.
   * Missing / false / invalid → refuse with zero Prisma activity.
   * This is not live-execution authorization.
   */
  enabled: unknown;
}

export interface MlCal1G4PreflightRealAdapter extends MlCal1G4PreflightTxAdapter {
  readonly kind: typeof ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND;
  readonly enabled: boolean;
  /** Pinned options object identity for tests. */
  readonly transactionOptions: typeof ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toIsoTimestamp(value: unknown, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) || !Number.isFinite(value.getTime())) {
      throw new Error(`metadata_${field}_invalid`);
    }
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
      throw new Error(`metadata_${field}_invalid`);
    }
    return new Date(ms).toISOString();
  }
  throw new Error(`metadata_${field}_type_invalid`);
}

function requireScalarString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`metadata_${field}_type_invalid`);
  }
  return value;
}

/**
 * Validate metadata row shape/cardinality/types and map to fixture metadata.
 * Exactly one row; isolation + READ ONLY must match the TX contract.
 */
export function validatePreflightMetadataRows(
  rows: unknown
): MlCal1G4PreflightTxMetadata {
  if (!Array.isArray(rows)) {
    throw new Error('metadata_rows_not_array');
  }
  if (rows.length === 0) {
    throw new Error('metadata_row_missing');
  }
  if (rows.length !== 1) {
    throw new Error('metadata_row_cardinality_invalid');
  }
  const row = rows[0];
  if (!isPlainObject(row)) {
    throw new Error('metadata_row_not_object');
  }

  const isolation = requireScalarString(
    row.transaction_isolation,
    'transaction_isolation'
  );
  const readOnly = requireScalarString(
    row.transaction_read_only,
    'transaction_read_only'
  );
  const transactionTimestamp = toIsoTimestamp(
    row.transaction_timestamp,
    'transaction_timestamp'
  );
  const clockTimestamp = toIsoTimestamp(row.clock_timestamp, 'clock_timestamp');
  const statementTimestamp = toIsoTimestamp(
    row.statement_timestamp,
    'statement_timestamp'
  );

  if (isolation.toLowerCase() !== 'repeatable read') {
    throw new Error('isolation_not_repeatable_read');
  }
  if (readOnly.toLowerCase() !== 'on') {
    throw new Error('transaction_not_read_only');
  }

  return {
    transactionIsolation: isolation,
    transactionReadOnly: readOnly,
    transactionTimestamp,
    serverClockDiagnostics: {
      clock_timestamp: clockTimestamp,
      statement_timestamp: statementTimestamp,
    },
  };
}

function assertEnabled(enabled: unknown): void {
  if (enabled !== true) {
    throw new Error('preflight_adapter_disabled');
  }
}

function sanitizeAdapterError(e: unknown): Error {
  const msg = redactError(e);
  const err = new Error(msg);
  err.name = 'MlCal1G4PreflightRealAdapterError';
  return err;
}

// ---------------------------------------------------------------------------
// Factory — passive
// ---------------------------------------------------------------------------

/**
 * Create a metadata-only real adapter. Does not connect, query, or open a TX.
 * Does not read process.env or credentials.
 */
export function createG4PoolerPreflightRealAdapter(
  options: MlCal1G4PreflightRealAdapterOptions
): MlCal1G4PreflightRealAdapter {
  if (options == null || typeof options !== 'object') {
    throw new Error('preflight_adapter_options_invalid');
  }
  if (options.prisma == null || typeof options.prisma !== 'object') {
    throw new Error('preflight_adapter_prisma_missing');
  }
  if (typeof options.prisma.$transaction !== 'function') {
    throw new Error('preflight_adapter_prisma_invalid');
  }

  const enabled = options.enabled === true;
  const prisma = options.prisma;

  const adapter: MlCal1G4PreflightRealAdapter = {
    kind: ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
    enabled,
    transactionOptions: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS,

    async withRepeatableReadTransaction<T>(
      fn: (client: MlCal1G4PreflightTxClient) => Promise<T>
    ): Promise<T> {
      try {
        assertEnabled(options.enabled);

        return await prisma.$transaction(async (tx) => {
          if (tx == null || typeof tx !== 'object') {
            throw new Error('transaction_client_missing');
          }
          if (typeof tx.$executeRaw !== 'function') {
            throw new Error('transaction_client_execute_missing');
          }
          if (typeof tx.$queryRaw !== 'function') {
            throw new Error('transaction_client_query_missing');
          }

          const client: MlCal1G4PreflightTxClient = {
            async setTransactionReadOnly() {
              await tx.$executeRaw(ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL);
            },
            async queryTransactionMetadata() {
              const rows = await tx.$queryRaw(
                ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL
              );
              return validatePreflightMetadataRows(rows);
            },
          };

          return await fn(client);
        }, {
          isolationLevel: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS.isolationLevel,
          maxWait: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS.maxWait,
          timeout: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS.timeout,
        });
      } catch (e) {
        throw sanitizeAdapterError(e);
      }
    },
  };

  return adapter;
}

/** SQL text allowlist for strict mock assertions (no dynamic SQL). */
export const ML_CAL_1_G4_PREFLIGHT_SQL_ALLOWLIST = [
  ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_SQL,
  ML_CAL_1_G4_PREFLIGHT_METADATA_SQL,
] as const;

/** Normalize Prisma.Sql / string for allowlist checks in tests. */
export function sqlTextOf(query: unknown): string {
  if (typeof query === 'string') {
    return query.replace(/\s+/g, ' ').trim();
  }
  if (query && typeof query === 'object' && 'strings' in query) {
    const sql = query as Prisma.Sql;
    return String(sql).replace(/\s+/g, ' ').trim();
  }
  return String(query ?? '').replace(/\s+/g, ' ').trim();
}

/** True only for the two fixed Prisma.Sql constants used by this adapter. */
export function isAllowlistedPreflightSql(query: unknown): boolean {
  return (
    query === ML_CAL_1_G4_PREFLIGHT_SET_READ_ONLY_PRISMA_SQL ||
    query === ML_CAL_1_G4_PREFLIGHT_METADATA_PRISMA_SQL
  );
}
