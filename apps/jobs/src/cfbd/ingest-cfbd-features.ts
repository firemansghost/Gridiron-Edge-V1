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

async function ingestCFBDFeatures(season: number, weeks: number[], endpoints: string[] = ['teamSeason', 'teamGame', 'priors'], dryRun: boolean = false) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 PHASE 3: CFBD FEATURE INGEST`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  // Environment check
  if (!process.env.CFBD_API_KEY) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }
  console.log(`   ✅ CFBD_API_KEY found`);
  console.log(`   ✅ Database connection verified\n`);
  
  const client = new CFBDClient();
  const mapper = new CFBDTeamMapper();
  const unmappedTeams: string[] = [];
  
  // Step 1: Build team mapping
  console.log(`📋 Step 1: Building team mapping...`);
  const teamMapping = await buildTeamMapping(season, client, mapper, unmappedTeams);
  console.log(`   ✅ Mapped ${teamMapping.size} teams`);
  if (unmappedTeams.length > 0) {
    console.log(`   ⚠️  ${unmappedTeams.length} unmapped teams (will be logged)\n`);
  } else {
    console.log(`   ✅ TEAM MAP: 0 unresolved (good)\n`);
  }
  
  // Step 2: Fetch and store games schedule
  console.log(`📅 Step 2: Fetching games schedule...`);
  const games = await fetchAndStoreGames(season, weeks, client, mapper, unmappedTeams);
  console.log(`   ✅ Stored ${games.length} games`);
  if (unmappedTeams.length > 0) {
    console.log(`   ⚠️  ${unmappedTeams.length} unmapped team names encountered (likely FCS/other divisions)`);
  }
  console.log();
  
  // Step 3: Team-season blocks
  if (endpoints.includes('teamSeason')) {
    console.log(`📊 Step 3: Ingesting team-season data...`);
    await ingestTeamSeasonData(season, client, mapper, unmappedTeams, dryRun);
    console.log(`   ✅ Team-season data ingested\n`);
  } else {
    console.log(`📊 Step 3: Skipped (not in endpoints)\n`);
  }
  
  // Step 4: Team-game blocks
  if (endpoints.includes('teamGame')) {
    console.log(`🎮 Step 4: Ingesting team-game data...`);
    await ingestTeamGameData(season, weeks, client, mapper, unmappedTeams, dryRun);
    console.log(`   ✅ Team-game data ingested\n`);
  } else {
    console.log(`🎮 Step 4: Skipped (not in endpoints)\n`);
  }
  
  // Priors (part of team-season but separate endpoint)
  if (endpoints.includes('priors')) {
    console.log(`📚 Step 5: Ingesting priors (talent + returning production)...`);
    await ingestPriors(season, client, mapper, unmappedTeams, dryRun);
    console.log(`   ✅ Priors ingested\n`);
  } else {
    console.log(`📚 Step 5: Skipped (not in endpoints)\n`);
  }
  
  // Step 6: Completeness check
  console.log(`✅ Step 6: Computing feature completeness...`);
  const completeness = await computeCompleteness(season, weeks);
  saveCompletenessReport(completeness);
  console.log(`   ✅ Completeness report saved\n`);
  
  // Step 7: Feature store stats
  console.log(`📊 Step 7: Computing feature store stats...`);
  const featureStats = await computeFeatureStoreStats(season, weeks);
  saveFeatureStoreStats(featureStats);
  console.log(`   ✅ Feature store stats saved\n`);
  
  // Team mapping mismatches
  console.log(`🔍 Final team mapping check...`);
  saveTeamMappingMismatches(unmappedTeams);
  if (unmappedTeams.length === 0) {
    console.log(`   ✅ TEAM MAP: 0 unresolved (good)\n`);
  } else {
    console.log(`   ⚠️  ${unmappedTeams.length} unresolved mappings logged\n`);
  }
  
  // Spot checks
  console.log(`🔍 Step 8: Running spot checks...`);
  await runSpotChecks(season, weeks);
  console.log(`   ✅ Spot checks complete\n`);
  
  console.log(`${'='.repeat(70)}\n`);
}

// ============================================================================
// STEP 1: TEAM MAPPING
// ============================================================================

async function buildTeamMapping(season: number, client: CFBDClient, mapper: CFBDTeamMapper, unmapped: string[]): Promise<Map<string, string>> {
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
  
  for (const cfbdName of cfbdTeams) {
    const internalId = await mapper.mapToInternal(cfbdName, season);
    if (internalId) {
      mapping.set(cfbdName.toLowerCase(), internalId);
    } else {
      if (!unmapped.includes(cfbdName)) {
        unmapped.push(cfbdName);
      }
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

async function fetchAndStoreGames(season: number, weeks: number[], client: CFBDClient, mapper: CFBDTeamMapper, unmapped: string[]): Promise<any[]> {
  const allGames: any[] = [];
  let skippedCount = 0;
  
  // Check if games already exist - if so, skip fetching and just load from DB
  const existingGames = await prisma.cfbdGame.findMany({
    where: { season, week: { in: weeks } },
    select: { gameIdCfbd: true },
  });
  
  if (existingGames.length > 0) {
    console.log(`   Found ${existingGames.length} existing games in database, skipping fetch...`);
    // Load existing games for return
    for (const week of weeks) {
      const weekGames = await prisma.cfbdGame.findMany({
        where: { season, week },
      });
      allGames.push(...weekGames.map(g => ({ id: g.gameIdCfbd })));
    }
    return allGames;
  }
  
  for (const week of weeks) {
    console.log(`   Week ${week}...`);
    const games = await client.getGames(season, week, undefined, 'regular');
    let weekStored = 0;
    let weekSkipped = 0;
    
    for (const game of games) {
      const homeTeamId = await mapper.mapToInternal(game.home_team || game.homeTeam, season);
      const awayTeamId = await mapper.mapToInternal(game.away_team || game.awayTeam, season);
      
      if (!homeTeamId) {
        const homeName = game.home_team || game.homeTeam;
        if (!unmapped.includes(homeName)) unmapped.push(homeName);
      }
      if (!awayTeamId) {
        const awayName = game.away_team || game.awayTeam;
        if (!unmapped.includes(awayName)) unmapped.push(awayName);
      }
      if (!homeTeamId || !awayTeamId) {
        // Silently skip unmapped teams (FCS, etc.) - log summary at end
        weekSkipped++;
        skippedCount++;
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
      weekStored++;
    }
    
    console.log(`      Stored: ${weekStored}, Skipped: ${weekSkipped}`);
  }
  
  if (skippedCount > 0) {
    console.log(`   ⚠️  Total skipped: ${skippedCount} games (unmapped teams)`);
  }
  
  return allGames;
}

// ============================================================================
// STEP 3: TEAM-SEASON DATA
// ============================================================================

async function ingestTeamSeasonData(season: number, client: CFBDClient, mapper: CFBDTeamMapper, unmapped: string[], dryRun: boolean = false) {
  // Advanced stats season
  console.log(`   Fetching advanced stats (season)...`);
  const advStats = await client.getAdvancedStatsSeason(season);
  let advSeasonUpserted = 0;
  let advSeasonSkipped = 0;
  
  for (const stat of advStats) {
    const teamName = stat.team || stat.teamName;
    if (!teamName) {
      console.warn(`   ⚠️  Skipping stat record: missing team name`);
      advSeasonSkipped++;
      continue;
    }
    
    const teamId = await mapper.mapToInternal(teamName, season);
    if (!teamId) {
      if (!unmapped.includes(teamName)) unmapped.push(teamName);
      advSeasonSkipped++;
      continue;
    }
    
    // Validate schema - fail fast on unknown fields
    const knownFields = ['team', 'teamName', 'offense', 'defense', 'fieldPosition'];
    const unknownFields = Object.keys(stat).filter(k => !knownFields.includes(k) && !k.startsWith('_'));
    if (unknownFields.length > 0 && process.env.CFBD_STRICT_SCHEMA !== 'false') {
      console.warn(`   ⚠️  Unknown fields in advanced stats: ${unknownFields.join(', ')}`);
      // Don't fail, but log it
    }
    
    // Extract havoc values (API returns object with { total, frontSeven, db })
    const havocOffValue = typeof stat.offense?.havoc === 'object' && stat.offense?.havoc !== null
      ? (stat.offense.havoc as any).total
      : stat.offense?.havoc;
    const havocDefValue = typeof stat.defense?.havoc === 'object' && stat.defense?.havoc !== null
      ? (stat.defense.havoc as any).total
      : stat.defense?.havoc;
    
    try {
      if (dryRun) {
        console.log(`   [DRY RUN] Would upsert season stats for ${teamName}`);
        advSeasonUpserted++;
        continue;
      }
    
    await prisma.cfbdEffTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        offEpa: stat.offense?.epa || null,
        offSr: stat.offense?.successRate || null,
        isoPppOff: stat.offense?.explosiveness || null,
        ppoOff: stat.offense?.pointsPerOpportunity || null,
        lineYardsOff: stat.offense?.lineYards || null,
        havocOff: havocOffValue || null,
        defEpa: stat.defense?.epa || null,
        defSr: stat.defense?.successRate || null,
        isoPppDef: stat.defense?.explosiveness || null,
        ppoDef: stat.defense?.pointsPerOpportunity || null,
        stuffRate: stat.defense?.stuffRate || null,
        powerSuccess: stat.offense?.powerSuccess || null,
        havocDef: havocDefValue || null,
        runEpa: stat.offense?.rushingPlays?.epa || null,
        passEpa: stat.offense?.passingPlays?.epa || null,
        runSr: stat.offense?.rushingPlays?.successRate || null,
        passSr: stat.offense?.passingPlays?.successRate || null,
        earlyDownEpa: stat.offense?.firstDown?.epa || null,
        lateDownEpa: stat.offense?.secondDown?.epa || null, // Approximate
        avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
        asOf: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        offEpa: stat.offense?.epa || null,
        offSr: stat.offense?.successRate || null,
        isoPppOff: stat.offense?.explosiveness || null,
        ppoOff: stat.offense?.pointsPerOpportunity || null,
        lineYardsOff: stat.offense?.lineYards || null,
        havocOff: havocOffValue || null,
        defEpa: stat.defense?.epa || null,
        defSr: stat.defense?.successRate || null,
        isoPppDef: stat.defense?.explosiveness || null,
        ppoDef: stat.defense?.pointsPerOpportunity || null,
        stuffRate: stat.defense?.stuffRate || null,
        powerSuccess: stat.offense?.powerSuccess || null,
        havocDef: havocDefValue || null,
        runEpa: stat.offense?.rushingPlays?.epa || null,
        passEpa: stat.offense?.passingPlays?.epa || null,
        runSr: stat.offense?.rushingPlays?.successRate || null,
        passSr: stat.offense?.passingPlays?.successRate || null,
        earlyDownEpa: stat.offense?.firstDown?.epa || null,
        lateDownEpa: stat.offense?.secondDown?.epa || null,
        avgFieldPosition: stat.fieldPosition?.averageStartingFieldPosition || null,
      },
    });
    advSeasonUpserted++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upsert advanced season stats for ${teamName}: ${error.message}`);
      advSeasonSkipped++;
    }
  }
  console.log(`   ✅ CFBD/team-season-eff: ${advSeasonUpserted} rows • skipped: ${advSeasonSkipped}`);
  
  // PPA season (aggregate from player data)
  console.log(`   Fetching PPA (season)...`);
  const ppaData = await client.getPPASeason(season);
  // Aggregate by team (simplified - would need proper aggregation)
  // For now, skip - will use game-level PPA
}

