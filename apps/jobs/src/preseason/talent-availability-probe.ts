/**
 * Phase 2C-2H-1 — Read-only 2026 talent availability probe (pure logic).
 *
 * Single-provider-family diagnostics for CFBD GET /talent?year=2026.
 * Never authorizes persistence or ratings compute.
 * Reuses talent mapping from ratings-input-provider-preview (no second policy).
 */

import {
  EXPECTED_FBS_COUNT,
  TARGET_SEASON,
  previewTalentInputs,
  type RawTalentRow,
  type ResolveTeamId,
  type TalentPreviewSummary,
} from './ratings-input-provider-preview';

export const TALENT_PROBE_ENDPOINT = '/talent' as const;

export interface TalentAvailabilityProbeResult {
  mode: 'READ_ONLY';
  targetSeason: number;
  dbFbsCount: number;
  providerRequestCount: number;
  endpoint: string;
  rawTalentRows: number;
  normalizedTeamCount: number;
  matchedFbsCount: number;
  missingFbsCount: number;
  unresolvedCount: number;
  duplicateTeamIds: number;
  providerSeasonValues: number[];
  seasonMismatch: boolean;
  talentCompositeFinite: number;
  talentMin: number | null;
  talentAvg: number | null;
  talentMax: number | null;
  unexpectedNonFbsCount: number;
  talentAvailable: boolean;
  structurallyComplete: boolean;
  persistenceAuthorized: false;
  ratingsComputeAuthorized: false;
  mutationsInvoked: false;
  talent: TalentPreviewSummary;
  findings: string[];
}

export function classifyTalentStructuralCompleteness(options: {
  dbFbsCount: number;
  matchedFbsCount: number;
  missingFbsCount: number;
  unresolvedRelevantCount: number;
  duplicateTeamIds: number;
  seasonMismatch: boolean;
  talentCompositeFinite: number;
  expectedFbsCount?: number;
}): { talentAvailable: boolean; structurallyComplete: boolean; findings: string[] } {
  const expected = options.expectedFbsCount ?? EXPECTED_FBS_COUNT;
  const findings: string[] = [];

  const structurallyComplete =
    options.dbFbsCount === expected &&
    options.matchedFbsCount === expected &&
    options.missingFbsCount === 0 &&
    options.unresolvedRelevantCount === 0 &&
    options.duplicateTeamIds === 0 &&
    !options.seasonMismatch &&
    options.talentCompositeFinite === expected;

  if (options.dbFbsCount !== expected) {
    findings.push(`DB FBS count ${options.dbFbsCount} != expected ${expected}`);
  }
  if (options.matchedFbsCount !== expected || options.missingFbsCount !== 0) {
    findings.push(
      `Talent coverage incomplete: ${options.matchedFbsCount}/${expected} (missing=${options.missingFbsCount})`
    );
  }
  if (options.duplicateTeamIds > 0) {
    findings.push(`Duplicate talent team mappings: ${options.duplicateTeamIds}`);
  }
  if (options.unresolvedRelevantCount > 0) {
    findings.push(
      `Unresolved provider talent names: ${options.unresolvedRelevantCount}`
    );
  }
  if (options.seasonMismatch) {
    findings.push('Provider season values do not match requested 2026');
  }
  if (options.talentCompositeFinite !== expected) {
    findings.push(
      `Talent composite finite values incomplete: ${options.talentCompositeFinite}/${expected}`
    );
  }

  return {
    talentAvailable: structurallyComplete,
    structurallyComplete,
    findings,
  };
}

