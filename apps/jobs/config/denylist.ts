/**
 * Denylist for Non-FBS Team Slugs
 * 
 * These slugs are explicitly rejected from the FBS team index and alias resolution.
 * Use this to block non-FBS programs that pollute resolution (e.g., NAIA/D2/D3 schools
 * with similar names to FBS teams).
 * 
 * Common patterns to deny:
 * - *-college (non-FBS schools: mississippi-college, illinois-college, etc.)
 * - FCS/lower division schools with confusing names
 */

export const DENYLIST_SLUGS = new Set([
  // Non-FBS "*-college" schools
  'mississippi-college',      // Not Ole Miss (ole-miss)
  'illinois-college',          // Not Illinois (illinois)
  'louisiana-college',         // Not Louisiana (louisiana)
  'south-carolina-state',      // FCS, not South Carolina (south-carolina)
  'missouri-state',            // FCS, not Missouri (missouri)
  'tennessee-state',           // FCS, not Tennessee (tennessee)
  'arkansas-pine-bluff',       // FCS
  'alabama-state',             // FCS
  
  // Add others as needed when non-FBS slugs leak into resolution
]);

/**
 * Check if a slug is explicitly denied (non-FBS)
 */
export function isDenylisted(slug: string): boolean {
  return DENYLIST_SLUGS.has(slug);
}

/**
 * Check if a slug matches a known non-FBS pattern
 */
export function matchesNonFBSPattern(slug: string): boolean {
  // Pattern: *-college (except specific FBS exceptions if any)
  if (slug.endsWith('-college')) {
    return true;
  }
  
  // Could add other patterns here (e.g., *-a-m that aren't texas-a-m, etc.)
  return false;
}

/**
 * Combined check: is this slug rejected?
 */
export function isRejectedSlug(slug: string): boolean {
  return isDenylisted(slug) || matchesNonFBSPattern(slug);
}

