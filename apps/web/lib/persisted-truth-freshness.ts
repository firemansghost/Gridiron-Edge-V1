/**
 * Freshness contract for persisted operational truth
 * (Official Card, Week Archive, Week/Season Review).
 *
 * These surfaces read Prisma Bet/Game rows that guarded GitHub Actions
 * mutate outside of a Vercel redeploy. Responses and client fetches must
 * not be retained by CDN/browser HTTP caches.
 */

export const PERSISTED_TRUTH_CACHE_CONTROL =
  'private, no-store, max-age=0, must-revalidate';

export const persistedTruthFetchInit: RequestInit = {
  cache: 'no-store',
};

export function persistedTruthResponseHeaders(): HeadersInit {
  return {
    'Cache-Control': PERSISTED_TRUTH_CACHE_CONTROL,
  };
}

/**
 * Re-run a read-only load when the operator returns to the tab after an
 * external guarded production write. Debounced so focus + visibility
 * events in the same moment only trigger one refresh.
 */
export function subscribePersistedTruthRefresh(
  onRefresh: () => void,
  debounceMs = 1000
): () => void {
  let lastRun = 0;
  const run = () => {
    const now = Date.now();
    if (now - lastRun < debounceMs) return;
    lastRun = now;
    onRefresh();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') run();
  };

  window.addEventListener('focus', run);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('focus', run);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
