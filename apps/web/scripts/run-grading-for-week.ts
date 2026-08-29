/**
 * Run Grading for a Week
 *
 * Delegates to gradeAvailableBets() (2C-2J-6A) — no independent settlement math.
 *
 * Usage:
 *   npx tsx apps/web/scripts/run-grading-for-week.ts 2025 10
 */

import { prisma } from '../lib/prisma';
import { gradeAvailableBets } from '../lib/grading/grading-service';

async function runGrading(season: number, week: number) {
  console.log(`\n🎯 Running grading for ${season} Week ${week}\n`);

  const summary = await gradeAvailableBets({
    season,
    week,
    force: false,
  });

  console.log(`\n✅ Grading complete:`);
  console.log(`   Graded: ${summary.graded}`);
  console.log(`   Pushes: ${summary.pushes}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Filled close prices: ${summary.filledClosePrice}`);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      'Usage: npx tsx apps/web/scripts/run-grading-for-week.ts <season> <week>'
    );
    console.error('Example: npx tsx apps/web/scripts/run-grading-for-week.ts 2025 10');
    process.exit(1);
  }

  const season = parseInt(args[0], 10);
  const week = parseInt(args[1], 10);

  if (isNaN(season) || isNaN(week)) {
    console.error('Error: season and week must be valid numbers');
    process.exit(1);
  }

  try {
    await runGrading(season, week);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
