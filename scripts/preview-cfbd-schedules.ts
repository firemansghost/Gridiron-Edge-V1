#!/usr/bin/env node
/**
 * Read-only CFBD schedule preview for a single season/week.
 *
 * Always forces preview mode. Never exports or calls write helpers.
 *
 * Usage:
 *   npx tsx scripts/preview-cfbd-schedules.ts --season 2026 --week 0
 *   npx tsx scripts/preview-cfbd-schedules.ts --season 2026 --week 0 --preview
 */

import {
  PREVIEW_ONLY_WRITE_DISABLED_MESSAGE,
  parseScheduleOnlyArgs,
} from '../apps/jobs/src/preseason/cfbd-schedule-ingest';
import { runSchedulePreview } from '../apps/jobs/ingest-schedules';

/** Pure helper: ensure argv always includes --preview and never write flags. */
export function forcePreviewArgv(argv: string[]): string[] {
  const filtered = argv.filter(
    (a) =>
      a !== '--write' &&
      a !== '--force-write' &&
      a !== '--allow-write' &&
      a !== '--execute'
  );
  if (!filtered.includes('--preview')) {
    return [...filtered, '--preview'];
  }
  return filtered;
}

export async function runPreviewCli(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  const forced = forcePreviewArgv(argv);
  const parsed = parseScheduleOnlyArgs(forced);
  if (!parsed.ok || !parsed.args) {
    for (const err of parsed.errors) {
      console.error(`[preview] ${err}`);
    }
    console.error(
      'Usage: npx tsx scripts/preview-cfbd-schedules.ts --season <year> --week <n> [--preview]'
    );
    return 1;
  }

  if (!parsed.args.preview) {
    console.error(`[preview] ${PREVIEW_ONLY_WRITE_DISABLED_MESSAGE}`);
    return 1;
  }

  console.log('[preview] Read-only CFBD schedule preview');
  console.log(`[preview] season=${parsed.args.season} week=${parsed.args.week}`);
  console.log('[preview] write mode: disabled (Phase 2C-1A2)');

  const { exitCode } = await runSchedulePreview({
    season: parsed.args.season,
    week: parsed.args.week,
  });
  return exitCode;
}

async function main(): Promise<void> {
  const code = await runPreviewCli();
  process.exit(code);
}

if (require.main === module) {
  void main();
}
