/**
 * Data Mode Utility
 * 
 * Manages the DATA_MODE environment variable (seed | mock | real)
 */

export type DataMode = 'seed' | 'mock' | 'real';

/**
 * Get the current data mode from environment variable
 */
export function getDataMode(): DataMode {
  const mode = (process.env.DATA_MODE || 'seed').toLowerCase();
  
  if (mode === 'seed' || mode === 'mock' || mode === 'real') {
    return mode as DataMode;
  }
  
  console.warn(`Invalid DATA_MODE: ${mode}, defaulting to 'seed'`);
  return 'seed';
}

/**
 * Log the current data mode for debugging
 */
export function logDataMode(context: string) {
  const mode = getDataMode();
  console.log(`[${context}] Using data mode: ${mode.toUpperCase()}`);
  return mode;
}

/**
 * Get public data mode for client-side display
 * This should be safe to expose to the browser
 */
export function getPublicDataMode(): DataMode {
  // In production, you might want to expose this via an API endpoint
  // For now, we'll use an environment variable that Next.js can inline
  return getDataMode();
}
