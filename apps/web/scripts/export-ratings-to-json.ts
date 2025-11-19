/**
 * Export Ratings from Database to JSON Config
 * 
 * Exports TeamSeasonRating data to JSON format for use by the spread model.
 * Currently exports V1 ratings (since we just computed them with conference adjustments).
 * 
 * Usage:
 *   npx tsx apps/web/scripts/export-ratings-to-json.ts --season 2025 --model-version v1
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const yargs = require('yargs/yargs');
  const argv = yargs(process.argv.slice(2))
    .option('season', { type: 'number', default: 2025 })
    .option('model-version', { type: 'string', default: 'v1', choices: ['v1', 'v2'] })
    .parse();

  const season = Number(argv.season);
  const modelVersion = argv['model-version'] || 'v1';

  console.log(`\n📤 EXPORTING RATINGS TO JSON (Season ${season}, Model ${modelVersion})\n`);
  console.log('='.repeat(70));

  // Fetch all ratings for this season and model version
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion,
    },
    select: {
      teamId: true,
      powerRating: true,
      offenseRating: true,
      defenseRating: true,
      games: true,
    },
    orderBy: {
      powerRating: 'desc',
    },
  });

  console.log(`\n📊 Found ${ratings.length} ratings in database`);

  if (ratings.length === 0) {
    console.log('❌ No ratings found! Make sure ratings have been computed.');
    return;
  }

  // Format as JSON object: teamId -> { powerRating, offenseRating, defenseRating, games }
  const ratingsMap: Record<string, {
    powerRating: number;
    offenseRating: number | null;
    defenseRating: number | null;
    games: number;
  }> = {};

  for (const rating of ratings) {
    ratingsMap[rating.teamId] = {
      powerRating: rating.powerRating ? Number(rating.powerRating) : 0,
      offenseRating: rating.offenseRating ? Number(rating.offenseRating) : null,
      defenseRating: rating.defenseRating ? Number(rating.defenseRating) : null,
      games: rating.games,
    };
  }

  // Determine output file path
  const outputFile = path.join(
    process.cwd(),
    'apps',
    'web',
    'lib',
    'data',
    `core_v1_ratings_${modelVersion}_${season}.json`
  );

  // Write JSON file
  const jsonContent = JSON.stringify(ratingsMap, null, 2);
  fs.writeFileSync(outputFile, jsonContent, 'utf-8');

  console.log(`\n✅ Exported ${ratings.length} team ratings to:`);
  console.log(`   ${outputFile}`);

  // Show sample of top/bottom ratings
  const sortedRatings = Array.from(Object.entries(ratingsMap))
    .sort((a, b) => b[1].powerRating - a[1].powerRating);

  console.log(`\n📈 Sample Ratings (Top 5):`);
  for (let i = 0; i < Math.min(5, sortedRatings.length); i++) {
    const [teamId, data] = sortedRatings[i];
    console.log(`   ${i + 1}. ${teamId}: ${data.powerRating.toFixed(2)} (${data.games} games)`);
  }

  console.log(`\n📉 Sample Ratings (Bottom 5):`);
  for (let i = Math.max(0, sortedRatings.length - 5); i < sortedRatings.length; i++) {
    const [teamId, data] = sortedRatings[i];
    console.log(`   ${sortedRatings.length - i}. ${teamId}: ${data.powerRating.toFixed(2)} (${data.games} games)`);
  }

  // Check for specific teams mentioned in the issue
  const ohioState = ratingsMap['ohio-state'] || ratingsMap['ohio-state-buckeyes'];
  const rutgers = ratingsMap['rutgers'];

  if (ohioState) {
    console.log(`\n🔍 Ohio State: ${ohioState.powerRating.toFixed(2)}`);
  }
  if (rutgers) {
    console.log(`🔍 Rutgers: ${rutgers.powerRating.toFixed(2)}`);
  }
  if (ohioState && rutgers) {
    const diff = ohioState.powerRating - rutgers.powerRating;
    console.log(`   Rating Difference: ${diff.toFixed(2)}`);
    console.log(`   Expected Spread (OSU home): ~${(diff + 2.0).toFixed(1)}`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