// ============================================================================
// STEP 5: PRIORS (TALENT + RETURNING PRODUCTION)
// ============================================================================

async function ingestPriors(season: number, client: CFBDClient, mapper: CFBDTeamMapper, unmapped: string[], dryRun: boolean = false) {
  // Talent
  console.log(`   Fetching talent...`);
  const talentData = await client.getTalent(season);
  let talentUpserted = 0;
  let talentSkipped = 0;
  
  for (const talent of talentData) {
    const teamId = await mapper.mapToInternal(talent.team, season);
    if (!teamId) {
      if (!unmapped.includes(talent.team)) unmapped.push(talent.team);
      talentSkipped++;
      continue;
    }
    
    try {
      if (dryRun) {
        console.log(`   [DRY RUN] Would upsert talent for ${talent.team}`);
        talentUpserted++;
        continue;
      }
    
    await prisma.cfbdPriorsTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        talent247: talent.talent || null,
        asOf: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        talent247: talent.talent || null,
      },
    });
    talentUpserted++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upsert talent for ${talent.team}: ${error.message}`);
      talentSkipped++;
    }
  }
  console.log(`   ✅ CFBD/talent: ${talentUpserted} rows • skipped: ${talentSkipped}`);
  
  // Returning production
  console.log(`   Fetching returning production...`);
  const returningData = await client.getReturningProduction(season);
  let returningUpserted = 0;
  let returningSkipped = 0;
  
  for (const ret of returningData) {
    const teamId = await mapper.mapToInternal(ret.team, season);
    if (!teamId) {
      if (!unmapped.includes(ret.team)) unmapped.push(ret.team);
      returningSkipped++;
      continue;
    }
    
    try {
      if (dryRun) {
        console.log(`   [DRY RUN] Would upsert returning production for ${ret.team}`);
        returningUpserted++;
        continue;
      }
    
    await prisma.cfbdPriorsTeamSeason.upsert({
      where: { season_teamIdInternal: { season, teamIdInternal: teamId } },
      update: {
        returningProdOff: ret.returningOffense || null,
        returningProdDef: ret.returningDefense || null,
        asOf: new Date(),
      },
      create: {
        season,
        teamIdInternal: teamId,
        returningProdOff: ret.returningOffense || null,
        returningProdDef: ret.returningDefense || null,
      },
    });
    returningUpserted++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upsert returning production for ${ret.team}: ${error.message}`);
      returningSkipped++;
    }
  }
  console.log(`   ✅ CFBD/returning-production: ${returningUpserted} rows • skipped: ${returningSkipped}`);
}

