/**
 * Audit script to reverse-engineer and validate power rating calculation
 */

import { prisma } from '../apps/web/lib/prisma';

// From documentation: weights for power rating calculation
const WEIGHTS = {
  successOff: 0.20,
  successDef: 0.25,
  epaOff: 0.15,
  epaDef: 0.20,
  yppOff: 0.30,
  yppDef: 0.20
};

async function auditPowerRatings() {
  console.log(`\n🔬 AUDITING POWER RATING CALCULATION\n`);

  // Get all teams' ratings and stats for 2025
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { id: 'ohio-state' },
        { id: 'purdue' }
      ]
    }
  });

  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season: 2025,
      modelVersion: 'v1',
      teamId: { in: teams.map(t => t.id) }
    }
  });

  const stats = await prisma.teamSeasonStat.findMany({
    where: {
      season: 2025,
      teamId: { in: teams.map(t => t.id) }
    }
  });

  // Get all teams' stats to calculate mean and stddev
  const allStats = await prisma.teamSeasonStat.findMany({
    where: { season: 2025 }
  });

  // Calculate mean and stddev for each stat
  function calcMeanStdDev(values: number[]) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stddev = Math.sqrt(variance);
    return { mean, stddev };
  }

  const statMetrics = {
    epaOff: calcMeanStdDev(allStats.map(s => Number(s.epaOff || 0))),
    epaDef: calcMeanStdDev(allStats.map(s => Number(s.epaDef || 0))),
    yppOff: calcMeanStdDev(allStats.map(s => Number(s.yppOff || 0))),
    yppDef: calcMeanStdDev(allStats.map(s => Number(s.yppDef || 0))),
    successOff: calcMeanStdDev(allStats.map(s => Number(s.successOff || 0))),
    successDef: calcMeanStdDev(allStats.map(s => Number(s.successDef || 0)))
  };

  console.log(`📊 LEAGUE AVERAGES & STD DEVIATIONS (n=${allStats.length} teams):\n`);
  Object.entries(statMetrics).forEach(([stat, { mean, stddev }]) => {
    console.log(`   ${stat}: μ=${mean.toFixed(4)}, σ=${stddev.toFixed(4)}`);
  });
  console.log();

  // For each team, calculate power rating
  for (const team of teams) {
    const teamStats = stats.find(s => s.teamId === team.id);
    const teamRating = ratings.find(r => r.teamId === team.id);

    if (!teamStats) {
      console.log(`❌ No stats found for ${team.name}\n`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏈 ${team.name.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);

    // Calculate z-scores
    const zScores: Record<string, number> = {};
    const contributions: Record<string, number> = {};
    
    // Offensive stats (higher is better)
    zScores.epaOff = (Number(teamStats.epaOff || 0) - statMetrics.epaOff.mean) / statMetrics.epaOff.stddev;
    zScores.yppOff = (Number(teamStats.yppOff || 0) - statMetrics.yppOff.mean) / statMetrics.yppOff.stddev;
    zScores.successOff = (Number(teamStats.successOff || 0) - statMetrics.successOff.mean) / statMetrics.successOff.stddev;
    
    // Defensive stats (LOWER is better, so negate the z-score)
    zScores.epaDef = -(Number(teamStats.epaDef || 0) - statMetrics.epaDef.mean) / statMetrics.epaDef.stddev;
    zScores.yppDef = -(Number(teamStats.yppDef || 0) - statMetrics.yppDef.mean) / statMetrics.yppDef.stddev;
    zScores.successDef = -(Number(teamStats.successDef || 0) - statMetrics.successDef.mean) / statMetrics.successDef.stddev;

    // Calculate contributions
    contributions.epaOff = WEIGHTS.epaOff * zScores.epaOff;
    contributions.epaDef = WEIGHTS.epaDef * zScores.epaDef;
    contributions.yppOff = WEIGHTS.yppOff * zScores.yppOff;
    contributions.yppDef = WEIGHTS.yppDef * zScores.yppDef;
    contributions.successOff = WEIGHTS.successOff * zScores.successOff;
    contributions.successDef = WEIGHTS.successDef * zScores.successDef;

    // Calculate total power rating
    const calculatedPowerRating = Object.values(contributions).reduce((a, b) => a + b, 0);

    console.log(`📊 RAW STATS:`);
    console.log(`   EPA Off: ${Number(teamStats.epaOff || 0).toFixed(4)}`);
    console.log(`   EPA Def: ${Number(teamStats.epaDef || 0).toFixed(4)}`);
    console.log(`   YPP Off: ${Number(teamStats.yppOff || 0).toFixed(4)}`);
    console.log(`   YPP Def: ${Number(teamStats.yppDef || 0).toFixed(4)}`);
    console.log(`   Success Off: ${Number(teamStats.successOff || 0).toFixed(4)}`);
    console.log(`   Success Def: ${Number(teamStats.successDef || 0).toFixed(4)}\n`);

    console.log(`📐 Z-SCORES (std devs from mean):`);
    Object.entries(zScores).forEach(([stat, zscore]) => {
      const color = zscore > 0 ? '⬆️' : '⬇️';
      console.log(`   ${stat}: ${color} ${zscore.toFixed(3)}`);
    });
    console.log();

    console.log(`⚖️  WEIGHTED CONTRIBUTIONS (weight × z-score):`);
    Object.entries(contributions).forEach(([stat, contrib]) => {
      const weight = WEIGHTS[stat as keyof typeof WEIGHTS];
      const zscore = zScores[stat];
      console.log(`   ${stat}: ${weight.toFixed(2)} × ${zscore.toFixed(3)} = ${contrib.toFixed(4)}`);
    });
    console.log();

    console.log(`🎯 POWER RATING:`);
    console.log(`   Calculated: ${calculatedPowerRating.toFixed(4)}`);
    console.log(`   In Database: ${Number(teamRating?.powerRating || 0).toFixed(4)}`);
    console.log(`   Match: ${Math.abs(calculatedPowerRating - Number(teamRating?.powerRating || 0)) < 0.001 ? '✅' : '❌'}`);
  }

  console.log(`\n${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

auditPowerRatings().catch(console.error);

