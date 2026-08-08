/**
 * Pure classifier for `prisma migrate status` stdout/stderr.
 * Used by workflow tests — no network / no DB.
 *
 * Precedence for safeForDeploy:
 * 1. failed migration (P3009) → unsafe
 * 2. migration-history divergence → unsafe
 * 3. pending migrations OR up-to-date → safe
 * 4. unknown → unsafe
 */

export interface PrismaMigrateStatusClassification {
  failedMigration: boolean;
  historyDivergence: boolean;
  pendingMigrations: boolean;
  upToDate: boolean;
  /** Preflight: may proceed to migrate deploy */
  safeForDeploy: boolean;
}

const FAILED_RE =
  /P3009|have failed|migration .* failed|failed migrations? in the (target )?database|The following migration\(s\) have failed/i;

const DIVERGENCE_RE =
  /Your local migration history and the migrations table from your database are different|The migrations from the database are not found locally in prisma\/migrations/i;

const PENDING_RE =
  /have not yet been applied|Following migration|not yet been applied/i;

const UP_TO_DATE_RE = /Database schema is up to date/i;

export function classifyPrismaMigrateStatus(
  output: string
): PrismaMigrateStatusClassification {
  const failedMigration = FAILED_RE.test(output);
  const historyDivergence = DIVERGENCE_RE.test(output);
  const pendingMigrations = PENDING_RE.test(output);
  const upToDate = UP_TO_DATE_RE.test(output);

  let safeForDeploy = false;
  if (failedMigration) {
    safeForDeploy = false;
  } else if (historyDivergence) {
    safeForDeploy = false;
  } else if (pendingMigrations || upToDate) {
    safeForDeploy = true;
  } else {
    safeForDeploy = false;
  }

  return {
    failedMigration,
    historyDivergence,
    pendingMigrations,
    upToDate,
    safeForDeploy,
  };
}
