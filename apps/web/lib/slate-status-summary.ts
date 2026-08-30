/**
 * Week/slate status summary from Game.status (not score presence).
 * Phase 2C-2J-6D-3.
 */

export type SlateGameStatus = 'final' | 'scheduled' | 'in_progress' | string;

export interface SlateStatusGame {
  status?: SlateGameStatus | null;
}

export interface SlateStatusSummary {
  total: number;
  final: number;
  inProgress: number;
  scheduled: number;
  allFinal: boolean;
}

export function summarizeSlateStatus(
  games: ReadonlyArray<SlateStatusGame> | null | undefined
): SlateStatusSummary {
  const list = games ?? [];
  let final = 0;
  let inProgress = 0;
  let scheduled = 0;

  for (const game of list) {
    const status = (game.status ?? 'scheduled').toLowerCase();
    if (status === 'final') {
      final += 1;
    } else if (status === 'in_progress' || status === 'inprogress' || status === 'live') {
      inProgress += 1;
    } else {
      scheduled += 1;
    }
  }

  const total = list.length;
  return {
    total,
    final,
    inProgress,
    scheduled,
    allFinal: total > 0 && final === total,
  };
}

/** Compact badge / label text for week-level status. */
export function formatSlateStatusLabel(summary: SlateStatusSummary): string | null {
  if (summary.total === 0) return null;
  if (summary.allFinal) return 'Final';

  const parts: string[] = [];
  if (summary.inProgress > 0) {
    parts.push(`${summary.inProgress} Live`);
  }
  if (summary.final > 0) {
    parts.push(`${summary.final} Final`);
  }
  if (summary.scheduled > 0) {
    parts.push(`${summary.scheduled} Upcoming`);
  }
  return parts.join(' · ') || null;
}
