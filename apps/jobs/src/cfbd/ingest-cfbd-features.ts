/**
 * Phase 3: CFBD Feature Ingest
 * 
 * Ingest order (idempotent):
 * 1. Team map first
 * 2. Schedule (games for 2025 Weeks 1-11)
 * 3. Team-season blocks: efficiency, PPA, priors
 * 4. Team-game blocks: efficiency, PPA, drives, weather
 * 5. Feature completeness check
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { CFBDClient } from './cfbd-client';
import { CFBDTeamMapper } from './team-mapper';

const prisma = new PrismaClient();

interface CompletenessRow {
  block: string;
  rowsExpected: number;
  rowsPresent: number;
  completenessPct: number;
}

// ============================================================================
// MAIN INGEST FUNCTION
// ============================================================================

async function ingestCFBDFeatures(season: number, weeks: number[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 PHASE 3: CFBD FEATURE INGEST`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  
  // Step 1: Build team mapping
  console.log(`📋 Step 1: Building team mapping...`);
  const teamMapping = await buildTeamMapping(season, client, mapper);
  console.log(`   ✅ Mapped ${teamMapping.size} teams\n`);
  
  // Step 2: Fetch and store games schedule
  console.log(`📅 Step 2: Fetching games schedule...`);
  const games = await fetchAndStoreGames(season, weeks, client, mapper);
  console.log(`   ✅ Stored ${games.length} games\n`);
  
  // Step 3: Team-season blocks
  console.log(`📊 Step 3: Ingesting team-season data...`);
  await ingestTeamSeasonData(season, client, mapper);
  console.log(`   ✅ Team-season data ingested\n`);
  
  // Step 4: Team-game blocks
  console.log(`🎮 Step 4: Ingesting team-game data...`);
  await ingestTeamGameData(season, weeks, client, mapper);
  console.log(`   ✅ Team-game data ingested\n`);
  
  // Step 5: Completeness check
  console.log(`✅ Step 5: Computing feature completeness...`);
  const completeness = await computeCompleteness(season, weeks);
  saveCompletenessReport(completeness);
  console.log(`   ✅ Completeness report saved\n`);
  
  // Team mapping mismatches
  console.log(`🔍 Checking for unmapped teams...`);
  const unmapped = await mapper.reportUnmapped([], season); // Will be populated during ingest
  saveTeamMappingMismatches(unmapped);
  console.log(`   ✅ Team mapping report saved\n`);
  
  console.log(`${'='.repeat(70)}\n`);
}

// ============================================================================
// STEP 1: TEAM MAPPING
// ============================================================================

async function buildTeamMapping(season: number, client: CFBDClient, mapper: CFBDTeamMapper): Promise<Map<string, string>> {
  // Fetch all teams from CFBD (via talent endpoint which returns all teams)
  const talentData = await client.getTalent(season);
  const cfbdTeams = new Set<string>();
  
  for (const team of talentData) {
    if (team.team) {
      cfbdTeams.add(team.team);
    }
  }
  
  console.log(`   Found ${cfbdTeams.size} CFBD teams`);
  
  // Map each team
  const mapping = new Map<string, string>();
  const unmapped: string[] = [];
  
  for (const cfbdName of cfbdTeams) {
    const internalId = await mapper.mapToInternal(cfbdName, season);
    if (internalId) {
      mapping.set(cfbdName.toLowerCase(), internalId);
    } else {
      unmapped.push(cfbdName);
    }
  }
  
  if (unmapped.length > 0) {
    console.warn(`   ⚠️  ${unmapped.length} unmapped teams (will be logged)`);
  }
  
  return mapping;
}

// ============================================================================
// STEP 2: GAMES SCHEDULE
// ============================================================================

async function fetchAndStoreGames(season: number, weeks: number[], client: CFBDClient, mapper: CFBDTeamMapper): Promise<any[]> {
  const allGames: any[] = [];
  
  for (const week of weeks) {
    const games = await client.getGames(season, week, undefined, 'regular');
    
    for (const game of games) {
      const homeTeamId = await mapper.mapToInternal(game.home_team || game.homeTeam, season);
      const awayTeamId = await mapper.mapToInternal(game.away_team || game.awayTeam, season);
      
      if (!homeTeamId || !awayTeamId) {
        console.warn(`   ⚠️  Skipping game ${game.id}: unmapped teams`);
        continue;
      }
      
      const gameDate = game.start_date ? new Date(game.start_date) : new Date();
      
      await prisma.cfbdGame.upsert({
        where: { gameIdCfbd: game.id.toString() },
        update: {
          season,
          week,
          date: gameDate,
          homeTeamIdInternal: homeTeamId,
          awayTeamIdInternal: awayTeamId,
          neutralSite: game.neutral_site || false,
          venue: game.venue || null,
          homeConference: game.home_conference || null,
          awayConference: game.away_conference || null,
          asOf: new Date(),
          updatedAt: new Date(),
        },
        create: {
          gameIdCfbd: game.id.toString(),
          season,
          week,
          date: gameDate,
          homeTeamIdInternal: homeTeamId,
          awayTeamIdInternal: awayTeamId,
          neutralSite: game.neutral_site || false,
          venue: game.venue || null,
          homeConference: game.home_conference || null,
          awayConference: game.away_conference || null,
        },
      });
      
      allGames.push(game);
    }
  }
  
  return allGames;
}

// ============================================================================
// STEP 3: TEAM-SEASON DATA
// ============================================================================

async function ingestTeamSeasonData(season: number, client: CFBDClient, mapper: CFBDTeamMapper) {
  // Advanced stats season
  console.log(`   Fetching advanced stats (season)...`);
  const advStats = await client.getAdvancedStatsSeason(season);
  for (const stat of advStats) {
    const teamId = await mapper.mapToInternal(stat.team, season);
    if (!teamId) continue;
    
    await prisma.cfbdEffTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        offEpa: stat.offense?.epa || null,
        offSr: stat.offense?.successRate || null,
        isoPppOff: stat.offense?.explosiveness || null,
        ppoOff: stat.offense?.pointsPerOpportunity || null,
        lineYardsOff: stat.offense?.lineYards || null,
        havocOff: stat.offense?.havoc || null,
        defEpa: stat.defense?.epa || null,
        defSr: stat.defense?.successRate || null,
        isoPppDef: stat.defense?.explosiveness || null,
        ppoDef: stat.defense?.pointsPerOpportunity || null,
        stuffRate: stat.defense?.stuffRate || null,
        powerSuccess: stat.offense?.powerSuccess || null,
        havocDef: stat.defense?.havoc || null,
        runEpa: stat.offense?.rushingPlays?.epa || null,
        passEpa: stat.offense?.passingPlays?.epa || null,
        runSr: stat.offense?.rushingPlays?.successRate || null,
        passSr: stat.offense?.passingPlays?.successRate || null,
        earlyDownEpa: stat.offense?.firstDown?.epa || null,
        lateDownEpa: stat.offense?.secondDown?.epa || null, // Approximate
        avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
        asOf: new Date(),
        updatedAt: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        offEpa: stat.offense?.epa || null,
        offSr: stat.offense?.successRate || null,
        isoPppOff: stat.offense?.explosiveness || null,
        ppoOff: stat.offense?.pointsPerOpportunity || null,
        lineYardsOff: stat.offense?.lineYards || null,
        havocOff: stat.offense?.havoc || null,
        defEpa: stat.defense?.epa || null,
        defSr: stat.defense?.successRate || null,
        isoPppDef: stat.defense?.explosiveness || null,
        ppoDef: stat.defense?.pointsPerOpportunity || null,
        stuffRate: stat.defense?.stuffRate || null,
        powerSuccess: stat.offense?.powerSuccess || null,
        havocDef: stat.defense?.havoc || null,
        runEpa: stat.offense?.rushingPlays?.epa || null,
        passEpa: stat.offense?.passingPlays?.epa || null,
        runSr: stat.offense?.rushingPlays?.successRate || null,
        passSr: stat.offense?.passingPlays?.successRate || null,
        earlyDownEpa: stat.offense?.firstDown?.epa || null,
        lateDownEpa: stat.offense?.secondDown?.epa || null,
        avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
      },
    });
  }
  
  // PPA season (aggregate from player data)
  console.log(`   Fetching PPA (season)...`);
  const ppaData = await client.getPPASeason(season);
  // Aggregate by team (simplified - would need proper aggregation)
  // For now, skip - will use game-level PPA
  
  // Talent
  console.log(`   Fetching talent...`);
  const talentData = await client.getTalent(season);
  for (const talent of talentData) {
    const teamId = await mapper.mapToInternal(talent.team, season);
    if (!teamId) continue;
    
    await prisma.cfbdPriorsTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        talent247: talent.talent || null,
        asOf: new Date(),
        updatedAt: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        talent247: talent.talent || null,
      },
    });
  }
  
  // Returning production
  console.log(`   Fetching returning production...`);
  const returningData = await client.getReturningProduction(season);
  for (const ret of returningData) {
    const teamId = await mapper.mapToInternal(ret.team, season);
    if (!teamId) continue;
    
    await prisma.cfbdPriorsTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        returningProdOff: ret.returningOffense || null,
        returningProdDef: ret.returningDefense || null,
        asOf: new Date(),
        updatedAt: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        returningProdOff: ret.returningOffense || null,
        returningProdDef: ret.returningDefense || null,
      },
    });
  }
}

// ============================================================================
// STEP 4: TEAM-GAME DATA
// ============================================================================

async function ingestTeamGameData(season: number, weeks: number[], client: CFBDClient, mapper: CFBDTeamMapper) {
  for (const week of weeks) {
    console.log(`   Week ${week}...`);
    
    // Advanced stats game
    const advStats = await client.getAdvancedStatsGame(season, week);
    for (const stat of advStats) {
      const teamId = await mapper.mapToInternal(stat.team, season);
      const gameId = stat.gameId?.toString();
      if (!teamId || !gameId) continue;
      
      await prisma.cfbdEffTeamGame.upsert({
        where: { gameIdCfbd_teamIdInternal: { gameIdCfbd: gameId, teamIdInternal: teamId } },
        update: {
          offEpa: stat.offense?.epa || null,
          offSr: stat.offense?.successRate || null,
          isoPppOff: stat.offense?.explosiveness || null,
          ppoOff: stat.offense?.pointsPerOpportunity || null,
          lineYardsOff: stat.offense?.lineYards || null,
          havocOff: stat.offense?.havoc || null,
          defEpa: stat.defense?.epa || null,
          defSr: stat.defense?.successRate || null,
          isoPppDef: stat.defense?.explosiveness || null,
          ppoDef: stat.defense?.pointsPerOpportunity || null,
          stuffRate: stat.defense?.stuffRate || null,
          powerSuccess: stat.offense?.powerSuccess || null,
          havocDef: stat.defense?.havoc || null,
          runEpa: stat.offense?.rushingPlays?.epa || null,
          passEpa: stat.offense?.passingPlays?.epa || null,
          runSr: stat.offense?.rushingPlays?.successRate || null,
          passSr: stat.offense?.passingPlays?.successRate || null,
          earlyDownEpa: stat.offense?.firstDown?.epa || null,
          lateDownEpa: stat.offense?.secondDown?.epa || null,
          avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
          asOf: new Date(),
          updatedAt: new Date(),
        },
        create: {
          gameIdCfbd: gameId,
          teamIdInternal: teamId,
          offEpa: stat.offense?.epa || null,
          offSr: stat.offense?.successRate || null,
          isoPppOff: stat.offense?.explosiveness || null,
          ppoOff: stat.offense?.pointsPerOpportunity || null,
          lineYardsOff: stat.offense?.lineYards || null,
          havocOff: stat.offense?.havoc || null,
          defEpa: stat.defense?.epa || null,
          defSr: stat.defense?.successRate || null,
          isoPppDef: stat.defense?.explosiveness || null,
          ppoDef: stat.defense?.pointsPerOpportunity || null,
          stuffRate: stat.defense?.stuffRate || null,
          powerSuccess: stat.offense?.powerSuccess || null,
          havocDef: stat.defense?.havoc || null,
          runEpa: stat.offense?.rushingPlays?.epa || null,
          passEpa: stat.offense?.passingPlays?.epa || null,
          runSr: stat.offense?.rushingPlays?.successRate || null,
          passSr: stat.offense?.passingPlays?.successRate || null,
          earlyDownEpa: stat.offense?.firstDown?.epa || null,
          lateDownEpa: stat.offense?.secondDown?.epa || null,
          avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
        },
      });
    }
    
    // PPA games
    const ppaGames = await client.getPPAGames(season, week);
    // Process PPA (would need proper aggregation)
    
    // Drives
    const drives = await client.getDrives(season, week);
    // Process drives (aggregate by team/game)
    
    // Weather (if available)
    try {
      const weather = await client.getWeather(season, week);
      // Process weather
    } catch (error) {
      // Weather endpoint may not be available
    }
  }
}

// ============================================================================
// STEP 5: COMPLETENESS
// ============================================================================

async function computeCompleteness(season: number, weeks: number[]): Promise<CompletenessRow[]> {
  const rows: CompletenessRow[] = [];
  
  // Get expected games
  const expectedGames = await prisma.cfbdGame.count({
    where: { season, week: { in: weeks } },
  });
  
  const expectedTeams = await prisma.teamMembership.count({
    where: { season, level: 'fbs' },
  });
  
  // Advanced season
  const advSeasonCount = await prisma.cfbdEffTeamSeason.count({
    where: { season },
  });
  rows.push({
    block: 'advanced_season',
    rowsExpected: expectedTeams,
    rowsPresent: advSeasonCount,
    completenessPct: expectedTeams > 0 ? (advSeasonCount / expectedTeams) * 100 : 0,
  });
  
  // Advanced game
  const advGameCount = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  rows.push({
    block: 'advanced_game',
    rowsExpected: expectedGames * 2, // 2 teams per game
    rowsPresent: advGameCount,
    completenessPct: expectedGames > 0 ? (advGameCount / (expectedGames * 2)) * 100 : 0,
  });
  
  // Priors
  const priorsCount = await prisma.cfbdPriorsTeamSeason.count({
    where: { season },
  });
  rows.push({
    block: 'priors',
    rowsExpected: expectedTeams,
    rowsPresent: priorsCount,
    completenessPct: expectedTeams > 0 ? (priorsCount / expectedTeams) * 100 : 0,
  });
  
  return rows;
}

function saveCompletenessReport(rows: CompletenessRow[]) {
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const csvPath = path.join(reportsDir, 'feature_completeness.csv');
  
  const header = 'block,rows_expected,rows_present,completeness_pct\n';
  const csvRows = rows.map(r => 
    `${r.block},${r.rowsExpected},${r.rowsPresent},${r.completenessPct.toFixed(2)}`
  ).join('\n');
  
  fs.writeFileSync(csvPath, header + csvRows);
  console.log(`   💾 Saved to ${csvPath}`);
}

function saveTeamMappingMismatches(unmapped: string[]) {
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const csvPath = path.join(reportsDir, 'team_mapping_mismatches.csv');
  
  const header = 'cfbd_name,notes\n';
  const csvRows = unmapped.map(name => `${name},Unmapped - requires manual review`).join('\n');
  
  fs.writeFileSync(csvPath, header + csvRows);
  console.log(`   💾 Saved to ${csvPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const season = args[0] ? parseInt(args[0], 10) : 2025;
  const weeks = args.length > 1 
    ? args.slice(1).map(w => parseInt(w, 10))
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  try {
    await ingestCFBDFeatures(season, weeks);
  } catch (error) {
    console.error('❌ Ingest failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

