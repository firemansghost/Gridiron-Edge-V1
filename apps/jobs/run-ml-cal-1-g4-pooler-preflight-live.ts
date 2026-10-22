/**
 * Gated CLI entry for ML-CAL-1 G4 nonfixture P-PREFLIGHT.
 *
 * Import is passive: no env reads, PrismaClient construction, FS mutation,
 * or connection at module load. Real client construction is reserved for a
 * future explicitly invoked live path AFTER all preconnection gates pass.
 *
 * This task's CLI refuses live DB construction. Offline mock orchestration
 * is available only through the library runner with injected dependencies.
 *
 * Opt-in: exact boolean / explicit CLI confirmation — no truthy coercion.
 * Default/absent/invalid opt-in refuses before credential access.
 */

import {
  ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
  ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE,
  ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK,
} from './lib/ml-cal-1-g4-pooler-preflight-live-runner';
import { ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN } from './lib/ml-cal-1-g4-pooler-preflight-real-adapter';

export const ML_CAL_1_G4_PREFLIGHT_LIVE_CLI_KIND =
  'ml-cal-1-g4-pooler-preflight-live-cli-v1' as const;

export interface MlCal1G4PreflightLiveCliArgs {
  enabled?: unknown;
  confirmLive?: unknown;
  help?: unknown;
  plan?: unknown;
  /** Test hook: never used for live client construction from CLI. */
  allowTestOverrides?: unknown;
}

export interface MlCal1G4PreflightLiveCliResult {
  ok: boolean;
  reasons: string[];
  usagePrinted: boolean;
  planPrinted: boolean;
  clientConstructed: false;
  connected: false;
  transactionAttempted: false;
  credentialsAccessed: false;
  envRead: false;
  liveAccepted: false;
  approved: false;
  deployedPoolerProof: false;
  ownedClientDisconnected: boolean;
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: run-ml-cal-1-g4-pooler-preflight-live

Gated nonfixture P-PREFLIGHT CLI (metadata-only future live path).

  --help                 Print usage (no startup)
  --plan                 Print plan summary (no startup)
  --enabled=true         Exact enable latch (boolean true only)
  --confirm-live=true    Exact live confirmation (boolean true only)

This build refuses PrismaClient construction and DB connect.
Offline mock packages: use library runG4NonfixturePreflight with injected deps.
Design pin: ${ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN}
Base #254: ${ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP}
Runner kind: ${ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND}
Schemas: ${ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK} | ${ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE}
`);
}

function printPlan(): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        kind: ML_CAL_1_G4_PREFLIGHT_LIVE_CLI_KIND,
        runnerKind: ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND,
        designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
        base254Tip: ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
        liveClientConstruction: 'refused_in_this_build',
        requireExactEnable: true,
        requireExactConfirmLive: true,
        noTruthyCoercion: true,
        noAutomaticRetries: true,
        noDirectUrlFallback: true,
        databaseObservedRole: 'UNVERIFIED',
        liveAccepted: false,
        approved: false,
        deployedPoolerProof: false,
      },
      null,
      2
    )
  );
}

export function parseLiveCliArgv(argv: string[]): MlCal1G4PreflightLiveCliArgs {
  const out: MlCal1G4PreflightLiveCliArgs = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--plan') out.plan = true;
    else if (arg === '--enabled=true') out.enabled = true;
    else if (arg === '--enabled=false') out.enabled = false;
    else if (arg.startsWith('--enabled=')) out.enabled = arg.slice('--enabled='.length);
    else if (arg === '--confirm-live=true') out.confirmLive = true;
    else if (arg === '--confirm-live=false') out.confirmLive = false;
    else if (arg.startsWith('--confirm-live=')) {
      out.confirmLive = arg.slice('--confirm-live='.length);
    } else if (arg === '--allow-test-overrides' || arg.startsWith('--allow-test-overrides=')) {
      out.allowTestOverrides = true;
    }
  }
  return out;
}

/**
 * Evaluate gated CLI. Never constructs PrismaClient or reads process.env
 * for credentials. Test overrides are rejected.
 */
export async function runG4NonfixturePreflightLiveCli(
  args: MlCal1G4PreflightLiveCliArgs = {}
): Promise<MlCal1G4PreflightLiveCliResult> {
  const base = {
    clientConstructed: false as const,
    connected: false as const,
    transactionAttempted: false as const,
    credentialsAccessed: false as const,
    envRead: false as const,
    liveAccepted: false as const,
    approved: false as const,
    deployedPoolerProof: false as const,
    ownedClientDisconnected: false,
  };

  if (args.help === true) {
    printUsage();
    return {
      ok: false,
      reasons: ['usage_printed'],
      usagePrinted: true,
      planPrinted: false,
      ...base,
    };
  }
  if (args.plan === true) {
    printPlan();
    return {
      ok: false,
      reasons: ['plan_printed'],
      usagePrinted: false,
      planPrinted: true,
      ...base,
    };
  }
  if (args.allowTestOverrides === true) {
    return {
      ok: false,
      reasons: ['test_overrides_forbidden_on_live_cli'],
      usagePrinted: false,
      planPrinted: false,
      ...base,
    };
  }
  if (args.enabled !== true) {
    printUsage();
    return {
      ok: false,
      reasons: ['cli_disabled_exact_true_required'],
      usagePrinted: true,
      planPrinted: false,
      ...base,
    };
  }
  if (args.confirmLive !== true) {
    printUsage();
    return {
      ok: false,
      reasons: ['confirm_live_exact_true_required'],
      usagePrinted: true,
      planPrinted: false,
      ...base,
    };
  }

  // All preconnection gates would pass for enable/confirm — still refuse
  // client construction in this offline implementation PR.
  return {
    ok: false,
    reasons: ['live_client_construction_refused_in_this_build'],
    usagePrinted: false,
    planPrinted: false,
    ...base,
  };
}

/** Passive main helper for tests — does not auto-run on import. */
export async function mainFromArgv(
  argv: string[]
): Promise<MlCal1G4PreflightLiveCliResult> {
  return runG4NonfixturePreflightLiveCli(parseLiveCliArgv(argv));
}

// Intentionally no top-level main() invocation on import.
// Future process entry may call mainFromArgv(process.argv.slice(2)) only
// when this file is executed as a script — still refuses live construction.
const isDirectExecution =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

if (isDirectExecution) {
  void mainFromArgv(process.argv.slice(2)).then((result) => {
    if (!result.ok) {
      process.exitCode = 1;
    }
  });
}
