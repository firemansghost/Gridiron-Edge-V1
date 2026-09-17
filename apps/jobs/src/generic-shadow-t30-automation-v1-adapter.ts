/**
 * Generic Shadow T-30 Automation V1 — Stage A read-only DB adapter.
 *
 * Discovers persisted eligible Generic capture runs for one 2026 week and
 * loads their already-proven Generic T-30 operational frames. No providers,
 * transactions, writes, or migrations.
 */

import type { PrismaClient } from '@prisma/client';
import {
  GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS,
  type GenericShadowT30OperationalFrame,
} from '../../web/lib/shadow-model-t30-closing-v1';
import { loadGenericShadowT30OperationalFrame } from './shadow-model-t30-closing-v1-adapter';

export interface GenericShadowT30AutomationDiscovery {
  frames: GenericShadowT30OperationalFrame[];
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
  const rows = await prisma.shadowModelCaptureRun.findMany({
    where: {
      season: args.season,
      week: args.week,
      modelDefinitionId: {
        in: [...GENERIC_SHADOW_T30_SUPPORTED_MODEL_IDS],
      },
    },
    select: {
      id: true,
      status: true,
      modelDefinitionId: true,
    },
    orderBy: [{ modelDefinitionId: 'asc' }, { id: 'asc' }],
  });

  const discoveredSupportedRunIds = rows.map((row) => row.id);
  const eligibleRows = rows.filter((row) => String(row.status) === 'COMPLETE');
  const skippedIncompleteRunIds = rows
    .filter((row) => String(row.status) !== 'COMPLETE')
    .map((row) => row.id);
  const blockers = skippedIncompleteRunIds.map(
    (id) => `supported_capture_run_not_complete:${id}`
  );

  const frames: GenericShadowT30OperationalFrame[] = [];
  for (const row of eligibleRows) {
    frames.push(await loadGenericShadowT30OperationalFrame(prisma, row.id));
  }

  return {
    frames,
    discoveredSupportedRunIds: uniqueSorted(discoveredSupportedRunIds),
    eligibleCaptureRunIds: uniqueSorted(eligibleRows.map((row) => row.id)),
    skippedIncompleteRunIds: uniqueSorted(skippedIncompleteRunIds),
    blockers: uniqueSorted(blockers),
    providerCalls: 0,
    mutationsInvoked: false,
  };
}
