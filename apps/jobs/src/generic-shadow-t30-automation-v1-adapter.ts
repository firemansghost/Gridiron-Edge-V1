/**
 * Generic Shadow T-30 Automation V1 — Stage A read-only DB adapter.
 *
 * Discovers persisted eligible Generic capture runs for one 2026 week and
 * loads their already-proven Generic T-30 operational frames. No providers,
 * transactions, writes, or migrations.
 */

import type { PrismaClient } from '@prisma/client';
import {loadIntegrityScope, IntegrityBlockedError, type GenericShadowIntegrityAudit} from './generic-shadow-integrity-disposition';
import {
  GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS,
  type GenericShadowT30OperationalFrame,
} from '../../web/lib/shadow-model-t30-closing-v1';
import { loadGenericShadowT30OperationalFrame } from './shadow-model-t30-closing-v1-adapter';

export interface GenericShadowT30AutomationDiscovery {
  frames: GenericShadowT30OperationalFrame[];
  integrityAudit?: GenericShadowIntegrityAudit;
  discoveredSupportedRunIds: string[];
  eligibleCaptureRunIds: string[];
  skippedIncompleteRunIds: string[];
  blockers: string[];
  providerCalls: 0;
  mutationsInvoked: false;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export async function discoverGenericShadowT30AutomationFrames(
  prisma: PrismaClient,
  args: { season: number; week: number }
): Promise<GenericShadowT30AutomationDiscovery> {
  let integrityAudit = await loadIntegrityScope(prisma, args);
  const discoveredSupportedRunIds = integrityAudit.discoveredRunIds;
  const eligibleRows = integrityAudit.cohorts.filter(row => integrityAudit.eligibleCaptureRunIds.includes(row.id));
  const skippedIncompleteRunIds = integrityAudit.cohorts.filter(row => row.status !== 'COMPLETE').map(row => row.id);
  const blockers = [...integrityAudit.blockers];

  const frames: GenericShadowT30OperationalFrame[] = [];
  for (const row of eligibleRows) {
    try { frames.push(await loadGenericShadowT30OperationalFrame(prisma, row.id)); }
    catch (error) { if(error instanceof IntegrityBlockedError) integrityAudit=error.audit; blockers.push(`integrity_frame_failed:${error instanceof Error ? error.message : String(error)}`); }
  }

  return {
    frames: blockers.length ? [] : frames,
    integrityAudit,
    discoveredSupportedRunIds: uniqueSorted(discoveredSupportedRunIds),
    eligibleCaptureRunIds: blockers.length ? [] : uniqueSorted(eligibleRows.map((row) => row.id)),
    skippedIncompleteRunIds: uniqueSorted(skippedIncompleteRunIds),
    blockers: uniqueSorted(blockers),
    providerCalls: 0,
    mutationsInvoked: false,
  };
}
