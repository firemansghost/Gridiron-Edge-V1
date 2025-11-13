/**
 * Generate artifacts for feature engineering runs
 * Can be run separately after compute to avoid timeouts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface Args {
  season: number;
  weeks: number[];
  featureVersion: string;
}

async function main() {
  const args: Args = {
    season: 2025,
    weeks: [],
    featureVersion: 'fe_v1',
  };
  
  // Parse args
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--season' && argv[i + 1]) {
      args.season = parseInt(argv[i + 1], 10);
    } else if (argv[i] === '--weeks' && argv[i + 1]) {
      args.weeks = argv[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
    } else if (argv[i] === '--featureVersion' && argv[i + 1]) {
      args.featureVersion = argv[i + 1];
    }
  }
  
  if (args.weeks.length === 0) {
    console.error('Error: --weeks required');
    process.exit(1);
  }
  
  console.log(`📄 Generating artifacts for Season ${args.season}, Weeks ${args.weeks.join(',')}, Version ${args.featureVersion}...\n`);
  
  // Load features from database
  const features = await prisma.teamGameAdj.findMany({
    where: {
      season: args.season,
      week: { in: args.weeks },
      featureVersion: args.featureVersion,
    },
    include: {
      game: {
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
    orderBy: [
      { week: 'asc' },
      { gameId: 'asc' },
    ],
  });
  
  console.log(`   Loaded ${features.length} feature rows from database\n`);
  
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  // 1. Feature completeness
  console.log('   Generating feature_completeness.csv...');
  const featureNames = [
    'offAdjEpa', 'offAdjSr', 'offAdjExplosiveness', 'offAdjPpa', 'offAdjHavoc',
    'defAdjEpa', 'defAdjSr', 'defAdjExplosiveness', 'defAdjPpa', 'defAdjHavoc',
    'edgeEpa', 'edgeSr', 'edgeExplosiveness', 'edgePpa', 'edgeHavoc',
    'ewma3OffAdjEpa', 'ewma3DefAdjEpa', 'ewma5OffAdjEpa', 'ewma5DefAdjEpa',
    'talent247', 'returningProdOff', 'returningProdDef',
  ];
  
  const completenessRows: string[] = ['feature,week,total,nulls,completeness_pct'];
  for (const week of args.weeks) {
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
  console.log('   Generating feature_store_stats.csv...');
  const statsRows: string[] = ['feature,mean,std,min,max,nulls'];
  for (const name of featureNames) {
    const values = features
      .map(f => (f as any)[name])
      .filter(v => v !== null && v !== undefined && isFinite(Number(v)))
      .map(v => Number(v));
    
    const nulls = features.length - values.length;
    
    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      statsRows.push(`${name},${mean.toFixed(4)},${std.toFixed(4)},${min.toFixed(4)},${max.toFixed(4)},${nulls}`);
    } else {
      statsRows.push(`${name},null,null,null,null,${nulls}`);
    }
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'feature_store_stats.csv'),
    statsRows.join('\n')
  );
  
  // 3. Feature dictionary
  console.log('   Generating feature_dictionary.csv...');
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
  
  // 4. Frame check sample
  console.log('   Generating frame_check_sample.csv...');
  const homeRows = features.filter(f => {
    const game = f.game;
    return game && game.homeTeamId === f.teamId;
  }).slice(0, 10);
  
  const frameCheckRows: string[] = [
    'game_id,week,away_team,home_team,edge_sr,edge_epa,ewma3_off_adj_epa,ewma5_off_adj_epa,market_spread',
  ];
  
  for (const f of homeRows) {
    const game = f.game;
    if (!game) continue;
    
    const marketLines = await prisma.marketLine.findMany({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });
    
    const spreads = marketLines
      .map(l => l.lineValue ? Number(l.lineValue) : null)
      .filter(v => v !== null) as number[];
    
    const consensusSpread = spreads.length > 0
      ? spreads.sort((a, b) => a - b)[Math.floor(spreads.length / 2)]
      : null;
    
    frameCheckRows.push([
      game.id,
      f.week,
      game.awayTeam?.name || 'unknown',
      game.homeTeam?.name || 'unknown',
      f.edgeSr?.toFixed(4) || 'null',
      f.edgeEpa?.toFixed(4) || 'null',
      f.ewma3OffAdjEpa?.toFixed(4) || 'null',
      f.ewma5OffAdjEpa?.toFixed(4) || 'null',
      consensusSpread?.toFixed(1) || 'null',
    ].join(','));
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'frame_check_sample.csv'),
    frameCheckRows.join('\n')
  );
  
  console.log(`\n✅ Artifacts generated in ${reportsDir}\n`);
  
  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

