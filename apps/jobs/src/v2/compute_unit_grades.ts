/**
 * V2 Unit Grades Computation
 * 
 * Calculates granular unit grades (Run Offense, Pass Defense, etc.) from:
 * - PPA (Points Per Attempt) from CfbdPpaTeamGame
 * - Efficiency metrics (Line Yards, IsoPPP, Success Rate) from CfbdEffTeamGame
 * - Season-level Havoc from CfbdEffTeamSeason
 * 
 * Usage:
 *   npx tsx apps/jobs/src/v2/compute_unit_grades.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TeamStats {
  teamId: string;
  // Run metrics
  avgLineYardsOff: number | null;
  avgRushPpaOff: number | null;
  avgStuffRate: number | null;
  avgRushPpaDef: number | null;
  // Pass metrics
  avgPassPpaOff: number | null;
  avgPassSrOff: number | null;
  avgPassPpaDef: number | null;
  avgPassSrDef: number | null;
  // Explosiveness
  avgIsoPppOff: number | null;
  avgIsoPppDef: number | null;
  // Havoc (season-level only)
  havocOff: number | null;
  havocDef: number | null;
}

interface ZScoreStats {
  mean: number;
  stdDev: number;
}

/**
 * Calculate Z-score for a value
 */
function calculateZScore(value: number | null, stats: ZScoreStats): number | null {
  if (value === null || isNaN(value) || !isFinite(value)) {
    return null;
  }
  if (stats.stdDev === 0) {
    return 0; // All values are the same
  }
  return (value - stats.mean) / stats.stdDev;
}

/**
 * Calculate FBS-wide statistics for normalization
 */
function calculateZScoreStats(values: (number | null)[]): ZScoreStats {
  const validValues = values.filter((v): v is number => v !== null && isFinite(v) && !isNaN(v));
  
  if (validValues.length === 0) {
    return { mean: 0, stdDev: 1 };
  }
  
  const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
  const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;
  const stdDev = Math.sqrt(variance);
  
  return { mean, stdDev: stdDev || 1 }; // Avoid division by zero
}

/**
 * Fetch and aggregate team stats from game-level data
 */
