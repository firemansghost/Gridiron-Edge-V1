/**
 * Page-scroll helpers for SlateTable date/hash/search navigation.
 * Phase 2C-2J-6D-4 — no nested vertical scroll container.
 */

export function prefersReducedMotionScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

/** Scroll a date header or game row into the page viewport. */
export function scrollSlateTargetIntoView(
  el: Element | null | undefined,
  options?: { behavior?: ScrollBehavior }
): void {
  if (!el || !(el instanceof HTMLElement)) return;
  const behavior =
    options?.behavior ?? prefersReducedMotionScrollBehavior();
  el.scrollIntoView({ behavior, block: 'start' });
}

/**
 * Resolve the current date-nav index.
 * Known active date → exact index; missing/empty → 0; empty keys → -1.
 */
export function resolveActiveDateIndex(
  dateKeys: ReadonlyArray<string>,
  activeDate: string | null | undefined
): number {
  if (dateKeys.length === 0) return -1;
  if (activeDate) {
    const idx = dateKeys.indexOf(activeDate);
    if (idx >= 0) return idx;
  }
  return 0;
}

/** Next/prev index with clamp at ends. */
export function resolveAdjacentDateIndex(
  dateKeys: ReadonlyArray<string>,
  activeDate: string | null | undefined,
  direction: 'next' | 'prev'
): number {
  const current = resolveActiveDateIndex(dateKeys, activeDate);
  if (current < 0) return -1;
  if (direction === 'next') {
    return Math.min(current + 1, dateKeys.length - 1);
  }
  return Math.max(current - 1, 0);
}
