import { prisma } from '../apps/web/lib/prisma';

async function diagnoseRatings() {
  console.log('\n🔍 POWER RATING DIAGNOSTIC\n');
  console.log('='.repeat(70));
  
  // Get 15 recent games with market lines
  const games = await prisma.game.findMany({
    where: {
      season: 2025,
      week: { in: [10, 11] },
      status: 'final',
      marketLines: {
        some: { lineType: 'spread' }
      }
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      marketLines: {
        where: { lineType: 'spread' },
        take: 1
      }
    },
    take: 15
  });
  
  console.log(`\nSampling ${games.length} games from weeks 10-11:\n`);
  
  const ratios: number[] = [];
  
  for (const g of games) {
    // Get ratings for both teams
    const homeRating = await prisma.teamSeasonRating.findFirst({
      where: {
        teamId: g.homeTeamId,
        season: 2025,
        modelVersion: 'v1'
      }
    });
    
    const awayRating = await prisma.teamSeasonRating.findFirst({
      where: {
        teamId: g.awayTeamId,
        season: 2025,
        modelVersion: 'v1'
      }
    });
    
    if (!homeRating || !awayRating) {
      console.log(`   Skipping ${g.homeTeam.name} vs ${g.awayTeam.name} - missing ratings`);
      continue;
    }
    
    const homeRatingVal = Number(homeRating.rating || homeRating.powerRating || 0);
    const awayRatingVal = Number(awayRating.rating || awayRating.powerRating || 0);
    const ratingDiff = homeRatingVal - awayRatingVal;
    const marketSpread = g.marketLines[0]?.lineValue || 0;
    
    const idx = ratios.length + 1;
    console.log(`${idx.toString().padStart(2)}. ${g.homeTeam.name} vs ${g.awayTeam.name}`);
    console.log(`    Home: ${homeRatingVal.toFixed(2)} | Away: ${awayRatingVal.toFixed(2)} | Diff: ${ratingDiff.toFixed(2)}`);
    console.log(`    Market spread: ${marketSpread.toFixed(1)}`);
    
    if (ratingDiff !== 0) {
      const ratio = marketSpread / ratingDiff;
      ratios.push(ratio);
      console.log(`    Implied scaling: ${ratio.toFixed(2)}x (spread/rating)`);
    } else {
      console.log(`    Implied scaling: N/A (rating diff = 0)`);
    }
    console.log('');
  }
  
  if (ratios.length > 0) {
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const sortedRatios = [...ratios].sort((a, b) => a - b);
    const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];
    
    console.log('='.repeat(70));
    console.log('\n📊 SCALING ANALYSIS:\n');
    console.log(`  Average scaling factor: ${avgRatio.toFixed(2)}x`);
    console.log(`  Median scaling factor:  ${medianRatio.toFixed(2)}x`);
    console.log(`  Range: ${Math.min(...ratios).toFixed(2)}x to ${Math.max(...ratios).toFixed(2)}x`);
    
    console.log('\n💡 INTERPRETATION:\n');
    if (Math.abs(avgRatio) < 3) {
      console.log('  ❌ Ratings are NOT well-scaled to spreads');
      console.log('  → V1 power ratings need recalibration or rescaling');
      console.log(`  → Current: 1 rating point ≈ ${avgRatio.toFixed(1)} spread points`);
      console.log('  → Expected: 1 rating point ≈ 6-7 spread points');
    } else if (Math.abs(avgRatio) > 10) {
      console.log('  ⚠️  Ratings may be on wrong scale (too compressed)');
      console.log(`  → Current: 1 rating point ≈ ${avgRatio.toFixed(1)} spread points`);
      console.log('  → This suggests ratings need to be normalized/rescaled');
    } else {
      console.log('  ✅ Ratings appear reasonably scaled');
      console.log(`  → 1 rating point ≈ ${avgRatio.toFixed(1)} spread points`);
    }
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
  
  await prisma.$disconnect();
}

diagnoseRatings();
