/**
 * Entrypoint: Phase A JSON setup capture + read-only anchored evaluation.
 *
 * Import is passive. No Prisma / DATABASE_URL / DIRECT_URL.
 * Does not print legacy usage text in JSON mode.
 * Diagnostics for parse/output failures go to stderr.
 *
 * Operator mode is accepted by the parser for future authority only.
 * This module never defaults a destination and never touches the proposed
 * operator root. Temp-only execution is required for local verification.
 */

import {
  ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND,
  mainPhaseAJsonCommandFromArgv,
} from './lib/ml-cal-1-g4-phase-a-json-command';

export {
  ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND,
  inferG4EvidenceBaseFromArtifact,
  mainPhaseAJsonCommandFromArgv,
  parsePhaseAJsonCommandArgv,
  resolvePhysicalEvidenceArtifact,
  runPhaseAJsonCommand,
  validateCapturePath,
  validateRuntimePhaseAJsonRequest,
  writeAllUtf8ToFd,
} from './lib/ml-cal-1-g4-phase-a-json-command';

export function mainFromArgv(argv: string[]): {
  ok: boolean;
  exitCode: 0 | 1;
  /** Present so tests can assert structured diagnostics reached the entrypoint. */
  jsonText: string | null;
  stderrLineCount: number;
} {
  const result = mainPhaseAJsonCommandFromArgv(argv);
  for (const line of result.stderrLines) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
  return {
    ok: result.envelope.ok,
    exitCode: result.exitCode,
    jsonText: result.jsonText,
    stderrLineCount: result.stderrLines.length,
  };
}

const isDirectExecution =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module;

if (isDirectExecution) {
  const { exitCode } = mainFromArgv(process.argv.slice(2));
  process.exitCode = exitCode;
}

// Kind pin for static scans / docs.
void ML_CAL_1_G4_PHASE_A_JSON_COMMAND_KIND;