async function fetchTeamStats(season: number): Promise<Map<string, TeamStats>> {
  const teamStatsMap = new Map<string, TeamStats>();
  
  // Fetch all FBS teams for the season
  const fbsTeams = await prisma.teamMembership.findMany({
    where: {
      season,
      level: 'fbs',
    },
    select: {
      teamId: true,
    },
  });
  
  // Initialize stats for all FBS teams
  for (const membership of fbsTeams) {
    teamStatsMap.set(membership.teamId, {
      teamId: membership.teamId,
      avgLineYardsOff: null,
      avgRushPpaOff: null,
      avgStuffRate: null,
      avgRushPpaDef: null,
      avgPassPpaOff: null,
      avgPassSrOff: null,
      avgPassPpaDef: null,
      avgPassSrDef: null,
      avgIsoPppOff: null,
      avgIsoPppDef: null,
      havocOff: null,
      havocDef: null,
    });
  }
  
  // Get games for the season to filter game-level stats
  const games = await prisma.cfbdGame.findMany({
    where: { season },
    select: { gameIdCfbd: true },
  });
  const gameIds = games.map(g => g.gameIdCfbd);
  
  // Fetch game-level efficiency stats
  const effGameStats = await prisma.cfbdEffTeamGame.findMany({
    where: {
      gameIdCfbd: { in: gameIds },
    },
  });
  
  // Aggregate efficiency stats by team
  const effAggregates = new Map<string, {
    lineYardsOff: number[];
    isoPppOff: number[];
    isoPppDef: number[];
    passSrOff: number[];
    passSrDef: number[];
    runEpaOff: number[];
    passEpaOff: number[];
    runEpaDef: number[];
    passEpaDef: number[];
  }>();
  
  for (const stat of effGameStats) {
    const teamId = stat.teamIdInternal;
    if (!teamStatsMap.has(teamId)) continue;
    
    if (!effAggregates.has(teamId)) {
      effAggregates.set(teamId, {
        lineYardsOff: [],
        isoPppOff: [],
        isoPppDef: [],
        passSrOff: [],
        passSrDef: [],
        runEpaOff: [],
        passEpaOff: [],
        runEpaDef: [],
        passEpaDef: [],
      });
    }
    
    const agg = effAggregates.get(teamId)!;
    
    if (stat.lineYardsOff !== null) {
      agg.lineYardsOff.push(Number(stat.lineYardsOff));
    }
    if (stat.isoPppOff !== null) {
      agg.isoPppOff.push(Number(stat.isoPppOff));
    }
    if (stat.isoPppDef !== null) {
      agg.isoPppDef.push(Number(stat.isoPppDef));
    }
    if (stat.passSr !== null) {
      agg.passSrOff.push(Number(stat.passSr));
    }
    if (stat.defSr !== null) {
      agg.passSrDef.push(Number(stat.defSr));
    }
    // Use runEpa/passEpa as proxies for rush/pass PPA
    if (stat.runEpa !== null) {
      agg.runEpaOff.push(Number(stat.runEpa));
    }
    if (stat.passEpa !== null) {
      agg.passEpaOff.push(Number(stat.passEpa));
    }
    // For defense, we need to get opponent's offensive stats
    // This is a simplification - in V2.1 we'll properly match opponent stats
  }
  
  // Fetch PPA game-level stats as fallback
  const ppaGameStats = await prisma.cfbdPpaTeamGame.findMany({
    where: {
      gameIdCfbd: { in: gameIds },
    },
  });
  
  // Aggregate PPA stats by team (overall PPA as fallback)
  const ppaAggregates = new Map<string, {
    ppaOffense: number[];
    ppaDefense: number[];
  }>();
  
  for (const stat of ppaGameStats) {
    const teamId = stat.teamIdInternal;
    if (!teamStatsMap.has(teamId)) continue;
    
    if (!ppaAggregates.has(teamId)) {
      ppaAggregates.set(teamId, {
        ppaOffense: [],
        ppaDefense: [],
      });
    }
    
    const agg = ppaAggregates.get(teamId)!;
    
    if (stat.ppaOffense !== null) {
      agg.ppaOffense.push(Number(stat.ppaOffense));
    }
    if (stat.ppaDefense !== null) {
      agg.ppaDefense.push(Number(stat.ppaDefense));
    }
  }
  
  // Calculate averages
  for (const [teamId, agg] of effAggregates) {
    const stats = teamStatsMap.get(teamId)!;
    stats.avgLineYardsOff = agg.lineYardsOff.length > 0
      ? agg.lineYardsOff.reduce((sum, v) => sum + v, 0) / agg.lineYardsOff.length
      : null;
    stats.avgIsoPppOff = agg.isoPppOff.length > 0
      ? agg.isoPppOff.reduce((sum, v) => sum + v, 0) / agg.isoPppOff.length
      : null;
    stats.avgIsoPppDef = agg.isoPppDef.length > 0
      ? agg.isoPppDef.reduce((sum, v) => sum + v, 0) / agg.isoPppDef.length
      : null;
    stats.avgPassSrOff = agg.passSrOff.length > 0
      ? agg.passSrOff.reduce((sum, v) => sum + v, 0) / agg.passSrOff.length
      : null;
    stats.avgPassSrDef = agg.passSrDef.length > 0
      ? agg.passSrDef.reduce((sum, v) => sum + v, 0) / agg.passSrDef.length
      : null;
    
    // Use runEpa/passEpa as proxies for rush/pass PPA
    const avgRunEpaOff = agg.runEpaOff.length > 0
      ? agg.runEpaOff.reduce((sum, v) => sum + v, 0) / agg.runEpaOff.length
      : null;
    const avgPassEpaOff = agg.passEpaOff.length > 0
      ? agg.passEpaOff.reduce((sum, v) => sum + v, 0) / agg.passEpaOff.length
      : null;
    
    // Use EPA as proxy for PPA (they're closely related)
    stats.avgRushPpaOff = avgRunEpaOff;
    stats.avgPassPpaOff = avgPassEpaOff;
  }
  
  // Use overall PPA as fallback for defense (will refine in V2.1)
  for (const [teamId, agg] of ppaAggregates) {
    const stats = teamStatsMap.get(teamId)!;
    const avgPpaOff = agg.ppaOffense.length > 0
      ? agg.ppaOffense.reduce((sum, v) => sum + v, 0) / agg.ppaOffense.length
      : null;
    const avgPpaDef = agg.ppaDefense.length > 0
      ? agg.ppaDefense.reduce((sum, v) => sum + v, 0) / agg.ppaDefense.length
      : null;
    
    // Fallback: use overall PPA if EPA not available
    if (stats.avgRushPpaOff === null) {
      stats.avgRushPpaOff = avgPpaOff;
    }
    if (stats.avgPassPpaOff === null) {
      stats.avgPassPpaOff = avgPpaOff;
    }
    // For defense, use overall PPA allowed as proxy
    stats.avgRushPpaDef = avgPpaDef;
    stats.avgPassPpaDef = avgPpaDef;
  }
  
  // Fetch season-level stats for Stuff Rate and Havoc
  const seasonStats = await prisma.cfbdEffTeamSeason.findMany({
    where: { season },
  });
  
  for (const stat of seasonStats) {
    const teamId = stat.teamIdInternal;
    if (!teamStatsMap.has(teamId)) continue;
    
    const stats = teamStatsMap.get(teamId)!;
    stats.avgStuffRate = stat.stuffRate !== null ? Number(stat.stuffRate) : null;
    stats.havocOff = stat.havocOff !== null ? Number(stat.havocOff) : null;
    stats.havocDef = stat.havocDef !== null ? Number(stat.havocDef) : null;
  }
  
  return teamStatsMap;
}

