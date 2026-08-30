/**
 * Canonical team display names for public slate UI.
 * Prefer API-provided Team.name; strip exact mascot suffix; normalize acronyms.
 * Phase 2C-2J-6D-4.
 */

/** Explicit FBS-style acronym tokens (do not acronymize ordinary words). */
export const PUBLIC_SLATE_ACRONYM_TOKENS = new Set([
  'TCU',
  'USC',
  'UCLA',
  'UCF',
  'UAB',
  'BYU',
  'LSU',
  'SMU',
  'UNLV',
  'UTEP',
  'UTSA',
  'FAU',
  'FIU',
  'NC',
]);

export function formatTeamIdFallback(teamId: string): string {
  return normalizePublicSlateAcronymTokens(
    teamId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

/**
 * Remove trailing mascot suffix only when it exactly matches Team.mascot.
 * Does not strip arbitrary words that merely look like mascots.
 */
export function stripTrailingMascotSuffix(
  name: string,
  mascot: string | null | undefined
): string {
  const trimmedName = name.trim();
  const trimmedMascot =
    typeof mascot === 'string' ? mascot.trim() : '';
  if (!trimmedName || !trimmedMascot) return trimmedName;

  const suffix = ` ${trimmedMascot}`;
  if (trimmedName.toLowerCase().endsWith(suffix.toLowerCase())) {
    return trimmedName.slice(0, trimmedName.length - suffix.length).trim();
  }
  // Exact equality (name === mascot) — leave as-is; not a "School Mascot" form.
  return trimmedName;
}

/** Uppercase known acronym tokens; leave other words unchanged. */
export function normalizePublicSlateAcronymTokens(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const upper = token.toUpperCase();
      if (PUBLIC_SLATE_ACRONYM_TOKENS.has(upper)) return upper;
      return token;
    })
    .join(' ');
}

/**
 * Stable PUBLIC slate display name.
 * @param canonicalName Team.name from API
 * @param teamId defensive fallback
 * @param mascot Team.mascot for exact trailing-suffix strip
 */
export function resolveTeamDisplayName(
  canonicalName: string | null | undefined,
  teamId: string,
  mascot?: string | null
): string {
  const trimmed =
    typeof canonicalName === 'string' ? canonicalName.trim() : '';
  const base =
    trimmed.length > 0
      ? stripTrailingMascotSuffix(trimmed, mascot)
      : formatTeamIdFallback(teamId);
  return normalizePublicSlateAcronymTokens(base);
}
