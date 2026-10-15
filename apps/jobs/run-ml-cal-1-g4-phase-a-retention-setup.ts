/**
 * Gated CLI for ML-CAL-1 G4 Phase A retention setup.
 *
 * Import is passive. Defaults / malformed flags: zero filesystem/clock effects.
 * Does not construct PrismaClient or read DATABASE_URL / DIRECT_URL.
 *
 * Proposed operator destination is NEVER a default. Exact destination binding
 * required. Operator execution requires separate authority — see instructions.
 */

import {
  ML_CAL_1_G4_PHASE_A_SETUP_KIND,
  ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
  g4EvidenceBaseFromOperatorUserRoot,
  runG4PhaseARetentionSetup,
  runnerRetainRootFromOperatorUserRoot,
} from './lib/ml-cal-1-g4-phase-a-retention-setup';

export const ML_CAL_1_G4_PHASE_A_CLI_KIND =
  'ml-cal-1-g4-phase-a-retention-setup-cli-v1' as const;

export interface PhaseACliArgs {
  help?: unknown;
  plan?: unknown;
  enabled?: unknown;
  confirmSetup?: unknown;
  mode?: unknown;
  destination?: unknown;
  expectedDestination?: unknown;
  probeId?: unknown;
  handoffId?: unknown;
}

export interface PhaseACliResult {
  ok: boolean;
  reasons: string[];
  usagePrinted: boolean;
  planPrinted: boolean;
  filesystemMutations: false | 'delegated_to_library';
  setup?: ReturnType<typeof runG4PhaseARetentionSetup>;
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: run-ml-cal-1-g4-phase-a-retention-setup

Phase A R-LOCAL-FS retention setup (probe provenance only).

  --help
  --plan
  --enabled=true              Exact boolean (no truthy coercion)
  --confirm-setup=true        Exact boolean
  --mode=temp|operator
  --destination=<abs-path>    Actual operator USER root (not g4 base)
  --expected-destination=<abs-path>  Must match destination after normalize
  --probe-id=<safe-id>
  --handoff-id=<safe-id>

Retain-root binding:
  operator user root  = --destination
  g4 evidence base    = <destination>\\\\ml-cal-1\\\\g4
  runner retainRoot   = g4 evidence base (NOT the user root)

Proposed operator label (UNVERIFIED; not a default):
  ${ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL}

Kind: ${ML_CAL_1_G4_PHASE_A_SETUP_KIND}
`);
}

function printPlan(): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        kind: ML_CAL_1_G4_PHASE_A_CLI_KIND,
        setupKind: ML_CAL_1_G4_PHASE_A_SETUP_KIND,
        proposedOperatorUserRootLabel:
          ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
        proposedG4EvidenceBaseLabel: g4EvidenceBaseFromOperatorUserRoot(
          ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL
        ),
        proposedRunnerRetainRootLabel: runnerRetainRootFromOperatorUserRoot(
          ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL
        ),
        requireExactEnable: true,
        requireExactConfirmSetup: true,
        noTruthyCoercion: true,
        noDefaultDestination: true,
        liveAccepted: false,
        approved: false,
        deployedPoolerProof: false,
        note: 'Operator command is NOT a default and must not run without separate authority.',
      },
      null,
      2
    )
  );
}

export function parsePhaseACliArgv(argv: string[]): PhaseACliArgs {
  const out: PhaseACliArgs = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--plan') out.plan = true;
    else if (arg === '--enabled=true') out.enabled = true;
    else if (arg === '--enabled=false') out.enabled = false;
    else if (arg.startsWith('--enabled='))
      out.enabled = arg.slice('--enabled='.length);
    else if (arg === '--confirm-setup=true') out.confirmSetup = true;
    else if (arg === '--confirm-setup=false') out.confirmSetup = false;
    else if (arg.startsWith('--confirm-setup='))
      out.confirmSetup = arg.slice('--confirm-setup='.length);
    else if (arg.startsWith('--mode=')) out.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--destination='))
      out.destination = arg.slice('--destination='.length);
    else if (arg.startsWith('--expected-destination='))
      out.expectedDestination = arg.slice('--expected-destination='.length);
    else if (arg.startsWith('--probe-id='))
      out.probeId = arg.slice('--probe-id='.length);
    else if (arg.startsWith('--handoff-id='))
      out.handoffId = arg.slice('--handoff-id='.length);
  }
  return out;
}

export function runPhaseARetentionSetupCli(
  args: PhaseACliArgs = {}
): PhaseACliResult {
  if (args.help === true) {
    printUsage();
    return {
      ok: false,
      reasons: ['usage_printed'],
      usagePrinted: true,
      planPrinted: false,
      filesystemMutations: false,
    };
  }
  if (args.plan === true) {
    printPlan();
    return {
      ok: false,
      reasons: ['plan_printed'],
      usagePrinted: false,
      planPrinted: true,
      filesystemMutations: false,
    };
  }
  if (args.enabled !== true) {
    printUsage();
    return {
      ok: false,
      reasons: ['cli_disabled_exact_true_required'],
      usagePrinted: true,
      planPrinted: false,
      filesystemMutations: false,
    };
  }
  if (args.confirmSetup !== true) {
    printUsage();
    return {
      ok: false,
      reasons: ['confirm_setup_exact_true_required'],
      usagePrinted: true,
      planPrinted: false,
      filesystemMutations: false,
    };
  }
  if (args.mode !== 'temp' && args.mode !== 'operator') {
    return {
      ok: false,
      reasons: ['mode_temp_or_operator_required'],
      usagePrinted: false,
      planPrinted: false,
      filesystemMutations: false,
    };
  }
  if (
    typeof args.destination !== 'string' ||
    !args.destination.trim() ||
    typeof args.expectedDestination !== 'string' ||
    !args.expectedDestination.trim()
  ) {
    return {
      ok: false,
      reasons: ['destination_binding_required'],
      usagePrinted: false,
      planPrinted: false,
      filesystemMutations: false,
    };
  }
  if (
    typeof args.probeId !== 'string' ||
    typeof args.handoffId !== 'string'
  ) {
    return {
      ok: false,
      reasons: ['probe_and_handoff_ids_required'],
      usagePrinted: false,
      planPrinted: false,
      filesystemMutations: false,
    };
  }

  const setup = runG4PhaseARetentionSetup({
    enabled: true,
    confirmSetup: true,
    mode: args.mode,
    expectedOperatorUserRoot: args.expectedDestination,
    actualOperatorUserRoot: args.destination,
    probeId: args.probeId,
    handoffId: args.handoffId,
    now: () => new Date(),
  });

  return {
    ok: setup.ok,
    reasons: setup.reasons,
    usagePrinted: false,
    planPrinted: false,
    filesystemMutations: 'delegated_to_library',
    setup,
  };
}

export function mainFromArgv(argv: string[]): PhaseACliResult {
  return runPhaseARetentionSetupCli(parsePhaseACliArgv(argv));
}

const isDirectExecution =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

if (isDirectExecution) {
  const result = mainFromArgv(process.argv.slice(2));
  if (!result.ok) process.exitCode = 1;
}
