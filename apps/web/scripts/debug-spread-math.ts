/**
 * Debug Spread Math
 * 
 * Tests the spread calculation with a known case:
 * - Home Team: Rating 50.0 (Favorite)
 * - Away Team: Rating 20.0 (Underdog)
 * - HFA: 2.0
 * 
 * Expected: Home should be favored by ~32.0 points (negative spread)
 */

import { getCoreV1SpreadFromTeams } from '../lib/core-v1-spread';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;

  console.log('\n🔍 DEBUGGING SPREAD MATH\n');
  console.log('='.repeat(70));

  // Test case: Oklahoma (Home, Rating ~54.5) vs Missouri (Away, Rating ~30.0)
  // Expected: Oklahoma should be favored by ~26.5 points (negative spread)
  
  // First, get actual team IDs and ratings
  const oklahoma = await prisma.team.findFirst({
    where: {
      name: {
        contains: 'Oklahoma',
        mode: 'insensitive',
      },
    },
    select: { id: true, name: true },
  });

  // Find Missouri (FBS team, not Southeast Missouri State)
  const missouri = await prisma.team.findFirst({
    where: {
      AND: [
        {
          name: {
            contains: 'Missouri',
            mode: 'insensitive',
          },
        },
        {
          OR: [
            { conference: 'SEC' },
            { conference: { contains: 'SEC', mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, name: true, conference: true },
  });

  if (!oklahoma || !missouri) {
    console.error('❌ Could not find Oklahoma or Missouri');
    return;
  }

  console.log(`\n📊 Test Case: ${oklahoma.name} (Home) vs ${missouri.name} (Away)`);
  console.log(`   Season: ${season}`);

  // Get their actual ratings
  const [okRating, moRating] = await Promise.all([
    prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season,
          teamId: oklahoma.id,
          modelVersion: 'v1',
        },
      },
    }),
    prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season,
          teamId: missouri.id,
          modelVersion: 'v1',
        },
      },
    }),
  ]);

  const okRatingValue = okRating ? Number(okRating.powerRating || okRating.rating || 0) : 0;
  const moRatingValue = moRating ? Number(moRating.powerRating || moRating.rating || 0) : 0;

  console.log(`\n📈 Ratings:`);
  console.log(`   ${oklahoma.name}: ${okRatingValue.toFixed(2)}`);
  console.log(`   ${missouri.name}: ${moRatingValue.toFixed(2)}`);
  console.log(`   Difference: ${(okRatingValue - moRatingValue).toFixed(2)} (Oklahoma should be favored)`);

  // Compute spread
  try {
    const spreadInfo = await getCoreV1SpreadFromTeams(
      season,
      oklahoma.id, // Home
      missouri.id, // Away
      false, // Not neutral
      oklahoma.name,
      missouri.name
    );

    console.log(`\n🎯 Spread Calculation Results:`);
    console.log(`   coreSpreadHma: ${spreadInfo.coreSpreadHma.toFixed(2)}`);
    console.log(`   ratingDiffBlend: ${spreadInfo.ratingDiffBlend.toFixed(2)}`);
    console.log(`   HFA (effective): ${spreadInfo.hfaInfo.effectiveHfa.toFixed(2)}`);
    console.log(`   Favorite: ${spreadInfo.favoriteName}`);
    console.log(`   Favorite Spread: ${spreadInfo.favoriteSpread.toFixed(2)}`);
    console.log(`   Underdog Spread: +${spreadInfo.dogSpread.toFixed(2)}`);
    console.log(`   Favorite Line: ${spreadInfo.favoriteLine}`);

    // Validation
    console.log(`\n✅ Validation:`);
    const isOklahomaFavorite = spreadInfo.favoriteTeamId === oklahoma.id;
    const expectedSpread = -(okRatingValue - moRatingValue + spreadInfo.hfaInfo.effectiveHfa);
    const actualSpread = spreadInfo.favoriteSpread;
    
    console.log(`   Rating Difference: ${okRatingValue.toFixed(2)} - ${moRatingValue.toFixed(2)} = ${(okRatingValue - moRatingValue).toFixed(2)}`);
    console.log(`   ratingDiffBlend: ${spreadInfo.ratingDiffBlend.toFixed(2)}`);
    console.log(`   coreSpreadHma: ${spreadInfo.coreSpreadHma.toFixed(2)}`);
    
    if (isOklahomaFavorite) {
      console.log(`   ✅ Oklahoma is correctly identified as favorite`);
    } else {
      console.log(`   ❌ ERROR: Missouri is incorrectly identified as favorite!`);
      console.log(`      Expected: Oklahoma (rating ${okRatingValue.toFixed(2)} > ${moRatingValue.toFixed(2)})`);
      console.log(`      This indicates the spread sign is still backwards!`);
    }

    if (spreadInfo.coreSpreadHma > 0) {
      console.log(`   ✅ coreSpreadHma is positive (home favored in HMA frame)`);
    } else {
      console.log(`   ❌ ERROR: coreSpreadHma is negative (away favored) when home should be favored!`);
    }

    if (Math.abs(actualSpread - expectedSpread) < 10.0) {
      console.log(`   ✅ Spread magnitude is reasonable (${actualSpread.toFixed(2)} vs expected ~${expectedSpread.toFixed(2)})`);
    } else {
      console.log(`   ⚠️  Spread magnitude differs significantly (${actualSpread.toFixed(2)} vs expected ~${expectedSpread.toFixed(2)})`);
    }

    if (actualSpread < 0) {
      console.log(`   ✅ Favorite spread is negative (correct betting convention)`);
    } else {
      console.log(`   ❌ ERROR: Favorite spread is positive (should be negative)!`);
    }

  } catch (error) {
    console.error('❌ Error computing spread:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

