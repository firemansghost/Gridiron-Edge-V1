/**
 * Canonical team display names for public slate UI.
 * Prefer API-provided names; fall back to a readable ID format.
 */

export function formatTeamIdFallback(teamId: string): string {
  return teamId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function resolveTeamDisplayName(
  canonicalName: string | null | undefined,
  teamId: string
): string {
  const trimmed = typeof canonicalName === 'string' ? canonicalName.trim() : '';
  if (trimmed.length > 0) return trimmed;
  return formatTeamIdFallback(teamId);
}
