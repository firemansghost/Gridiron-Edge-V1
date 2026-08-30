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