export function buildTalentAvailabilityProbe(options: {
  fbsIds: string[];
  talentRaw: RawTalentRow[];
  resolveTeamId: ResolveTeamId;
  providerRequestCount: number;
  endpoint?: string;
  requestedSeason?: number;
}): TalentAvailabilityProbeResult {
  const requestedSeason = options.requestedSeason ?? TARGET_SEASON;
  const fbsIds = [...new Set(options.fbsIds)].sort();
  const talent = previewTalentInputs({
    fbsIds,
    rawRows: options.talentRaw,
    resolveTeamId: options.resolveTeamId,
    requestedSeason,
  });

  const classified = classifyTalentStructuralCompleteness({
    dbFbsCount: fbsIds.length,
    matchedFbsCount: talent.matchedFbsCount,
    missingFbsCount: talent.missingFbsIds.length,
    unresolvedRelevantCount: talent.unresolvedProviderNames.length,
    duplicateTeamIds: talent.duplicateTeamIds.length,
    seasonMismatch: talent.seasonMismatch,
    talentCompositeFinite: talent.talentCompositeFiniteCount,
  });

  return {
    mode: 'READ_ONLY',
    targetSeason: requestedSeason,
    dbFbsCount: fbsIds.length,
    providerRequestCount: options.providerRequestCount,
    endpoint: options.endpoint ?? `${TALENT_PROBE_ENDPOINT}?year=${requestedSeason}`,
    rawTalentRows: talent.rawRowCount,
    normalizedTeamCount: talent.normalizedTeamCount,
    matchedFbsCount: talent.matchedFbsCount,
    missingFbsCount: talent.missingFbsIds.length,
    unresolvedCount: talent.unresolvedProviderNames.length,
    duplicateTeamIds: talent.duplicateTeamIds.length,
    providerSeasonValues: talent.providerSeasonValues,
    seasonMismatch: talent.seasonMismatch,
    talentCompositeFinite: talent.talentCompositeFiniteCount,
    talentMin: talent.talentMin,
    talentAvg: talent.talentAvg,
    talentMax: talent.talentMax,
    unexpectedNonFbsCount: talent.unexpectedNonFbsIds.length,
    talentAvailable: classified.talentAvailable,
    structurallyComplete: classified.structurallyComplete,
    persistenceAuthorized: false,
    ratingsComputeAuthorized: false,
    mutationsInvoked: false,
    talent,
    findings: classified.findings,
  };
}

export function formatTalentAvailabilityProbeReport(
  result: TalentAvailabilityProbeResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('2026 TALENT AVAILABILITY PROBE (READ ONLY)');
  push('============================================');
  push(`  mode=${result.mode}`);
  push(`  targetSeason=${result.targetSeason}`);
  push(`  dbFbsCount=${result.dbFbsCount}`);
  push(`  providerRequestCount=${result.providerRequestCount}`);
  push(`  endpoint=${result.endpoint}`);
  push(`  rawTalentRows=${result.rawTalentRows}`);
  push(`  normalizedTeamCount=${result.normalizedTeamCount}`);
  push(`  matchedFbsCount=${result.matchedFbsCount}`);
  push(`  missingFbsCount=${result.missingFbsCount}`);
  push(`  unresolvedCount=${result.unresolvedCount}`);
  push(`  duplicateTeamIds=${result.duplicateTeamIds}`);
  push(
    `  providerSeasonValues=[${result.providerSeasonValues.join(', ')}]`
  );
  push(`  seasonMismatch=${result.seasonMismatch}`);
  push(`  talentCompositeFinite=${result.talentCompositeFinite}`);
  push(
    `  talent min/avg/max=${result.talentMin}/${result.talentAvg}/${result.talentMax}`
  );
  push(`  unexpectedNonFbsCount=${result.unexpectedNonFbsCount}`);
  push(`  talentAvailable=${result.talentAvailable}`);
  push(`  structurallyComplete=${result.structurallyComplete}`);
  push(`  persistenceAuthorized=${result.persistenceAuthorized}`);
  push(`  ratingsComputeAuthorized=${result.ratingsComputeAuthorized}`);
  push(`  mutationsInvoked=${result.mutationsInvoked}`);
  if (result.findings.length > 0) {
    push('  findings:');
    for (const f of result.findings) push(`    - ${f}`);
  }
  push('============================================');
  return lines.join('\n');
}

export function parseTalentAvailabilityProbeArgs(
  argv: string[]
):
  | { ok: true; season: number; preview: true }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let preview = false;

  const WRITE_FLAGS = new Set([
    '--write',
    '--execute',
    '--upsert',
    '--persist',
    '--force',
    '--force-write',
    '--allow-write',
    '--confirm-write',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.has(a)) {
      errors.push(`Write flag rejected: ${a}`);
      continue;
    }
    if (a === '--preview' || a === '--probe') {
      preview = true;
      continue;
    }
    if (a === '--season') {
      if (season !== null) {
        errors.push('--season specified more than once');
        continue;
      }
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        errors.push(`--season requires integer (got ${raw})`);
      } else {
        season = n;
      }
      continue;
    }
    errors.push(`Unknown argument: ${a}`);
  }

  if (season === null) errors.push('--season is required');
  else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON} (got ${season})`);
  }
  if (!preview) errors.push('--preview (or --probe) is required');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: TARGET_SEASON, preview: true };
}

export function sanitizeTalentAvailabilityProbeError(_err?: unknown): string {
  return 'Talent availability probe failed; connection and secret details suppressed';
}
