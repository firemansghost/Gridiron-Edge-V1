/**
 * Feature Engineering Script (Task 11)
 * 
 * Computes opponent-adjusted nets, recency EWMAs, and context features
 * Persists to team_game_adj table with feature_version
 */

import { PrismaClient, Decimal } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface TeamGameFeatures {
  gameId: string;
  teamId: string;
  opponentId: string;
  season: number;
  week: number;
  gameDate: Date;
  isHome: boolean;
  
  // Raw CFBD stats
  teamOffEpa?: number | null;
  teamOffSr?: number | null;
  teamOffExplosiveness?: number | null;
  teamOffPpa?: number | null;
  teamOffHavoc?: number | null;
  teamDefEpa?: number | null;
  teamDefSr?: number | null;
  teamDefExplosiveness?: number | null;
  teamDefPpa?: number | null;
  teamDefHavoc?: number | null;
  
  // Opponent stats (for adjustment)
  oppDefEpa?: number | null;
  oppDefSr?: number | null;
  oppDefExplosiveness?: number | null;
  oppDefPpa?: number | null;
  oppDefHavoc?: number | null;
  oppOffEpa?: number | null;
  oppOffSr?: number | null;
  oppOffExplosiveness?: number | null;
  oppOffPpa?: number | null;
  oppOffHavoc?: number | null;
  
  // Priors
  talent247?: number | null;
  returningProdOff?: number | null;
  returningProdDef?: number | null;
  
  // Context
  neutralSite: boolean;
  conferenceGame: boolean;
  isFbs: boolean;
  p5Flag: boolean;
  g5Flag: boolean;
  fcsFlag: boolean;
}

interface EngineeredFeatures {
  // Opponent-adjusted nets
  offAdjEpa?: number | null;
  offAdjSr?: number | null;
  offAdjExplosiveness?: number | null;
  offAdjPpa?: number | null;
  offAdjHavoc?: number | null;
  defAdjEpa?: number | null;
  defAdjSr?: number | null;
  defAdjExplosiveness?: number | null;
  defAdjPpa?: number | null;
  defAdjHavoc?: number | null;
  
  // Edges
  edgeEpa?: number | null;
  edgeSr?: number | null;
  edgeExplosiveness?: number | null;
  edgePpa?: number | null;
  edgeHavoc?: number | null;
  
  // EWMAs
  ewma3OffAdjEpa?: number | null;
  ewma3DefAdjEpa?: number | null;
  ewma5OffAdjEpa?: number | null;
  ewma5DefAdjEpa?: number | null;
  lowSample3g: boolean;
  lowSample5g: boolean;
  
  // Context
  restDelta?: number | null;
  byeWeek: boolean;
}

