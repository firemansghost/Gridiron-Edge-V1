/**
 * Analyze Missouri Rating Breakdown
 * 
 * Shows the complete breakdown of how Missouri's V1 Power Rating is calculated
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const teamId = 'missouri'; // Direct ID lookup

  console.log(`\n🔍 MISSOURI RATING BREAKDOWN ANALYSIS (Season ${season})\n`);
  console.log('='.repeat(70));

  // Get team
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, conference: true },
  });

  if (!team) {
    console.error(`❌ Team '${teamId}' not found`);
    return;
  }

  console.log(`\n📊 Team: ${team.name}`);
  console.log(`   Conference: ${team.conference || 'NULL'}`);

  // Get V1 rating
  const rating = await prisma.teamSeasonRating.findUnique({
    where: {
      season_teamId_modelVersion: {
        season,
        teamId: team.id,
        modelVersion: 'v1',
      },
    },
  });

  if (!rating) {
    console.error(`❌ No V1 rating found`);
    return;
  }

  const powerRating = Number(rating.powerRating || rating.rating || 0);
  const offenseRating = Number(rating.offenseRating || 0);
  const defenseRating = Number(rating.defenseRating || 0);

  console.log(`\n📈 V1 Power Rating Components:`);
  console.log(`   Power Rating: ${powerRating.toFixed(2)}`);
  console.log(`   Offense Rating: ${offenseRating.toFixed(2)}`);
  console.log(`   Defense Rating: ${defenseRating.toFixed(2)}`);

  // Calculate what the raw score and conference adjustment would be
  // Formula: powerRating = (rawScore + conferenceAdjustment) * calibrationFactor
  // calibrationFactor = 8.0 (from model-weights.yml)
  const calibrationFactor = 8.0;
  const adjustedScore = powerRating / calibrationFactor;
  
  // Conference adjustment (SEC = +5.0)
  const conferenceAdjustment = team.conference === 'SEC' ? 5.0 : 
                               team.conference ? -5.0 : -5.0; // Default to -5.0 if unknown
  
  const rawScore = adjustedScore - conferenceAdjustment;
  const base = offenseRating + defenseRating;
  const talentComponent = rawScore - base; // Estimated

  console.log(`\n🔬 Rating Breakdown:`);
  console.log(`   Adjusted Score (after conf): ${adjustedScore.toFixed(2)}`);
  console.log(`   Conference Adjustment: ${conferenceAdjustment > 0 ? '+' : ''}${conferenceAdjustment.toFixed(2)}`);
  console.log(`   Raw Score (before conf): ${rawScore.toFixed(2)}`);
  console.log(`   Base (Off + Def): ${base.toFixed(2)}`);
  console.log(`   Estimated Talent Component: ${talentComponent.toFixed(2)}`);
  console.log(`   Calibration Factor: ${calibrationFactor}`);

  // Get game stats to see actual performance
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: team.id },
        { awayTeamId: team.id },
      ],
      status: 'final',
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  console.log(`\n🎮 Game Results (${games.length} games):`);
  let wins = 0;
  let losses = 0;
  let totalPointsFor = 0;
  let totalPointsAgainst = 0;
  const opponents: string[] = [];

  for (const game of games) {
    const isHome = game.homeTeamId === team.id;
    const opponent = isHome ? game.awayTeam.name : game.homeTeam.name;
    const pointsFor = isHome ? (game.homeScore || 0) : (game.awayScore || 0);
    const pointsAgainst = isHome ? (game.awayScore || 0) : (game.homeScore || 0);
    const won = pointsFor > pointsAgainst;

    if (won) wins++;
    else losses++;

    totalPointsFor += pointsFor;
    totalPointsAgainst += pointsAgainst;
    opponents.push(opponent);

    const margin = pointsFor - pointsAgainst;
    console.log(`   ${isHome ? 'vs' : '@'} ${opponent.padEnd(30)} ${pointsFor}-${pointsAgainst} ${won ? 'W' : 'L'} (${margin > 0 ? '+' : ''}${margin})`);
  }

  console.log(`\n📊 Season Summary:`);
  console.log(`   Record: ${wins}-${losses} (${((wins / games.length) * 100).toFixed(1)}%)`);
  console.log(`   Points For: ${totalPointsFor} (${(totalPointsFor / games.length).toFixed(1)} avg)`);
  console.log(`   Points Against: ${totalPointsAgainst} (${(totalPointsAgainst / games.length).toFixed(1)} avg)`);
  console.log(`   Point Differential: ${totalPointsFor - totalPointsAgainst} (${((totalPointsFor - totalPointsAgainst) / games.length).toFixed(1)} avg per game)`);

  // Get efficiency stats
  const teamStats = await prisma.teamGameStat.findMany({
    where: {
      season,
      teamId: team.id,
      game: {
        status: 'final',
      },
    },
    select: {
      yppOff: true,
      yppDef: true,
      successOff: true,
      successDef: true,
      epaOff: true,
      epaDef: true,
    },
  });

  if (teamStats.length > 0) {
    const validStats = teamStats.filter(s => 
      s.yppOff !== null || s.yppDef !== null || 
      s.successOff !== null || s.successDef !== null ||
      s.epaOff !== null || s.epaDef !== null
    );

    if (validStats.length > 0) {
      const avgYppOff = validStats.reduce((sum, s) => sum + (s.yppOff || 0), 0) / validStats.length;
      const avgYppDef = validStats.reduce((sum, s) => sum + (s.yppDef || 0), 0) / validStats.length;
      const avgSuccessOff = validStats.reduce((sum, s) => sum + (s.successOff || 0), 0) / validStats.length;
      const avgSuccessDef = validStats.reduce((sum, s) => sum + (s.successDef || 0), 0) / validStats.length;
      const avgEpaOff = validStats.reduce((sum, s) => sum + (s.epaOff || 0), 0) / validStats.length;
      const avgEpaDef = validStats.reduce((sum, s) => sum + (s.epaDef || 0), 0) / validStats.length;

      console.log(`\n📈 Efficiency Metrics (${validStats.length} games with stats):`);
      console.log(`   YPP Offense: ${avgYppOff.toFixed(3)}`);
      console.log(`   YPP Defense: ${avgYppDef.toFixed(3)}`);
      console.log(`   Success Rate Offense: ${(avgSuccessOff * 100).toFixed(1)}%`);
      console.log(`   Success Rate Defense: ${(avgSuccessDef * 100).toFixed(1)}%`);
      console.log(`   EPA Offense: ${avgEpaOff.toFixed(3)}`);
      console.log(`   EPA Defense: ${avgEpaDef.toFixed(3)}`);
    } else {
      console.log(`\n⚠️  No efficiency stats found for ${team.name}`);
    }
  }

  // Compare to similar teams
  console.log(`\n🏆 Comparison to Other SEC Teams:`);
  const secTeams = await prisma.team.findMany({
    where: {
      conference: 'SEC',
    },
    select: { id: true, name: true },
  });

  const secRatings = await Promise.all(
    secTeams.map(async (t) => {
      const r = await prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season,
            teamId: t.id,
            modelVersion: 'v1',
          },
        },
      });
      return {
        name: t.name,
        rating: r ? Number(r.powerRating || r.rating || 0) : null,
      };
    })
  );

  const sortedSec = secRatings
    .filter(r => r.rating !== null)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));

  console.log(`   SEC Team Rankings (V1 Power Rating):`);
  for (let i = 0; i < Math.min(10, sortedSec.length); i++) {
    const r = sortedSec[i];
    const marker = r.name.toLowerCase().includes('missouri') ? ' ← MISSOURI' : '';
    console.log(`   ${(i + 1).toString().padStart(2)}. ${r.name.padEnd(35)} ${(r.rating || 0).toFixed(2)}${marker}`);
  }

  const missouriRank = sortedSec.findIndex(r => r.name.toLowerCase().includes('missouri')) + 1;
  console.log(`\n📊 Missouri's SEC Rank: #${missouriRank} of ${sortedSec.length} SEC teams`);

  // Analysis
  console.log(`\n💡 ANALYSIS:`);
  if (powerRating < -20) {
    console.log(`   ⚠️  Missouri's rating (${powerRating.toFixed(2)}) is very negative.`);
    console.log(`   This suggests:`);
    console.log(`   1. Efficiency metrics (YPP, Success Rate, EPA) are below average`);
    console.log(`   2. Despite being a top 25 team, they may win close games without dominating`);
    console.log(`   3. The model values efficiency over win-loss record`);
    console.log(`   4. Conference adjustment (+5.0) helps but may not be enough`);
  }
  
  if (rawScore < -5) {
    console.log(`   ⚠️  Raw score (${rawScore.toFixed(2)}) is very negative before conference adjustment.`);
    console.log(`   This means their efficiency stats are significantly below FBS average.`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

