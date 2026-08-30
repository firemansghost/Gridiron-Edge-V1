/**
 * Resolve Portfolio What-Ifs season from a URL query value.
 * Valid positive integers win; missing/invalid values fall back safely.
 */

export const DEFAULT_PORTFOLIO_SEASON = 2025;

export function resolvePortfolioSeasonParam(
  raw: string | null | undefined,
  fallback: number = DEFAULT_PORTFOLIO_SEASON
): number {
  if (raw == null) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '') return fallback;
  if (!/^\d+$/.test(trimmed)) return fallback;

  const season = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(season) || season <= 0) return fallback;
  return season;
}