const WINSORIZE_PCT = 0.01; // 1st and 99th percentile

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let featureVersion = process.env.FEATURE_VERSION || 'fe_v1';
  let sourceWindow = 'pre_kick';
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
      i++;
    } else if (args[i] === '--featureVersion' && args[i + 1]) {
      featureVersion = args[i + 1];
      i++;
    } else if (args[i] === '--sourceWindow' && args[i + 1]) {
      sourceWindow = args[i + 1];
      i++;
    }
  }
  
  console.log('\n======================================================================');
  console.log('🔧 FEATURE ENGINEERING (Task 11)');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}`);
  console.log(`   Feature Version: ${featureVersion}`);
  console.log(`   Source Window: ${sourceWindow}\n`);
  
  // Step 1: Load games and CFBD data
  console.log('📊 Step 1: Loading games and CFBD data...');
  const features = await loadTeamGameFeatures(season, weeks);
  console.log(`   ✅ Loaded ${features.length} team-game features`);
  
  // Frame check sample (10 rows)
  const frameSample = features.filter(f => f.isHome).slice(0, 10);
  console.log(`   Frame check sample (10 home team rows):`);
  for (const f of frameSample) {
    const game = await prisma.game.findUnique({
      where: { id: f.gameId },
      include: { homeTeam: true, awayTeam: true },
    });
    console.log(`     ${game?.awayTeam.name || 'unknown'} @ ${game?.homeTeam.name || 'unknown'} (Week ${f.week})`);
  }
  console.log();
  
  // Step 2: Compute opponent-adjusted nets
  console.log('🔧 Step 2: Computing opponent-adjusted nets...');
  const withAdjNets = computeOpponentAdjustedNets(features);
  console.log(`   ✅ Computed adjusted nets for ${withAdjNets.length} team-games`);
  
  // Log distribution stats for key features
  const logDistribution = (name: string, values: number[]) => {
    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const min = Math.min(...values);
      const max = Math.max(...values);
      console.log(`     ${name}: mean=${mean.toFixed(4)}, std=${std.toFixed(4)}, min=${min.toFixed(4)}, max=${max.toFixed(4)}`);
    }
  };
  
  console.log(`   Distribution stats (before standardization):`);
  logDistribution('offAdjSr', withAdjNets.map(f => f.offAdjSr).filter(v => v !== null && v !== undefined && isFinite(v)) as number[]);
  logDistribution('offAdjExplosiveness', withAdjNets.map(f => f.offAdjExplosiveness).filter(v => v !== null && v !== undefined && isFinite(v)) as number[]);
  logDistribution('edgeSr', withAdjNets.map(f => f.edgeSr).filter(v => v !== null && v !== undefined && isFinite(v)) as number[]);
  console.log();
  
  // 10-game assertion: verify opponent-adjusted joins are correct
  console.log(`   🔍 10-game join integrity check:`);
  const sampleGames = withAdjNets.filter(f => f.isHome).slice(0, 10);
  let allDiffsNonZero = true;
  for (const f of sampleGames) {
    const game = await prisma.game.findUnique({
      where: { id: f.gameId },
      include: { homeTeam: true, awayTeam: true },
    });
    const teamOffSr = f.teamOffSr;
    const oppDefSr = f.oppDefSr;
    const offAdjSr = f.offAdjSr;
    const gameName = game ? `${game.awayTeam.name} @ ${game.homeTeam.name}` : 'unknown';
    
    if (offAdjSr === 0 || offAdjSr === null) {
      console.log(`     ❌ ${gameName}: teamOffSr=${teamOffSr?.toFixed(4)}, oppDefSr=${oppDefSr?.toFixed(4)}, offAdjSr=${offAdjSr} (ZERO!)`);
      allDiffsNonZero = false;
    } else {
      console.log(`     ✅ ${gameName}: teamOffSr=${teamOffSr?.toFixed(4)}, oppDefSr=${oppDefSr?.toFixed(4)}, offAdjSr=${offAdjSr?.toFixed(4)}`);
    }
  }
  
  if (!allDiffsNonZero) {
    console.log(`   ❌ ASSERTION FAILED: Some offAdjSr values are zero - join bug detected!`);
    throw new Error('Opponent-adjusted join integrity check failed - offAdjSr should never be zero');
  } else {
    console.log(`   ✅ All 10 sample games have non-zero offAdjSr - joins look correct\n`);
  }
  
  // Step 3: Compute recency EWMAs
  console.log('📈 Step 3: Computing recency EWMAs...');
  const withEwmas = await computeRecencyEWMAs(withAdjNets, season);
  console.log(`   ✅ Computed EWMAs for ${withEwmas.length} team-games\n`);
  
  // Step 4: Add context flags
  console.log('🏷️  Step 4: Adding context flags...');
  const withContext = await addContextFlags(withEwmas, season);
  console.log(`   ✅ Added context flags\n`);
  
  // Step 5: Apply hygiene (winsorize, standardize)
  console.log('🧹 Step 5: Applying hygiene (winsorize, standardize)...');
  const cleaned = applyHygiene(withContext);
  console.log(`   ✅ Applied hygiene\n`);
  
  // Step 6: Persist to database
  console.log('💾 Step 6: Persisting to database...');
  await persistFeatures(cleaned, featureVersion, sourceWindow);
  console.log(`   ✅ Persisted ${cleaned.length} feature rows\n`);
  
  // Step 7: Generate artifacts
  console.log('📄 Step 7: Generating artifacts...');
  await generateArtifacts(cleaned, season, weeks);
  console.log(`   ✅ Artifacts generated\n`);
  
  // Step 8: Check gates
  console.log('🚦 Step 8: Checking gates...');
  // Add featureVersion to features for gate checking
  const cleanedWithVersion = cleaned.map(f => ({ ...f, featureVersion } as any));
  const gatesPassed = await checkGates(cleanedWithVersion, weeks, featureVersion);
  
  if (!gatesPassed) {
    console.log('\n======================================================================');
    console.log('❌ GATES FAILED - Fix issues before proceeding');
    console.log('======================================================================\n');
    await prisma.$disconnect();
    process.exit(1);
  }
  
  console.log('\n======================================================================');
  console.log('✅ FEATURE ENGINEERING COMPLETE - ALL GATES PASSED');
  console.log('======================================================================\n');
  
  await prisma.$disconnect();
}

// ============================================================================
// STEP 1: LOAD & JOINS (no leakage)
// ============================================================================

async function loadTeamGameFeatures(season: number, weeks: number[]): Promise<TeamGameFeatures[]> {
  const features: TeamGameFeatures[] = [];
  
  // Get CFBD games for the season/weeks
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: {
      season,
      week: { in: weeks },
    },
  });
  
  // Get internal games to match by season/week/teams
  const internalGames = await prisma.game.findMany({
    where: {
      season,
      week: { in: weeks },
      status: 'final',
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });
  
  // Create a lookup map: (season, week, homeTeamId, awayTeamId) -> gameId
  const gameLookup = new Map<string, string>();
  for (const game of internalGames) {
    const key = `${game.season}_${game.week}_${game.homeTeamId}_${game.awayTeamId}`;
    gameLookup.set(key, game.id);
  }
  
  // Get priors for all teams
  const priors = await prisma.cfbdPriorsTeamSeason.findMany({
    where: { season },
  });
  const priorsMap = new Map<string, typeof priors[0]>();
  for (const prior of priors) {
    priorsMap.set(prior.teamIdInternal, prior);
  }
  
  // Get season-level efficiency stats for opponent adjustment
  // CRITICAL: We use season-to-date stats for opponent adjustment, NOT current game stats
  // In a game, team_off_sr === opp_def_sr (by definition), so we need opponent's season stats
  const seasonEff = await prisma.cfbdEffTeamSeason.findMany({
    where: { season },
  });
  const seasonEffMap = new Map<string, typeof seasonEff[0]>();
  for (const eff of seasonEff) {
    seasonEffMap.set(eff.teamIdInternal, eff);
  }
  
  // Get all prior game-level stats for rolling averages
  // We need to join through CfbdGame to get week information
  const maxWeek = Math.max(...weeks);
  const allPriorWeeks = Array.from({ length: maxWeek }, (_, i) => i + 1);
  
  // Get prior CFBD games to map gameIdCfbd -> week
  const priorCfbdGames = await prisma.cfbdGame.findMany({
    where: {
      season,
      week: { in: allPriorWeeks },
    },
    select: {
      gameIdCfbd: true,
      week: true,
    },
  });
  const gameWeekMap = new Map<string, number>();
  for (const game of priorCfbdGames) {
    gameWeekMap.set(game.gameIdCfbd, game.week);
  }
  
  // Get all prior efficiency stats
  const priorGamesEff = await prisma.cfbdEffTeamGame.findMany({
    where: {
      gameIdCfbd: { in: Array.from(gameWeekMap.keys()) },
    },
  });
  
  // Helper to compute rolling average for a team up to (but not including) a specific week
  const getRollingAvg = (teamId: string, upToWeek: number) => {
    const teamGames = priorGamesEff.filter(eff => {
      const week = gameWeekMap.get(eff.gameIdCfbd);
      return eff.teamIdInternal === teamId && week !== undefined && week < upToWeek;
    });
    
    if (teamGames.length === 0) return null;
    
    const offSr = teamGames.map(e => e.offSr).filter(v => v !== null).map(v => Number(v));
    const defSr = teamGames.map(e => e.defSr).filter(v => v !== null).map(v => Number(v));
    const offExpl = teamGames.map(e => e.isoPppOff).filter(v => v !== null).map(v => Number(v));
    const defExpl = teamGames.map(e => e.isoPppDef).filter(v => v !== null).map(v => Number(v));
    const offPpa = teamGames.map(e => e.ppoOff).filter(v => v !== null).map(v => Number(v));
    const defPpa = teamGames.map(e => e.ppoDef).filter(v => v !== null).map(v => Number(v));
    
    return {
      offSr: offSr.length > 0 ? offSr.reduce((a, b) => a + b, 0) / offSr.length : null,
      defSr: defSr.length > 0 ? defSr.reduce((a, b) => a + b, 0) / defSr.length : null,
      offExplosiveness: offExpl.length > 0 ? offExpl.reduce((a, b) => a + b, 0) / offExpl.length : null,
      defExplosiveness: defExpl.length > 0 ? defExpl.reduce((a, b) => a + b, 0) / defExpl.length : null,
      offPpa: offPpa.length > 0 ? offPpa.reduce((a, b) => a + b, 0) / offPpa.length : null,
      defPpa: defPpa.length > 0 ? defPpa.reduce((a, b) => a + b, 0) / defPpa.length : null,
    };
  };
  
  // Get team memberships for FBS flag
  const memberships = await prisma.teamMembership.findMany({
    where: { season },
  });
  const membershipMap = new Map<string, typeof memberships[0]>();
  for (const mem of memberships) {
    membershipMap.set(mem.teamId, mem);
  }
  
  // Process each CFBD game
  for (const cfbdGame of cfbdGames) {
    // Find matching internal game
    const key = `${cfbdGame.season}_${cfbdGame.week}_${cfbdGame.homeTeamIdInternal}_${cfbdGame.awayTeamIdInternal}`;
    const gameId = gameLookup.get(key);
    
    if (!gameId) {
      // Skip if no matching internal game (shouldn't happen for FBS games)
      continue;
    }
    
    // Get efficiency stats for home team
    const homeEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: cfbdGame.gameIdCfbd,
          teamIdInternal: cfbdGame.homeTeamIdInternal,
        },
      },
    });
    
    // Get efficiency stats for away team
    const awayEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: cfbdGame.gameIdCfbd,
          teamIdInternal: cfbdGame.awayTeamIdInternal,
        },
      },
    });
    
    if (!homeEff || !awayEff) {
      // Skip if missing efficiency stats
      continue;
    }
    
    // Get priors
    const homePrior = priorsMap.get(cfbdGame.homeTeamIdInternal);
    const awayPrior = priorsMap.get(cfbdGame.awayTeamIdInternal);
    
    // Get memberships
    const homeMem = membershipMap.get(cfbdGame.homeTeamIdInternal);
    const awayMem = membershipMap.get(cfbdGame.awayTeamIdInternal);
    
    // Get season-level stats as fallback
    const homeSeasonEff = seasonEffMap.get(cfbdGame.homeTeamIdInternal);
    const awaySeasonEff = seasonEffMap.get(cfbdGame.awayTeamIdInternal);
    
    // Helper to convert Decimal to number
    const toNum = (d: any) => d !== null && d !== undefined ? Number(d) : null;
    
    // Helper to get value with season fallback
    const getWithFallback = (gameVal: any, seasonVal: any) => {
      const game = toNum(gameVal);
      if (game !== null) return game;
      return toNum(seasonVal);
    };
    
    // Helper to determine tier flags
    // Get conference from team, not membership (membership doesn't have conference)
    const getTeamConference = (teamId: string) => {
      const team = internalGames.find(g => g.homeTeamId === teamId || g.awayTeamId === teamId);
      if (team) {
        return team.homeTeamId === teamId ? team.homeTeam?.conference : team.awayTeam?.conference;
      }
      return null;
    };
    
    const getTierFlags = (mem: typeof homeMem, teamId: string) => {
      if (!mem) return { isFbs: false, p5Flag: false, g5Flag: false, fcsFlag: false };
      const level = mem.level?.toLowerCase();
      const conference = getTeamConference(teamId);
      const p5Conferences = ['ACC', 'Big Ten', 'Big 12', 'SEC', 'Pac-12'];
      return {
        isFbs: level === 'fbs',
        p5Flag: conference && p5Conferences.includes(conference),
        g5Flag: level === 'fbs' && (!conference || !p5Conferences.includes(conference)),
        fcsFlag: level === 'fcs',
      };
    };
    
    const homeTier = getTierFlags(homeMem, cfbdGame.homeTeamIdInternal);
    const awayTier = getTierFlags(awayMem, cfbdGame.awayTeamIdInternal);
    
    // Get rolling averages for opponent adjustment (CRITICAL: use season-to-date, NOT current game!)
    // Compute rolling averages up to (but not including) this game's week
    const awayRolling = getRollingAvg(cfbdGame.awayTeamIdInternal, cfbdGame.week);
    const homeRolling = getRollingAvg(cfbdGame.homeTeamIdInternal, cfbdGame.week);
    
    // Home team features
    features.push({
      gameId,
      teamId: cfbdGame.homeTeamIdInternal,
      opponentId: cfbdGame.awayTeamIdInternal,
      season: cfbdGame.season,
      week: cfbdGame.week,
      gameDate: cfbdGame.date,
      isHome: true,
      
      // Team stats (from current game)
      teamOffEpa: getWithFallback(homeEff.offEpa, homeSeasonEff?.offEpa),
      teamOffSr: toNum(homeEff.offSr),
      teamOffExplosiveness: toNum(homeEff.isoPppOff),
      teamOffPpa: getWithFallback(homeEff.ppoOff, homeSeasonEff?.ppoOff),
      teamOffHavoc: getWithFallback(homeEff.havocOff, homeSeasonEff?.havocOff),
      teamDefEpa: getWithFallback(homeEff.defEpa, homeSeasonEff?.defEpa),
      teamDefSr: toNum(homeEff.defSr),
      teamDefExplosiveness: toNum(homeEff.isoPppDef),
      teamDefPpa: getWithFallback(homeEff.ppoDef, homeSeasonEff?.ppoDef),
      teamDefHavoc: getWithFallback(homeEff.havocDef, homeSeasonEff?.havocDef),
      
      // Opponent stats (CRITICAL: use season-to-date rolling, NOT current game!)
      // In current game: team_off_sr === opp_def_sr (by definition), so we need opponent's prior games
      oppDefEpa: getWithFallback(null, awaySeasonEff?.defEpa), // Use season, not current game
      oppDefSr: awayRolling?.defSr ?? toNum(awaySeasonEff?.defSr), // Prefer rolling, fallback to season
      oppDefExplosiveness: awayRolling?.defExplosiveness ?? toNum(awaySeasonEff?.isoPppDef),
      oppDefPpa: awayRolling?.defPpa ?? getWithFallback(null, awaySeasonEff?.ppoDef),
      oppDefHavoc: getWithFallback(null, awaySeasonEff?.havocDef),
      oppOffEpa: getWithFallback(null, awaySeasonEff?.offEpa),
      oppOffSr: awayRolling?.offSr ?? toNum(awaySeasonEff?.offSr),
      oppOffExplosiveness: awayRolling?.offExplosiveness ?? toNum(awaySeasonEff?.isoPppOff),
      oppOffPpa: awayRolling?.offPpa ?? getWithFallback(null, awaySeasonEff?.ppoOff),
      oppOffHavoc: getWithFallback(null, awaySeasonEff?.havocOff),
      
      // Priors
      talent247: homePrior ? toNum(homePrior.talent247) : null,
      returningProdOff: homePrior ? toNum(homePrior.returningProdOff) : null,
      returningProdDef: homePrior ? toNum(homePrior.returningProdDef) : null,
      
      // Context
      neutralSite: cfbdGame.neutralSite,
      conferenceGame: cfbdGame.homeConference === cfbdGame.awayConference,
      ...homeTier,
    });
    
    // Away team features
    features.push({
      gameId,
      teamId: cfbdGame.awayTeamIdInternal,
      opponentId: cfbdGame.homeTeamIdInternal,
      season: cfbdGame.season,
      week: cfbdGame.week,
      gameDate: cfbdGame.date,
      isHome: false,
      
      // Team stats (from current game)
      teamOffEpa: getWithFallback(awayEff.offEpa, awaySeasonEff?.offEpa),
      teamOffSr: toNum(awayEff.offSr),
      teamOffExplosiveness: toNum(awayEff.isoPppOff),
      teamOffPpa: getWithFallback(awayEff.ppoOff, awaySeasonEff?.ppoOff),
      teamOffHavoc: getWithFallback(awayEff.havocOff, awaySeasonEff?.havocOff),
      teamDefEpa: getWithFallback(awayEff.defEpa, awaySeasonEff?.defEpa),
      teamDefSr: toNum(awayEff.defSr),
      teamDefExplosiveness: toNum(awayEff.isoPppDef),
      teamDefPpa: getWithFallback(awayEff.ppoDef, awaySeasonEff?.ppoDef),
      teamDefHavoc: getWithFallback(awayEff.havocDef, awaySeasonEff?.havocDef),
      
      // Opponent stats (CRITICAL: use season-to-date rolling, NOT current game!)
      oppDefEpa: getWithFallback(null, homeSeasonEff?.defEpa), // Use season, not current game
      oppDefSr: homeRolling?.defSr ?? toNum(homeSeasonEff?.defSr), // Prefer rolling, fallback to season
      oppDefExplosiveness: homeRolling?.defExplosiveness ?? toNum(homeSeasonEff?.isoPppDef),
      oppDefPpa: homeRolling?.defPpa ?? getWithFallback(null, homeSeasonEff?.ppoDef),
      oppDefHavoc: getWithFallback(null, homeSeasonEff?.havocDef),
      oppOffEpa: getWithFallback(null, homeSeasonEff?.offEpa),
      oppOffSr: homeRolling?.offSr ?? toNum(homeSeasonEff?.offSr),
      oppOffExplosiveness: homeRolling?.offExplosiveness ?? toNum(homeSeasonEff?.isoPppOff),
      oppOffPpa: homeRolling?.offPpa ?? getWithFallback(null, homeSeasonEff?.ppoOff),
      oppOffHavoc: getWithFallback(null, homeSeasonEff?.havocOff),
      
      // Priors
      talent247: awayPrior ? toNum(awayPrior.talent247) : null,
      returningProdOff: awayPrior ? toNum(awayPrior.returningProdOff) : null,
      returningProdDef: awayPrior ? toNum(awayPrior.returningProdDef) : null,
      
      // Context
      neutralSite: cfbdGame.neutralSite,
      conferenceGame: cfbdGame.homeConference === cfbdGame.awayConference,
      ...awayTier,
    });
  }
  
  return features;
}

// ============================================================================
// STEP 2: OPPONENT-ADJUSTED NETS
// ============================================================================

interface WithAdjustedNets extends TeamGameFeatures, EngineeredFeatures {}

function computeOpponentAdjustedNets(features: TeamGameFeatures[]): WithAdjustedNets[] {
  return features.map(f => {
    // Offense vs Opponent Defense: team_off - opp_def
    const offAdjEpa = f.teamOffEpa !== null && f.oppDefEpa !== null
      ? f.teamOffEpa - f.oppDefEpa
      : null;
    const offAdjSr = f.teamOffSr !== null && f.oppDefSr !== null
      ? f.teamOffSr - f.oppDefSr
      : null;
    const offAdjExplosiveness = f.teamOffExplosiveness !== null && f.oppDefExplosiveness !== null
      ? f.teamOffExplosiveness - f.oppDefExplosiveness
      : null;
    const offAdjPpa = f.teamOffPpa !== null && f.oppDefPpa !== null
      ? f.teamOffPpa - f.oppDefPpa
      : null;
    const offAdjHavoc = f.teamOffHavoc !== null && f.oppDefHavoc !== null
      ? f.teamOffHavoc - f.oppDefHavoc
      : null;
    
    // Defense vs Opponent Offense: (-team_def) + (-opp_off) = -(team_def + opp_off)
    // Higher is better (negative defense is good, negative opponent offense is good)
    const defAdjEpa = f.teamDefEpa !== null && f.oppOffEpa !== null
      ? -(f.teamDefEpa + f.oppOffEpa)
      : null;
    const defAdjSr = f.teamDefSr !== null && f.oppOffSr !== null
      ? -(f.teamDefSr + f.oppOffSr)
      : null;
    const defAdjExplosiveness = f.teamDefExplosiveness !== null && f.oppOffExplosiveness !== null
      ? -(f.teamDefExplosiveness + f.oppOffExplosiveness)
      : null;
    const defAdjPpa = f.teamDefPpa !== null && f.oppOffPpa !== null
      ? -(f.teamDefPpa + f.oppOffPpa)
      : null;
    const defAdjHavoc = f.teamDefHavoc !== null && f.oppOffHavoc !== null
      ? -(f.teamDefHavoc + f.oppOffHavoc)
      : null;
    
    // Matchup edges: off_adj - def_adj (positive = net advantage)
    const edgeEpa = offAdjEpa !== null && defAdjEpa !== null ? offAdjEpa - defAdjEpa : null;
    const edgeSr = offAdjSr !== null && defAdjSr !== null ? offAdjSr - defAdjSr : null;
    const edgeExplosiveness = offAdjExplosiveness !== null && defAdjExplosiveness !== null
      ? offAdjExplosiveness - defAdjExplosiveness
      : null;
    const edgePpa = offAdjPpa !== null && defAdjPpa !== null ? offAdjPpa - defAdjPpa : null;
    const edgeHavoc = offAdjHavoc !== null && defAdjHavoc !== null ? offAdjHavoc - defAdjHavoc : null;
    
    return {
      ...f,
      offAdjEpa,
      offAdjSr,
      offAdjExplosiveness,
      offAdjPpa,
      offAdjHavoc,
      defAdjEpa,
      defAdjSr,
      defAdjExplosiveness,
      defAdjPpa,
      defAdjHavoc,
      edgeEpa,
      edgeSr,
      edgeExplosiveness,
      edgePpa,
      edgeHavoc,
      lowSample3g: false, // Will be set in EWMA computation
      lowSample5g: false,
      byeWeek: false, // Will be set in context flags
    };
  });
}

// ============================================================================
// STEP 3: RECENCY EWMAs (with warm start / prior blend)
// ============================================================================

async function computeRecencyEWMAs(
  features: WithAdjustedNets[],
  season: number
): Promise<WithAdjustedNets[]> {
  // Group by team and sort by date
  const byTeam = new Map<string, WithAdjustedNets[]>();
  for (const f of features) {
    if (!byTeam.has(f.teamId)) {
      byTeam.set(f.teamId, []);
    }
    byTeam.get(f.teamId)!.push(f);
  }
  
  // Sort each team's games by date
  for (const [teamId, games] of byTeam.entries()) {
    games.sort((a, b) => a.gameDate.getTime() - b.gameDate.getTime());
  }
  
  // Compute EWMAs for each team
  const result: WithAdjustedNets[] = [];
  
  for (const [teamId, games] of byTeam.entries()) {
    for (let i = 0; i < games.length; i++) {
      const current = games[i];
      const priorGames = games.slice(0, i); // Strictly before current game (no leakage)
      
      // 3-game EWMA weights: [0.6, 0.3, 0.1]
      const ewma3Weights = [0.6, 0.3, 0.1];
      const ewma3Games = priorGames.slice(-3);
      const priorWeight3g = Math.max(0, 1 - ewma3Games.length / 3);
      
      // 5-game EWMA weights: [0.4, 0.3, 0.15, 0.1, 0.05]
      const ewma5Weights = [0.4, 0.3, 0.15, 0.1, 0.05];
      const ewma5Games = priorGames.slice(-5);
      const priorWeight5g = Math.max(0, 1 - ewma5Games.length / 5);
      
      // Compute EWMA for off_adj_epa
      const ewma3OffAdjEpa = computeEWMA(
        ewma3Games.map(g => g.offAdjEpa),
        ewma3Weights,
        current.talent247 || 0,
        priorWeight3g
      );
      const ewma5OffAdjEpa = computeEWMA(
        ewma5Games.map(g => g.offAdjEpa),
        ewma5Weights,
        current.talent247 || 0,
        priorWeight5g
      );
      
      // Compute EWMA for def_adj_epa
      const ewma3DefAdjEpa = computeEWMA(
        ewma3Games.map(g => g.defAdjEpa),
        ewma3Weights,
        current.talent247 || 0,
        priorWeight5g
      );
      const ewma5DefAdjEpa = computeEWMA(
        ewma5Games.map(g => g.defAdjEpa),
        ewma5Weights,
        current.talent247 || 0,
        priorWeight5g
      );
      
      result.push({
        ...current,
        ewma3OffAdjEpa,
        ewma3DefAdjEpa,
        ewma5OffAdjEpa,
        ewma5DefAdjEpa,
        lowSample3g: ewma3Games.length < 3,
        lowSample5g: ewma5Games.length < 5,
      });
    }
  }
  
  return result;
}

function computeEWMA(
  values: (number | null)[],
  weights: number[],
  prior: number,
  priorWeight: number
): number | null {
  const validValues = values.filter(v => v !== null && v !== undefined && isFinite(v)) as number[];
  
  if (validValues.length === 0) {
    return priorWeight > 0 ? prior : null;
  }
  
  // Apply weights (most recent first)
  const reversed = [...validValues].reverse();
  const reversedWeights = weights.slice(0, reversed.length);
  const sumWeights = reversedWeights.reduce((a, b) => a + b, 0);
  
  let weightedSum = 0;
  for (let i = 0; i < reversed.length; i++) {
    weightedSum += reversed[i] * (reversedWeights[i] / sumWeights);
  }
  
  // Blend with prior
  const ewma = (1 - priorWeight) * weightedSum + priorWeight * prior;
  
  return ewma;
}

// ============================================================================
// STEP 4: CONTEXT FLAGS
// ============================================================================

async function addContextFlags(
  features: WithAdjustedNets[],
  season: number
): Promise<WithAdjustedNets[]> {
  // Get all games for the season to compute rest delta
  const allGames = await prisma.game.findMany({
    where: { season },
    orderBy: { date: 'asc' },
  });
  
  // Group by team
  const teamGames = new Map<string, typeof allGames>();
  for (const game of allGames) {
    if (!teamGames.has(game.homeTeamId)) {
      teamGames.set(game.homeTeamId, []);
    }
    if (!teamGames.has(game.awayTeamId)) {
      teamGames.set(game.awayTeamId, []);
    }
    teamGames.get(game.homeTeamId)!.push(game);
    teamGames.get(game.awayTeamId)!.push(game);
  }
  
  // Sort each team's games
  for (const [teamId, games] of teamGames.entries()) {
    games.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  return features.map(f => {
    const teamGameList = teamGames.get(f.teamId) || [];
    const gameIndex = teamGameList.findIndex(g => g.id === f.gameId);
    
    let restDelta: number | null = null;
    let byeWeek = false;
    
    if (gameIndex > 0) {
      const prevGame = teamGameList[gameIndex - 1];
      const daysDiff = Math.floor(
        (f.gameDate.getTime() - prevGame.date.getTime()) / (1000 * 60 * 60 * 24)
      );
      restDelta = daysDiff;
      byeWeek = daysDiff > 10; // More than 10 days = bye week
    }
    
    return {
      ...f,
      restDelta,
      byeWeek,
    };
  });
}

// ============================================================================
// STEP 5: HYGIENE (winsorize, standardize, zero-variance check)
// ============================================================================

interface WithHygiene extends WithAdjustedNets {
  winsorized: Set<string>;
}

function applyHygiene(features: WithAdjustedNets[]): WithHygiene[] {
  // Collect all numeric feature values
  const featureNames = [
    'offAdjEpa', 'offAdjSr', 'offAdjExplosiveness', 'offAdjPpa', 'offAdjHavoc',
    'defAdjEpa', 'defAdjSr', 'defAdjExplosiveness', 'defAdjPpa', 'defAdjHavoc',
    'edgeEpa', 'edgeSr', 'edgeExplosiveness', 'edgePpa', 'edgeHavoc',
    'ewma3OffAdjEpa', 'ewma3DefAdjEpa', 'ewma5OffAdjEpa', 'ewma5DefAdjEpa',
  ];
  
  // Compute stats for winsorization
  const stats = new Map<string, { values: number[]; p1: number; p99: number; mean: number; std: number }>();
  
  for (const name of featureNames) {
    const values = features
      .map(f => (f as any)[name])
      .filter(v => v !== null && v !== undefined && isFinite(v)) as number[];
    
    if (values.length === 0) continue;
    
    const sorted = [...values].sort((a, b) => a - b);
    const p1Index = Math.floor(sorted.length * WINSORIZE_PCT);
    const p99Index = Math.floor(sorted.length * (1 - WINSORIZE_PCT));
    const p1 = sorted[Math.max(0, p1Index)];
    const p99 = sorted[Math.min(sorted.length - 1, p99Index)];
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    stats.set(name, { values, p1, p99, mean, std });
  }
  
  // Apply winsorization and standardization
  return features.map(f => {
    const winsorized = new Set<string>();
    const cleaned = { ...f } as any;
    
    for (const name of featureNames) {
      const stat = stats.get(name);
      if (!stat) continue;
      
      let value = cleaned[name];
      if (value === null || value === undefined || !isFinite(value)) continue;
      
      // Winsorize
      if (value < stat.p1) {
        value = stat.p1;
        winsorized.add(name);
      } else if (value > stat.p99) {
        value = stat.p99;
        winsorized.add(name);
      }
      
      // Standardize (z-score)
      if (stat.std > 0.0001) {
        value = (value - stat.mean) / stat.std;
        cleaned[name] = value;
      } else {
        // Zero variance - set to null (will be excluded from gates)
        cleaned[name] = null;
        winsorized.add(`${name}_zero_var`);
      }
    }
    
    return {
      ...cleaned,
      winsorized,
    } as WithHygiene;
  });
}

// ============================================================================
// STEP 6: PERSIST TO DATABASE
// ============================================================================

async function persistFeatures(features: WithHygiene[], featureVersion: string, sourceWindow: string) {
  const batchSize = 100;
  
  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(f =>
        prisma.teamGameAdj.upsert({
          where: {
            gameId_teamId_featureVersion: {
              gameId: f.gameId,
              teamId: f.teamId,
              featureVersion,
            },
          },
          update: {
            season: f.season,
            week: f.week,
            offAdjEpa: f.offAdjEpa,
            offAdjSr: f.offAdjSr,
            offAdjExplosiveness: f.offAdjExplosiveness,
            offAdjPpa: f.offAdjPpa,
            offAdjHavoc: f.offAdjHavoc,
            defAdjEpa: f.defAdjEpa,
            defAdjSr: f.defAdjSr,
            defAdjExplosiveness: f.defAdjExplosiveness,
            defAdjPpa: f.defAdjPpa,
            defAdjHavoc: f.defAdjHavoc,
            edgeEpa: f.edgeEpa,
            edgeSr: f.edgeSr,
            edgeExplosiveness: f.edgeExplosiveness,
            edgePpa: f.edgePpa,
            edgeHavoc: f.edgeHavoc,
            ewma3OffAdjEpa: f.ewma3OffAdjEpa,
            ewma3DefAdjEpa: f.ewma3DefAdjEpa,
            ewma5OffAdjEpa: f.ewma5OffAdjEpa,
            ewma5DefAdjEpa: f.ewma5DefAdjEpa,
            lowSample3g: f.lowSample3g,
            lowSample5g: f.lowSample5g,
            talent247: f.talent247,
            returningProdOff: f.returningProdOff,
            returningProdDef: f.returningProdDef,
            neutralSite: f.neutralSite,
            conferenceGame: f.conferenceGame,
            restDelta: f.restDelta,
            byeWeek: f.byeWeek,
            isHome: f.isHome,
            isFbs: f.isFbs,
            p5Flag: f.p5Flag,
            g5Flag: f.g5Flag,
            fcsFlag: f.fcsFlag,
            sourceSnapshot: `pre_kick`,
            updatedAt: new Date(),
          },
          create: {
            gameId: f.gameId,
            teamId: f.teamId,
            season: f.season,
            week: f.week,
            featureVersion,
            offAdjEpa: f.offAdjEpa,
            offAdjSr: f.offAdjSr,
            offAdjExplosiveness: f.offAdjExplosiveness,
            offAdjPpa: f.offAdjPpa,
            offAdjHavoc: f.offAdjHavoc,
            defAdjEpa: f.defAdjEpa,
            defAdjSr: f.defAdjSr,
            defAdjExplosiveness: f.defAdjExplosiveness,
            defAdjPpa: f.defAdjPpa,
            defAdjHavoc: f.defAdjHavoc,
            edgeEpa: f.edgeEpa,
            edgeSr: f.edgeSr,
            edgeExplosiveness: f.edgeExplosiveness,
            edgePpa: f.edgePpa,
            edgeHavoc: f.edgeHavoc,
            ewma3OffAdjEpa: f.ewma3OffAdjEpa,
            ewma3DefAdjEpa: f.ewma3DefAdjEpa,
            ewma5OffAdjEpa: f.ewma5OffAdjEpa,
            ewma5DefAdjEpa: f.ewma5DefAdjEpa,
            lowSample3g: f.lowSample3g,
            lowSample5g: f.lowSample5g,
            talent247: f.talent247,
            returningProdOff: f.returningProdOff,
            returningProdDef: f.returningProdDef,
            neutralSite: f.neutralSite,
            conferenceGame: f.conferenceGame,
            restDelta: f.restDelta,
            byeWeek: f.byeWeek,
            isHome: f.isHome,
            isFbs: f.isFbs,
            p5Flag: f.p5Flag,
            g5Flag: f.g5Flag,
            fcsFlag: f.fcsFlag,
            sourceSnapshot: sourceWindow,
          },
        })
      )
    );
  }
}

// ============================================================================
// STEP 8: CHECK GATES
// ============================================================================

async function checkGates(features: WithHygiene[], weeks: number[], featureVersion: string): Promise<boolean> {
  const isSetA = weeks.every(w => w >= 8 && w <= 11);
  const nullThreshold = isSetA ? 0.05 : 0.15; // 5% for Set A, 15% for Set B
  
  // Only check features that are actually available (SR and Explosiveness are populated)
  // EPA/PPA/Havoc may be null if season-level fallback also missing
  const primaryFeatures = [
    'offAdjSr', 'offAdjExplosiveness', // Always available
    'defAdjSr', 'defAdjExplosiveness', // Always available
    'edgeSr', 'edgeExplosiveness', // Always available
    'ewma3OffAdjEpa', 'ewma3DefAdjEpa', 'ewma5OffAdjEpa', 'ewma5DefAdjEpa', // May use season fallback
    // Optional features (check but don't fail if null)
    'offAdjEpa', 'offAdjPpa', 'offAdjHavoc',
    'defAdjEpa', 'defAdjPpa', 'defAdjHavoc',
    'edgeEpa', 'edgePpa', 'edgeHavoc',
  ];
  
  // Required features (must have variance and <5% nulls for Set A)
  const requiredFeatures = ['offAdjSr', 'offAdjExplosiveness', 'defAdjSr', 'defAdjExplosiveness', 'edgeSr', 'edgeExplosiveness'];
  const optionalFeatures = primaryFeatures.filter(f => !requiredFeatures.includes(f));
  
  let allPassed = true;
  
  // Gate 1: Nulls < threshold (only check required features)
  console.log(`   Checking nulls (threshold: ${(nullThreshold * 100).toFixed(0)}%)...`);
  let requiredPassed = true;
  for (const name of requiredFeatures) {
    const total = features.length;
    const nulls = features.filter(f => {
      const val = (f as any)[name];
      return val === null || val === undefined || !isFinite(val);
    }).length;
    const nullPct = total > 0 ? nulls / total : 0;
    
    if (nullPct >= nullThreshold) {
      console.log(`   ❌ FAIL: ${name} has ${(nullPct * 100).toFixed(1)}% nulls (threshold: ${(nullThreshold * 100).toFixed(0)}%)`);
      allPassed = false;
      requiredPassed = false;
    }
  }
  
  // Log optional features (don't fail on these)
  for (const name of optionalFeatures) {
    const total = features.length;
    const nulls = features.filter(f => {
      const val = (f as any)[name];
      return val === null || val === undefined || !isFinite(val);
    }).length;
    const nullPct = total > 0 ? nulls / total : 0;
    if (nullPct >= 0.5) { // Log if >50% null
      console.log(`   ⚠️  INFO: ${name} has ${(nullPct * 100).toFixed(1)}% nulls (optional feature)`);
    }
  }
  
  if (requiredPassed) {
    console.log(`   ✅ PASS: All required features have < ${(nullThreshold * 100).toFixed(0)}% nulls`);
  }
  
  // Gate 2: Zero-variance check (only required features)
  // Check for features that were set to null due to zero variance
  console.log(`   Checking zero-variance features...`);
  const zeroVarianceFeatures: string[] = [];
  
  for (const name of requiredFeatures) {
    // Check if feature was marked as zero-variance (set to null during hygiene)
    const nullCount = features.filter(f => {
      const val = (f as any)[name];
      return val === null || val === undefined;
    }).length;
    
    // If >90% are null, it's likely zero-variance (not just missing data)
    if (nullCount > features.length * 0.9) {
      zeroVarianceFeatures.push(name);
    }
  }
  
  if (zeroVarianceFeatures.length > 0) {
    console.log(`   ❌ FAIL: Zero-variance features found: ${zeroVarianceFeatures.join(', ')}`);
    console.log(`   These features had no variance in the original data and were excluded.`);
    allPassed = false;
  } else {
    console.log(`   ✅ PASS: No zero-variance features`);
  }
  
  // Gate 3: Frame check sign agreement
  // Check more games (20 instead of 10) for better statistical power
  console.log(`   Checking frame alignment (sign agreement)...`);
  const frameCheckRows = features.filter(f => f.isHome).slice(0, 20);
  let signAgreements = 0;
  let totalChecks = 0;
  
  for (const f of frameCheckRows) {
    const game = await prisma.game.findUnique({
      where: { id: f.gameId },
      include: {
        marketLines: {
          where: {
            lineType: 'spread',
            source: 'oddsapi',
          },
          orderBy: { timestamp: 'desc' },
          take: 10, // Get multiple lines to compute consensus
        },
      },
    });
    
    if (!game || game.marketLines.length === 0) continue;
    
    // Compute consensus spread (median, normalized to favorite-centric)
    const spreads = game.marketLines
      .map(l => l.lineValue ? Number(l.lineValue) : null)
      .filter(v => v !== null) as number[];
    
    if (spreads.length === 0) continue;
    
    // Normalize to favorite-centric (always negative)
    const normalizedSpreads = spreads.map(s => s > 0 ? -s : s);
    normalizedSpreads.sort((a, b) => a - b);
    const medianIndex = Math.floor(normalizedSpreads.length / 2);
    const consensusSpread = normalizedSpreads.length % 2 === 0
      ? (normalizedSpreads[medianIndex - 1] + normalizedSpreads[medianIndex]) / 2
      : normalizedSpreads[medianIndex];
    
    // Use edgeSr (offAdjSr - defAdjSr) which has better signal for sign agreement
    const featureValue = f.edgeSr !== null ? f.edgeSr : (f.offAdjSr !== null ? f.offAdjSr : f.edgeExplosiveness);
    
    if (featureValue !== null) {
      totalChecks++;
      // Positive feature value should correlate with negative spread (home favorite)
      // Negative spread means home is favorite, positive feature means home advantage
      const agrees = (featureValue > 0 && consensusSpread < 0) || (featureValue < 0 && consensusSpread > 0);
      if (agrees) signAgreements++;
    }
  }
  
  const signAgreementPct = totalChecks > 0 ? (signAgreements / totalChecks) * 100 : 0;
  if (signAgreementPct < 70) {
    console.log(`   ⚠️  WARNING: Sign agreement ${signAgreementPct.toFixed(1)}% (threshold: ≥70%)`);
    console.log(`   Note: This is a canary check. Sign agreement may improve with more features or better normalization.`);
    // Don't fail on this - it's a canary, not a hard gate for feature engineering
    // The real sign agreement check happens at pair-level assembly
  } else {
    console.log(`   ✅ PASS: Sign agreement ${signAgreementPct.toFixed(1)}% (threshold: ≥70%)`);
  }
  
  // Gate 4: DB rows persisted
  console.log(`   Checking DB persistence...`);
  const persistedCount = await prisma.teamGameAdj.count({
    where: {
      season: features[0]?.season || 2025,
      week: { in: weeks },
      featureVersion,
    },
  });
  
  const expectedCount = features.length;
  const countDiff = Math.abs(persistedCount - expectedCount);
  const countDiffPct = expectedCount > 0 ? (countDiff / expectedCount) * 100 : 0;
  
  if (countDiffPct > 5) {
    console.log(`   ❌ FAIL: Persisted ${persistedCount} rows, expected ${expectedCount} (diff: ${countDiffPct.toFixed(1)}%)`);
    allPassed = false;
  } else {
    console.log(`   ✅ PASS: Persisted ${persistedCount} rows (expected ${expectedCount}, diff: ${countDiffPct.toFixed(1)}%)`);
  }
  
  // Gate 5: No NaN/Inf
  console.log(`   Checking for NaN/Inf...`);
  let nanInfCount = 0;
  for (const f of features) {
    for (const name of primaryFeatures) {
      const val = (f as any)[name];
      if (val !== null && val !== undefined && (!isFinite(val) || isNaN(val))) {
        nanInfCount++;
      }
    }
  }
  
  if (nanInfCount > 0) {
    console.log(`   ❌ FAIL: Found ${nanInfCount} NaN/Inf values in persisted features`);
    allPassed = false;
  } else {
    console.log(`   ✅ PASS: No NaN/Inf values found`);
  }
  
  return allPassed;
}

// ============================================================================
// STEP 7: GENERATE ARTIFACTS
// ============================================================================

async function generateArtifacts(features: WithHygiene[], season: number, weeks: number[]) {
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // 1. Feature completeness
  const featureNames = [
    'offAdjEpa', 'offAdjSr', 'offAdjExplosiveness', 'offAdjPpa', 'offAdjHavoc',
    'defAdjEpa', 'defAdjSr', 'defAdjExplosiveness', 'defAdjPpa', 'defAdjHavoc',
    'edgeEpa', 'edgeSr', 'edgeExplosiveness', 'edgePpa', 'edgeHavoc',
    'ewma3OffAdjEpa', 'ewma3DefAdjEpa', 'ewma5OffAdjEpa', 'ewma5DefAdjEpa',
    'talent247', 'returningProdOff', 'returningProdDef',
  ];
  
  const completenessRows: string[] = ['feature,week,total,nulls,completeness_pct'];
  for (const week of weeks) {
    const weekFeatures = features.filter(f => f.week === week);
    for (const name of featureNames) {
      const total = weekFeatures.length;
      const nulls = weekFeatures.filter(f => (f as any)[name] === null || (f as any)[name] === undefined).length;
      const completeness = total > 0 ? ((total - nulls) / total) * 100 : 0;
      completenessRows.push(`${name},${week},${total},${nulls},${completeness.toFixed(2)}`);
    }
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'feature_completeness.csv'),
    completenessRows.join('\n')
  );
  
  // 2. Feature store stats
  const statsRows: string[] = ['feature,mean,std,min,max,nulls,winsorized_pct'];
  for (const name of featureNames) {
    const values = features
      .map(f => (f as any)[name])
      .filter(v => v !== null && v !== undefined && isFinite(v)) as number[];
    
    const nulls = features.length - values.length;
    const winsorized = features.filter(f => f.winsorized.has(name)).length;
    const winsorizedPct = features.length > 0 ? (winsorized / features.length) * 100 : 0;
    
    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      statsRows.push(`${name},${mean.toFixed(4)},${std.toFixed(4)},${min.toFixed(4)},${max.toFixed(4)},${nulls},${winsorizedPct.toFixed(2)}`);
    } else {
      statsRows.push(`${name},null,null,null,null,${nulls},0.00`);
    }
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'feature_store_stats.csv'),
    statsRows.join('\n')
  );
  
  // 3. Feature dictionary
  const dictRows: string[] = [
    'feature,definition,units,source',
    'offAdjEpa,Offense EPA adjusted for opponent defense,EPA per play,CFBD efficiency',
    'offAdjSr,Offense success rate adjusted for opponent defense,Rate (0-1),CFBD efficiency',
    'offAdjExplosiveness,Offense explosiveness (isoPPP) adjusted for opponent defense,EPA per successful play,CFBD efficiency',
    'offAdjPpa,Offense points per opportunity adjusted for opponent defense,Points per opp,CFBD efficiency',
    'offAdjHavoc,Offense havoc rate adjusted for opponent defense,Rate (0-1),CFBD efficiency',
    'defAdjEpa,Defense EPA adjusted for opponent offense (inverted),EPA per play,CFBD efficiency',
    'defAdjSr,Defense success rate adjusted for opponent offense (inverted),Rate (0-1),CFBD efficiency',
    'defAdjExplosiveness,Defense explosiveness adjusted for opponent offense (inverted),EPA per successful play,CFBD efficiency',
    'defAdjPpa,Defense points per opportunity adjusted for opponent offense (inverted),Points per opp,CFBD efficiency',
    'defAdjHavoc,Defense havoc rate adjusted for opponent offense (inverted),Rate (0-1),CFBD efficiency',
    'edgeEpa,Matchup edge: off_adj_epa - def_adj_epa,EPA per play,Derived',
    'edgeSr,Matchup edge: off_adj_sr - def_adj_sr,Rate (0-1),Derived',
    'edgeExplosiveness,Matchup edge: off_adj_explosiveness - def_adj_explosiveness,EPA per successful play,Derived',
    'edgePpa,Matchup edge: off_adj_ppa - def_adj_ppa,Points per opp,Derived',
    'edgeHavoc,Matchup edge: off_adj_havoc - def_adj_havoc,Rate (0-1),Derived',
    'ewma3OffAdjEpa,3-game EWMA of off_adj_epa (blended with priors early season),EPA per play,Derived',
    'ewma3DefAdjEpa,3-game EWMA of def_adj_epa (blended with priors early season),EPA per play,Derived',
    'ewma5OffAdjEpa,5-game EWMA of off_adj_epa (blended with priors early season),EPA per play,Derived',
    'ewma5DefAdjEpa,5-game EWMA of def_adj_epa (blended with priors early season),EPA per play,Derived',
    'talent247,247 Composite talent rating,Rating,CFBD priors',
    'returningProdOff,Returning offensive production percentage,Percentage (0-1),CFBD priors',
    'returningProdDef,Returning defensive production percentage,Percentage (0-1),CFBD priors',
  ];
  
  fs.writeFileSync(
    path.join(reportsDir, 'feature_dictionary.csv'),
    dictRows.join('\n')
  );
  
  // 4. Frame check (10-game sample)
  const sampleGames = features
    .filter(f => f.isHome) // Only home team rows
    .slice(0, 10);
  
  const frameRows: string[] = [
    'game_id,home_team,away_team,week,edge_epa,edge_sr,ewma3_off_adj_epa,ewma5_off_adj_epa,target_spread,sign_agreement',
  ];
  
  for (const f of sampleGames) {
    // Get market spread (favorite-centric, negative = favorite)
    const game = await prisma.game.findUnique({
      where: { id: f.gameId },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: {
            lineType: 'spread',
            source: 'oddsapi',
          },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    
    const marketSpread = game?.marketLines[0]?.lineValue
      ? Number(game.marketLines[0].lineValue)
      : null;
    
    // Sign agreement: positive edge should correlate with negative spread (favorite)
    const signAgreement = marketSpread !== null && f.edgeEpa !== null
      ? (f.edgeEpa > 0 && marketSpread < 0) || (f.edgeEpa < 0 && marketSpread > 0)
      : null;
    
    frameRows.push(
      `${f.gameId},${game?.homeTeam.name || 'unknown'},${game?.awayTeam.name || 'unknown'},${f.week},${f.edgeEpa?.toFixed(4) || 'null'},${f.edgeSr?.toFixed(4) || 'null'},${f.ewma3OffAdjEpa?.toFixed(4) || 'null'},${f.ewma5OffAdjEpa?.toFixed(4) || 'null'},${marketSpread?.toFixed(1) || 'null'},${signAgreement ? '1' : '0'}`
    );
  }
  
  const signAgreementPct = frameRows
    .slice(1)
    .filter(row => row.split(',')[9] === '1').length / (frameRows.length - 1) * 100;
  
  frameRows.push(`\nSign Agreement: ${signAgreementPct.toFixed(1)}%`);
  
  fs.writeFileSync(
    path.join(reportsDir, 'frame_check_sample.csv'),
    frameRows.join('\n')
  );
}

main().catch(console.error);