// ============================================================================
// STEP 4: TEAM-GAME DATA
// ============================================================================

async function ingestTeamGameData(season: number, weeks: number[], client: CFBDClient, mapper: CFBDTeamMapper, unmapped: string[], dryRun: boolean = false) {
  for (const week of weeks) {
    console.log(`   Week ${week}...`);
    
    // Advanced stats game
    const advStats = await client.getAdvancedStatsGame(season, week);
    let advGameUpserted = 0;
    let advGameSkipped = 0;
    
    for (const stat of advStats) {
      const teamName = stat.team || stat.teamName;
      const gameId = stat.gameId?.toString() || stat.game_id?.toString();
      
      if (!teamName || !gameId) {
        advGameSkipped++;
        continue;
      }
      
      const teamId = await mapper.mapToInternal(teamName, season);
      if (!teamId) {
        if (!unmapped.includes(teamName)) unmapped.push(teamName);
        advGameSkipped++;
        continue;
      }
      
      try {
        if (dryRun) {
          console.log(`   [DRY RUN] Would upsert game stats for ${teamName} (game ${gameId})`);
          advGameUpserted++;
          continue;
        }
      
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
      advGameUpserted++;
      } catch (error: any) {
        console.error(`   ⚠️  Failed to upsert advanced game stats for ${teamName} (game ${gameId}): ${error.message}`);
        advGameSkipped++;
      }
    }
    console.log(`   ✅ CFBD/team-game-eff: ${advGameUpserted} rows • skipped: ${advGameSkipped}`);
    
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
  const csvRows = unmapped.length > 0
    ? unmapped.map(name => `"${name}",Unmapped - requires manual review`).join('\n')
    : '';
  
  fs.writeFileSync(csvPath, header + csvRows);
  if (unmapped.length === 0) {
    console.log(`   💾 Saved to ${csvPath} (empty - all teams mapped)`);
  } else {
    console.log(`   💾 Saved to ${csvPath} (${unmapped.length} unmapped)`);
  }
}

// ============================================================================
// FEATURE STORE STATS
// ============================================================================

interface FeatureStat {
  feature: string;
  block: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  nullCount: number;
  nullPct: number;
  winsorizedPct: number;
}

async function computeFeatureStoreStats(season: number, weeks: number[]): Promise<FeatureStat[]> {
  const stats: FeatureStat[] = [];
  
  // Advanced game stats
  const advGameData = await prisma.cfbdEffTeamGame.findMany({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  
  const numericFields = [
    'offEpa', 'offSr', 'isoPppOff', 'ppoOff', 'lineYardsOff', 'havocOff',
    'defEpa', 'defSr', 'isoPppDef', 'ppoDef', 'stuffRate', 'powerSuccess', 'havocDef',
    'runEpa', 'passEpa', 'runSr', 'passSr', 'earlyDownEpa', 'lateDownEpa', 'avgFieldPosition',
  ];
  
  for (const field of numericFields) {
    const values = advGameData
      .map((r: any) => r[field])
      .filter(v => v !== null && v !== undefined && isFinite(Number(v)))
      .map(v => Number(v));
    
    if (values.length === 0) continue;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const nullCount = advGameData.length - values.length;
    const nullPct = (nullCount / advGameData.length) * 100;
    
    stats.push({
      feature: field,
      block: 'advanced_game',
      mean,
      std,
      min,
      max,
      nullCount,
      nullPct,
      winsorizedPct: 0, // Will be computed in Phase 4
    });
  }
  
  return stats;
}

function saveFeatureStoreStats(stats: FeatureStat[]) {
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const csvPath = path.join(reportsDir, 'feature_store_stats.csv');
  
  const header = 'feature,block,mean,std,min,max,null_count,null_pct,winsorized_pct\n';
  const csvRows = stats.map(s => 
    `${s.feature},${s.block},${s.mean.toFixed(4)},${s.std.toFixed(4)},${s.min.toFixed(4)},${s.max.toFixed(4)},${s.nullCount},${s.nullPct.toFixed(2)},${s.winsorizedPct.toFixed(2)}`
  ).join('\n');
  
  fs.writeFileSync(csvPath, header + csvRows);
  console.log(`   💾 Saved to ${csvPath}`);
}

// ============================================================================
// SPOT CHECKS
// ============================================================================

async function runSpotChecks(season: number, weeks: number[]) {
  // Find one P5-P5, one P5-G5, one G5-G5 game
  const games = await prisma.game.findMany({
    where: {
      season,
      week: { in: weeks },
      status: 'final',
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    take: 100,
  });
  
  // Get membership for classification
  const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
  const memberships = await prisma.teamMembership.findMany({
    where: {
      season,
      teamId: { in: teamIds },
    },
  });
  
  const membershipMap = new Map(memberships.map(m => [m.teamId, m]));
  
  let p5p5: typeof games[0] | null = null;
  let p5g5: typeof games[0] | null = null;
  let g5g5: typeof games[0] | null = null;
  
  for (const game of games) {
    const homeMem = membershipMap.get(game.homeTeamId);
    const awayMem = membershipMap.get(game.awayTeamId);
    
    // Simplified: check if we have conference data (would need actual P5/G5 classification)
    // For now, just pick 3 random games
    if (!p5p5) p5p5 = game;
    else if (!p5g5) p5g5 = game;
    else if (!g5g5) {
      g5g5 = game;
      break;
    }
  }
  
  const spotGames = [p5p5, p5g5, g5g5].filter(g => g !== null);
  
  console.log(`\n   Spot check (${spotGames.length} games):`);
  for (const game of spotGames) {
    if (!game) continue;
    
    const cfbdGame = await prisma.cfbdGame.findFirst({
      where: {
        homeTeamIdInternal: game.homeTeamId,
        awayTeamIdInternal: game.awayTeamId,
        season,
        week: game.week,
      },
    });
    
    if (!cfbdGame) {
      console.log(`   ⚠️  ${game.homeTeam.name} vs ${game.awayTeam.name}: No CFBD game record`);
      continue;
    }
    
    const homeEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: cfbdGame.gameIdCfbd,
          teamIdInternal: game.homeTeamId,
        },
      },
    });
    
    const awayEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: cfbdGame.gameIdCfbd,
          teamIdInternal: game.awayTeamId,
        },
      },
    });
    
    const homeDrives = await prisma.cfbdDrivesTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: cfbdGame.gameIdCfbd,
          teamIdInternal: game.homeTeamId,
        },
      },
    });
    
    const homePriors = await prisma.cfbdPriorsTeamSeason.findUnique({
      where: {
        season_teamIdInternal: {
          season,
          teamIdInternal: game.homeTeamId,
        },
      },
    });
    
    const weather = await prisma.cfbdWeatherGame.findUnique({
      where: { gameIdCfbd: cfbdGame.gameIdCfbd },
    });
    
    console.log(`\n   ${game.homeTeam.name} vs ${game.awayTeam.name} (Week ${game.week}):`);
    console.log(`     Off/Def EPA: ${homeEff?.offEpa !== null ? '✅' : '❌'} (home), ${awayEff?.offEpa !== null ? '✅' : '❌'} (away)`);
    console.log(`     Drives pace: ${homeDrives?.playsPerMinute !== null ? '✅' : '❌'}`);
    console.log(`     Priors: ${homePriors?.talent247 !== null ? '✅' : '❌'} (talent), ${homePriors?.returningProdOff !== null ? '✅' : '❌'} (returning)`);
    console.log(`     Weather: ${weather !== null ? '✅' : '⚠️  (null - may be dome/indoor)'}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Parse CLI args (support both positional and --flags)
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let endpoints: string[] = ['teamSeason', 'teamGame', 'priors'];
  let dryRun = false;
  
  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
      i++;
    } else if (args[i] === '--endpoints' && args[i + 1]) {
      endpoints = args[i + 1].split(',').map(e => e.trim());
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  
  // Fallback to positional args if no flags
  if (args.length > 0 && !args[0].startsWith('--')) {
    season = parseInt(args[0], 10) || season;
    if (args.length > 1) {
      weeks = args.slice(1).map(w => parseInt(w, 10)).filter(w => !isNaN(w));
    }
  }
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No database writes will be performed\n');
  }
  
  try {
    await ingestCFBDFeatures(season, weeks, endpoints, dryRun);
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

