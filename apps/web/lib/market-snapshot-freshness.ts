/**
 * Derive market-snapshot freshness from timestamps already present on slate rows.
 * Phase 2C-2J-6D-3 — display only; no provider/DB calls.
 */

export interface MarketTimestampSource {
  closingSpread?: { timestamp?: string | null } | null;
  closingTotal?: { timestamp?: string | null } | null;
}

export interface MarketSnapshotFreshness {
  newestTimestamp: string | null;
  label: string;
}

const CT_TZ = 'America/Chicago';

function parseTs(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Newest valid market timestamp among visible games that have lines. */
export function newestDisplayedMarketTimestamp(
  games: ReadonlyArray<MarketTimestampSource> | null | undefined
): string | null {
  let newestMs: number | null = null;
  let newestIso: string | null = null;

  for (const game of games ?? []) {
    for (const ts of [game.closingSpread?.timestamp, game.closingTotal?.timestamp]) {
      const ms = parseTs(ts ?? null);
      if (ms === null) continue;
      if (newestMs === null || ms > newestMs) {
        newestMs = ms;
        newestIso = ts!;
      }
    }
  }

  return newestIso;
}

export function formatMarketSnapshotLabel(
  newestTimestamp: string | null,
  now: Date = new Date()
): string {
  if (!newestTimestamp) return 'Market snapshot unavailable';

  const ms = parseTs(newestTimestamp);
  if (ms === null) return 'Market snapshot unavailable';

  const ageMs = Math.max(0, now.getTime() - ms);
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 48) {
    const hours = Math.max(1, Math.round(ageHours));
    if (ageHours < 1) {
      const mins = Math.max(1, Math.round(ageMs / (1000 * 60)));
      return `Newest slate market snapshot: ${mins}m ago`;
    }
    return `Newest slate market snapshot: ${hours}h ago`;
  }

  const clock = new Date(ms).toLocaleString('en-US', {
    timeZone: CT_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `Market snapshot: ${clock} CT`;
}

export function summarizeMarketSnapshotFreshness(
  games: ReadonlyArray<MarketTimestampSource> | null | undefined,
  now: Date = new Date()
): MarketSnapshotFreshness {
  const newestTimestamp = newestDisplayedMarketTimestamp(games);
  return {
    newestTimestamp,
    label: formatMarketSnapshotLabel(newestTimestamp, now),
  };
}