/**
 * Calculate unit grades from aggregated stats
 */
async function calculateUnitGrades(season: number): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 V2 UNIT GRADES COMPUTATION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}\n`);
  
  // Fetch team stats
  console.log('📊 Fetching and aggregating team stats...');
  const teamStatsMap = await fetchTeamStats(season);
  console.log(`   ✅ Loaded stats for ${teamStatsMap.size} teams\n`);
  
  // Calculate Z-score statistics for normalization
  console.log('📐 Calculating FBS-wide statistics for normalization...');
  
  const lineYardsValues = Array.from(teamStatsMap.values()).map(s => s.avgLineYardsOff);
  const rushPpaOffValues = Array.from(teamStatsMap.values()).map(s => s.avgRushPpaOff);
  const stuffRateValues = Array.from(teamStatsMap.values()).map(s => s.avgStuffRate);
  const rushPpaDefValues = Array.from(teamStatsMap.values()).map(s => s.avgRushPpaDef);
  const passPpaOffValues = Array.from(teamStatsMap.values()).map(s => s.avgPassPpaOff);
  const passSrOffValues = Array.from(teamStatsMap.values()).map(s => s.avgPassSrOff);
  const passPpaDefValues = Array.from(teamStatsMap.values()).map(s => s.avgPassPpaDef);
  const passSrDefValues = Array.from(teamStatsMap.values()).map(s => s.avgPassSrDef);
  const isoPppOffValues = Array.from(teamStatsMap.values()).map(s => s.avgIsoPppOff);
  const isoPppDefValues = Array.from(teamStatsMap.values()).map(s => s.avgIsoPppDef);
  const havocOffValues = Array.from(teamStatsMap.values()).map(s => s.havocOff);
  const havocDefValues = Array.from(teamStatsMap.values()).map(s => s.havocDef);
  
  const zStats = {
    lineYardsOff: calculateZScoreStats(lineYardsValues),
    rushPpaOff: calculateZScoreStats(rushPpaOffValues),
    stuffRate: calculateZScoreStats(stuffRateValues),
    rushPpaDef: calculateZScoreStats(rushPpaDefValues),
    passPpaOff: calculateZScoreStats(passPpaOffValues),
    passSrOff: calculateZScoreStats(passSrOffValues),
    passPpaDef: calculateZScoreStats(passPpaDefValues),
    passSrDef: calculateZScoreStats(passSrDefValues),
    isoPppOff: calculateZScoreStats(isoPppOffValues),
    isoPppDef: calculateZScoreStats(isoPppDefValues),
    havocOff: calculateZScoreStats(havocOffValues),
    havocDef: calculateZScoreStats(havocDefValues),
  };
  
  console.log(`   ✅ Calculated Z-score stats for all metrics\n`);
  
  // Calculate unit grades for each team
  console.log('🎓 Calculating unit grades...');
  let upserted = 0;
  let skipped = 0;
  
  for (const [teamId, stats] of teamStatsMap) {
    // Calculate Z-scores
    const lineYardsZ = calculateZScore(stats.avgLineYardsOff, zStats.lineYardsOff);
    const rushPpaOffZ = calculateZScore(stats.avgRushPpaOff, zStats.rushPpaOff);
    const stuffRateZ = calculateZScore(stats.avgStuffRate, zStats.stuffRate);
    const rushPpaDefZ = calculateZScore(stats.avgRushPpaDef, zStats.rushPpaDef);
    const passPpaOffZ = calculateZScore(stats.avgPassPpaOff, zStats.passPpaOff);
    const passSrOffZ = calculateZScore(stats.avgPassSrOff, zStats.passSrOff);
    const passPpaDefZ = calculateZScore(stats.avgPassPpaDef, zStats.passPpaDef);
    const passSrDefZ = calculateZScore(stats.avgPassSrDef, zStats.passSrDef);
    const isoPppOffZ = calculateZScore(stats.avgIsoPppOff, zStats.isoPppOff);
    const isoPppDefZ = calculateZScore(stats.avgIsoPppDef, zStats.isoPppDef);
    const havocOffZ = calculateZScore(stats.havocOff, zStats.havocOff);
    const havocDefZ = calculateZScore(stats.havocDef, zStats.havocDef);
    
    // Calculate unit grades (50/50 blend)
    const offRunGrade = (lineYardsZ !== null && rushPpaOffZ !== null)
      ? (lineYardsZ * 0.5) + (rushPpaOffZ * 0.5)
      : (lineYardsZ ?? rushPpaOffZ ?? 0);
    
    // Defensive run grade: Invert stuff rate (higher is better) and rush PPA allowed (lower is better)
    const stuffRateZInverted = stuffRateZ !== null ? stuffRateZ : null; // Stuff rate: higher is better
    const rushPpaDefZInverted = rushPpaDefZ !== null ? -rushPpaDefZ : null; // Lower PPA allowed = better
    const defRunGrade = (stuffRateZInverted !== null && rushPpaDefZInverted !== null)
      ? (stuffRateZInverted * 0.5) + (rushPpaDefZInverted * 0.5)
      : (stuffRateZInverted ?? rushPpaDefZInverted ?? 0);
    
    const offPassGrade = (passPpaOffZ !== null && passSrOffZ !== null)
      ? (passPpaOffZ * 0.5) + (passSrOffZ * 0.5)
      : (passPpaOffZ ?? passSrOffZ ?? 0);
    
    // Defensive pass grade: Invert PPA allowed and success rate allowed
    const passPpaDefZInverted = passPpaDefZ !== null ? -passPpaDefZ : null;
    const passSrDefZInverted = passSrDefZ !== null ? -passSrDefZ : null;
    const defPassGrade = (passPpaDefZInverted !== null && passSrDefZInverted !== null)
      ? (passPpaDefZInverted * 0.5) + (passSrDefZInverted * 0.5)
      : (passPpaDefZInverted ?? passSrDefZInverted ?? 0);
    
    const offExplosiveness = isoPppOffZ ?? 0;
    const defExplosiveness = isoPppDefZ !== null ? -isoPppDefZ : 0; // Lower IsoPPP allowed = better
    
    // Havoc: Higher is better for defense, lower is better for offense (less havoc allowed)
    const havocGrade = (havocDefZ !== null && havocOffZ !== null)
      ? (havocDefZ * 0.5) - (havocOffZ * 0.5) // Defense good, offense bad
      : (havocDefZ ?? -havocOffZ ?? 0);
    
    try {
      await prisma.teamUnitGrades.upsert({
        where: {
          teamId_season: {
            teamId,
            season,
          },
        },
        update: {
          offRunGrade,
          defRunGrade,
          offPassGrade,
          defPassGrade,
          offExplosiveness,
          defExplosiveness,
          havocGrade,
        },
        create: {
          teamId,
          season,
          offRunGrade,
          defRunGrade,
          offPassGrade,
          defPassGrade,
          offExplosiveness,
          defExplosiveness,
          havocGrade,
        },
      });
      upserted++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upsert grades for team ${teamId}: ${error.message}`);
      skipped++;
    }
  }
  
  console.log(`   ✅ Upserted ${upserted} team unit grades • skipped: ${skipped}\n`);
  
  // Audit: Log top teams
  console.log('🏆 TOP TEAMS BY UNIT GRADE:\n');
  
  const topRunOff = await prisma.teamUnitGrades.findMany({
    where: { season },
    orderBy: { offRunGrade: 'desc' },
    take: 5,
    include: { team: { select: { name: true } } },
  });
  
  const topRunDef = await prisma.teamUnitGrades.findMany({
    where: { season },
    orderBy: { defRunGrade: 'desc' },
    take: 5,
    include: { team: { select: { name: true } } },
  });
  
  const topPassOff = await prisma.teamUnitGrades.findMany({
    where: { season },
    orderBy: { offPassGrade: 'desc' },
    take: 5,
    include: { team: { select: { name: true } } },
  });
  
  const topPassDef = await prisma.teamUnitGrades.findMany({
    where: { season },
    orderBy: { defPassGrade: 'desc' },
    take: 5,
    include: { team: { select: { name: true } } },
  });
  
  console.log('🔥 Top 5 Run Offenses:');
  topRunOff.forEach((g, i) => {
    console.log(`   ${i + 1}. ${g.team.name}: ${g.offRunGrade.toFixed(2)}`);
  });
  
  console.log('\n🛡️  Top 5 Run Defenses:');
  topRunDef.forEach((g, i) => {
    console.log(`   ${i + 1}. ${g.team.name}: ${g.defRunGrade.toFixed(2)}`);
  });
  
  console.log('\n✈️  Top 5 Pass Offenses:');
  topPassOff.forEach((g, i) => {
    console.log(`   ${i + 1}. ${g.team.name}: ${g.offPassGrade.toFixed(2)}`);
  });
  
  console.log('\n🛡️  Top 5 Pass Defenses:');
  topPassDef.forEach((g, i) => {
    console.log(`   ${i + 1}. ${g.team.name}: ${g.defPassGrade.toFixed(2)}`);
  });
  
  console.log(`\n${'='.repeat(70)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  try {
    await calculateUnitGrades(season);
  } catch (error) {
    console.error('❌ Computation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

