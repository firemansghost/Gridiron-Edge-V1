/**
 * Test Feature Loader Job
 * 
 * Tests the feature loader with fallback hierarchy for a few teams.
 * Useful for debugging and validating the data source selection logic.
 * 
 * Usage:
 *   ts-node apps/jobs/src/ratings/test-feature-loader.ts --season 2025 --teams alabama,georgia,texas
 */

import { PrismaClient } from '@prisma/client';
import { FeatureLoader } from './feature-loader';

const prisma = new PrismaClient();

interface Args {
  season: number;
  teams: string[];
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let season = 2025;
  let teams: string[] = ['alabama', 'georgia', 'texas']; // Default test teams

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--teams' && i + 1 < args.length) {
      teams = args[i + 1].split(',').map(t => t.trim());
      i++;
    }
  }

  return { season, teams };
}

async function main() {
  const { season, teams } = parseArgs();
  
  console.log(`🧪 Testing Feature Loader for Season ${season}`);
  console.log(`📋 Testing teams: ${teams.join(', ')}`);
  console.log('');

  const loader = new FeatureLoader(prisma);

  try {
    // Test individual teams
    for (const teamSlug of teams) {
      console.log(`\n🏈 Testing ${teamSlug}:`);
      console.log('─'.repeat(50));
      
      const features = await loader.loadTeamFeatures(teamSlug, season);
      
      console.log(`   Data Source: ${features.dataSource}`);
      console.log(`   Confidence: ${(features.confidence * 100).toFixed(1)}%`);
      console.log(`   Games Count: ${features.gamesCount}`);
      console.log(`   Last Updated: ${features.lastUpdated?.toISOString() || 'Never'}`);
      
      console.log('\n   Offensive Features:');
      console.log(`     YPP Off: ${features.yppOff?.toFixed(3) || 'N/A'}`);
      console.log(`     Success Off: ${features.successOff?.toFixed(3) || 'N/A'}`);
      console.log(`     EPA Off: ${features.epaOff?.toFixed(3) || 'N/A'}`);
      console.log(`     Pace Off: ${features.paceOff?.toFixed(3) || 'N/A'}`);
      console.log(`     Pass YPA Off: ${features.passYpaOff?.toFixed(3) || 'N/A'}`);
      console.log(`     Rush YPC Off: ${features.rushYpcOff?.toFixed(3) || 'N/A'}`);
      
      console.log('\n   Defensive Features:');
      console.log(`     YPP Def: ${features.yppDef?.toFixed(3) || 'N/A'}`);
      console.log(`     Success Def: ${features.successDef?.toFixed(3) || 'N/A'}`);
      console.log(`     EPA Def: ${features.epaDef?.toFixed(3) || 'N/A'}`);
      console.log(`     Pace Def: ${features.paceDef?.toFixed(3) || 'N/A'}`);
      console.log(`     Pass YPA Def: ${features.passYpaDef?.toFixed(3) || 'N/A'}`);
      console.log(`     Rush YPC Def: ${features.rushYpcDef?.toFixed(3) || 'N/A'}`);
    }

    // Test data source summary
    console.log(`\n📊 Data Source Summary for Season ${season}:`);
    console.log('═'.repeat(60));
    
    const summary = await loader.getDataSourceSummary(season);
    
    console.log(`   Total Teams: ${summary.total}`);
    console.log(`   Game Features: ${summary.gameFeatures} (${((summary.gameFeatures / summary.total) * 100).toFixed(1)}%)`);
    console.log(`   Season Features: ${summary.seasonFeatures} (${((summary.seasonFeatures / summary.total) * 100).toFixed(1)}%)`);
    console.log(`   Baseline Only: ${summary.baselineOnly} (${((summary.baselineOnly / summary.total) * 100).toFixed(1)}%)`);
    console.log(`   Missing: ${summary.missing} (${((summary.missing / summary.total) * 100).toFixed(1)}%)`);
    
    const qualityScore = Math.round(
      (summary.gameFeatures * 100 + summary.seasonFeatures * 70 + summary.baselineOnly * 30) / 
      Math.max(summary.total, 1)
    );
    console.log(`   Quality Score: ${qualityScore}/100`);

    console.log('\n✅ Feature loader test completed successfully!');

  } catch (error) {
    console.error('❌ Feature loader test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
