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

const FEATURE_VERSION = process.env.FEATURE_VERSION || 'v1.0';
const WINSORIZE_PCT = 0.01; // 1st and 99th percentile

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
      i++;
    }
  }
  
  console.log('\n======================================================================');
  console.log('🔧 FEATURE ENGINEERING (Task 11)');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}`);
  console.log(`   Feature Version: ${FEATURE_VERSION}\n`);
  
  // Step 1: Load games and CFBD data
  console.log('📊 Step 1: Loading games and CFBD data...');
  const features = await loadTeamGameFeatures(season, weeks);
  console.log(`   ✅ Loaded ${features.length} team-game features\n`);
  
  // Step 2: Compute opponent-adjusted nets
  console.log('🔧 Step 2: Computing opponent-adjusted nets...');
  const withAdjNets = computeOpponentAdjustedNets(features);
  console.log(`   ✅ Computed adjusted nets for ${withAdjNets.length} team-games\n`);
  
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
  await persistFeatures(cleaned, FEATURE_VERSION);
  console.log(`   ✅ Persisted ${cleaned.length} feature rows\n`);
  
  // Step 7: Generate artifacts
  console.log('📄 Step 7: Generating artifacts...');
  await generateArtifacts(cleaned, season, weeks);
  console.log(`   ✅ Artifacts generated\n`);
  
  console.log('======================================================================');
  console.log('✅ FEATURE ENGINEERING COMPLETE');
  console.log('======================================================================\n');
  
  await prisma.$disconnect();
}

// ... (continuing in next part due to length)

main().catch(console.error);

