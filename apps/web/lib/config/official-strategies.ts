/**
 * Official Strategy Tags Configuration
 * 
 * This file defines which strategyTag values count as "Official Trust-Market picks"
 * for Week Review and other production analytics.
 * 
 * Rules:
 * - Only strategy-run bets (source === 'strategy_run') with tags in this list
 *   are considered "Official Trust-Market picks"
 * - Demo/test strategies (demo_seed, test_grader, etc.) are explicitly excluded
 * - This list should be kept in sync with active rulesets that produce real bets
 */

/**
 * Strategy tags that are explicitly excluded from Official Trust-Market picks.
 * These are demo, test, or experimental strategies that should not appear in
 * production Week Review or analytics.
 */
export const EXCLUDED_STRATEGY_TAGS = [
  'demo_seed',
  'test_grader',
  'test',
  'demo',
  'experimental',
] as const;

/**
 * Check if a strategy tag is excluded (demo/test/experimental)
 */
export function isExcludedStrategyTag(tag: string): boolean {
  return EXCLUDED_STRATEGY_TAGS.some(excluded => 
    tag.toLowerCase().includes(excluded.toLowerCase())
  );
}

/**
 * Get official strategy tags from active rulesets.
 * 
 * This function queries the database to get active rulesets and returns
 * their names as potential strategy tags. In practice, strategyTag values
 * in bets should match ruleset names, but this provides a dynamic way to
 * identify official strategies.
 * 
 * Note: If strategyTag values don't match ruleset names exactly, you may
 * need to create a mapping table or update this function to handle the mapping.
 */
export async function getOfficialStrategyTags(): Promise<string[]> {
  // Dynamic import to avoid circular dependencies
  const { prisma } = await import('@/lib/prisma');
  
  const activeRulesets = await prisma.ruleset.findMany({
    where: { active: true },
    select: { name: true },
  });
  
  // Return ruleset names as potential strategy tags
  // Filter out any that match excluded patterns
  return activeRulesets
    .map(r => r.name)
    .filter(tag => !isExcludedStrategyTag(tag));
}

/**
 * Check if a strategy tag is an official Trust-Market strategy.
 * 
 * This is the main function to use when filtering bets for Week Review.
 * It checks:
 * 1. The tag is not in the excluded list
 * 2. The tag matches an active ruleset name (optional, can be disabled for flexibility)
 * 
 * @param tag - The strategyTag value from a bet
 * @param checkRulesets - If true, also verify the tag matches an active ruleset (default: false for performance)
 */
export async function isOfficialStrategyTag(
  tag: string,
  checkRulesets: boolean = false
): Promise<boolean> {
  // First check: exclude demo/test tags
  if (isExcludedStrategyTag(tag)) {
    return false;
  }
  
  // Second check: optionally verify it matches an active ruleset
  if (checkRulesets) {
    const officialTags = await getOfficialStrategyTags();
    return officialTags.includes(tag);
  }
  
  // If not excluded and we're not checking rulesets, assume it's official
  // (This allows flexibility for strategyTag values that don't match ruleset names exactly)
  return true;
}

/**
 * Get a list of official strategy tags for filtering queries.
 * 
 * This is optimized for use in Prisma where clauses.
 * Returns an array of tags that should be included in "Official Trust-Market" queries.
 * 
 * Note: This excludes demo/test tags but doesn't require exact ruleset matching
 * for performance reasons. If you need strict ruleset matching, use isOfficialStrategyTag
 * with checkRulesets=true for individual checks.
 */
export async function getOfficialStrategyTagsForFilter(): Promise<string[]> {
  const officialTags = await getOfficialStrategyTags();
  return officialTags.filter(tag => !isExcludedStrategyTag(tag));
}

