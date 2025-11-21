/**
 * V2 Metrics Audit Script
 * 
 * Analyzes the availability and quality of advanced metrics (Trench, Chaos, Explosiveness, Finishing)
 * for the 2025 season. Identifies which metrics are ready for V2 model development.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MetricAudit {
  metricName: string;
  category: string;
  coverage: number; // Percentage of non-null records
  avgValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  totalRecords: number;
  nonNullRecords: number;
  status: '✅ Ready' | '⚠️ Partial' | '❌ Missing';
}

async function auditV2Metrics() {
  console.log('🔍 V2 Metrics Audit - 2025 Season\n');
  console.log('=' .repeat(80));
  
  const season = 2025;
  
  // Define V2 metrics to audit
  const v2Metrics = [
    // Trench Metrics
    { name: 'Line Yards (Off)', field: 'lineYardsOff', category: 'Trench', table: 'game' as const },
    { name: 'Stuff Rate', field: 'stuffRate', category: 'Trench', table: 'game' as const },
    { name: 'Power Success', field: 'powerSuccess', category: 'Trench', table: 'game' as const },
    
    // Chaos Metrics
    { name: 'Havoc (Off)', field: 'havocOff', category: 'Chaos', table: 'game' as const },
    { name: 'Havoc (Def)', field: 'havocDef', category: 'Chaos', table: 'game' as const },
    { name: 'Havoc Front-7 (Off)', field: 'havocFront7Off', category: 'Chaos', table: 'game' as const },
    { name: 'Havoc Front-7 (Def)', field: 'havocFront7Def', category: 'Chaos', table: 'game' as const },
    { name: 'Havoc DB (Off)', field: 'havocDbOff', category: 'Chaos', table: 'game' as const },
    { name: 'Havoc DB (Def)', field: 'havocDbDef', category: 'Chaos', table: 'game' as const },
    
    // Explosiveness Metrics
    { name: 'IsoPPP (Off)', field: 'isoPppOff', category: 'Explosiveness', table: 'game' as const },
    { name: 'IsoPPP (Def)', field: 'isoPppDef', category: 'Explosiveness', table: 'game' as const },
    
    // Finishing Metrics
    { name: 'PPO (Off)', field: 'ppoOff', category: 'Finishing', table: 'game' as const },
    { name: 'PPO (Def)', field: 'ppoDef', category: 'Finishing', table: 'game' as const },
  ];
  
  const results: MetricAudit[] = [];
  
  // Get CFBD game IDs for 2025 season
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: { season },
    select: { gameIdCfbd: true }
  });
  
  const cfbdGameIds = cfbdGames.map(g => g.gameIdCfbd);
  
  const totalGameRecords = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: { in: cfbdGameIds }
    }
  });
  
  const totalSeasonRecords = await prisma.cfbdEffTeamSeason.count({
    where: { season }
  });
  
  console.log(`\n📊 Record Counts:`);
  console.log(`   Game-Level Records: ${totalGameRecords}`);
  console.log(`   Season-Level Records: ${totalSeasonRecords}\n`);
  
  // Audit game-level metrics
  console.log('🎮 Game-Level Metrics (CfbdEffTeamGame):\n');
  
  for (const metric of v2Metrics) {
    if (metric.table === 'game') {
      const field = metric.field as keyof typeof prisma.cfbdEffTeamGame.fields;
      
      // Get all records for 2025 (using cfbdGameIds from above)
      const allRecords = await prisma.cfbdEffTeamGame.findMany({
        where: {
          gameIdCfbd: { in: cfbdGameIds }
        },
        select: {
          [metric.field]: true
        }
      });
      
      // Filter non-null values and convert to numbers
      const nonNullValues = allRecords
        .map(r => (r as any)[metric.field])
        .filter((v): v is number => v !== null && v !== undefined)
        .map(v => Number(v));
      
      const totalRecords = allRecords.length;
      const nonNullRecords = nonNullValues.length;
      const coverage = totalRecords > 0 ? (nonNullRecords / totalRecords) * 100 : 0;
      
      let avgValue: number | null = null;
      let minValue: number | null = null;
      let maxValue: number | null = null;
      
      if (nonNullValues.length > 0) {
        avgValue = nonNullValues.reduce((a, b) => a + b, 0) / nonNullValues.length;
        minValue = Math.min(...nonNullValues);
        maxValue = Math.max(...nonNullValues);
      }
      
      // Determine status
      let status: '✅ Ready' | '⚠️ Partial' | '❌ Missing';
      if (coverage >= 90) {
        status = '✅ Ready';
      } else if (coverage >= 50) {
        status = '⚠️ Partial';
      } else {
        status = '❌ Missing';
      }
      
      results.push({
        metricName: metric.name,
        category: metric.category,
        coverage,
        avgValue,
        minValue,
        maxValue,
        totalRecords,
        nonNullRecords,
        status
      });
    }
  }
  
  // Get CFBD game IDs for game-level metrics (reuse from above)
  // Also audit season-level metrics
  console.log('📅 Season-Level Metrics (CfbdEffTeamSeason):\n');
  
  const seasonMetrics = [
    { name: 'Line Yards (Off) - Season', field: 'lineYardsOff', category: 'Trench' },
    { name: 'Stuff Rate - Season', field: 'stuffRate', category: 'Trench' },
    { name: 'Power Success - Season', field: 'powerSuccess', category: 'Trench' },
    { name: 'Havoc (Off) - Season', field: 'havocOff', category: 'Chaos' },
    { name: 'Havoc (Def) - Season', field: 'havocDef', category: 'Chaos' },
    { name: 'IsoPPP (Off) - Season', field: 'isoPppOff', category: 'Explosiveness' },
    { name: 'IsoPPP (Def) - Season', field: 'isoPppDef', category: 'Explosiveness' },
    { name: 'PPO (Off) - Season', field: 'ppoOff', category: 'Finishing' },
    { name: 'PPO (Def) - Season', field: 'ppoDef', category: 'Finishing' },
  ];
  
  for (const metric of seasonMetrics) {
    const allRecords = await prisma.cfbdEffTeamSeason.findMany({
      where: { season },
      select: {
        [metric.field]: true
      }
    });
    
    const nonNullValues = allRecords
      .map(r => (r as any)[metric.field])
      .filter((v): v is number => v !== null && v !== undefined)
      .map(v => Number(v));
    
    const totalRecords = allRecords.length;
    const nonNullRecords = nonNullValues.length;
    const coverage = totalRecords > 0 ? (nonNullRecords / totalRecords) * 100 : 0;
    
    let avgValue: number | null = null;
    let minValue: number | null = null;
    let maxValue: number | null = null;
    
    if (nonNullValues.length > 0) {
      avgValue = nonNullValues.reduce((a, b) => a + b, 0) / nonNullValues.length;
      minValue = Math.min(...nonNullValues);
      maxValue = Math.max(...nonNullValues);
    }
    
    let status: '✅ Ready' | '⚠️ Partial' | '❌ Missing';
    if (coverage >= 90) {
      status = '✅ Ready';
    } else if (coverage >= 50) {
      status = '⚠️ Partial';
    } else {
      status = '❌ Missing';
    }
    
    results.push({
      metricName: metric.name,
      category: metric.category,
      coverage,
      avgValue,
      minValue,
      maxValue,
      totalRecords,
      nonNullRecords,
      status
    });
  }
  
  // Print results table
  console.log('\n' + '='.repeat(80));
  console.log('📋 V2 METRICS AUDIT RESULTS\n');
  
  // Group by category
  const categories = ['Trench', 'Chaos', 'Explosiveness', 'Finishing'];
  
  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    if (categoryResults.length === 0) continue;
    
    console.log(`\n${category.toUpperCase()} METRICS:`);
    console.log('-'.repeat(80));
    console.log(
      'Metric Name'.padEnd(35) +
      'Coverage'.padEnd(12) +
      'Avg Value'.padEnd(12) +
      'Range'.padEnd(20) +
      'Status'
    );
    console.log('-'.repeat(80));
    
    for (const result of categoryResults) {
      const rangeStr = result.minValue !== null && result.maxValue !== null
        ? `${result.minValue.toFixed(2)} - ${result.maxValue.toFixed(2)}`
        : 'N/A';
      
      const avgStr = result.avgValue !== null
        ? result.avgValue.toFixed(3)
        : 'N/A';
      
      console.log(
        result.metricName.padEnd(35) +
        `${result.coverage.toFixed(1)}%`.padEnd(12) +
        avgStr.padEnd(12) +
        rangeStr.padEnd(20) +
        result.status
      );
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  const ready = results.filter(r => r.status === '✅ Ready').length;
  const partial = results.filter(r => r.status === '⚠️ Partial').length;
  const missing = results.filter(r => r.status === '❌ Missing').length;
  
  console.log(`✅ Ready (≥90% coverage): ${ready} metrics`);
  console.log(`⚠️  Partial (50-89% coverage): ${partial} metrics`);
  console.log(`❌ Missing (<50% coverage): ${missing} metrics`);
  console.log(`\nTotal Metrics Audited: ${results.length}`);
  
  // Additional data points audit
  console.log('\n' + '='.repeat(80));
  console.log('📦 COMPLETE DATA POINTS AUDIT\n');
  
  // Check all CFBD tables
  console.log('CFBD Efficiency & PPA Tables:');
  
  const effTeamGameCount = await prisma.cfbdEffTeamGame.count({
    where: { gameIdCfbd: { in: cfbdGameIds } }
  });
  console.log(`   ${effTeamGameCount > 0 ? '✅' : '❌'} CfbdEffTeamGame: ${effTeamGameCount} records`);
  
  const effTeamSeasonCount = await prisma.cfbdEffTeamSeason.count({
    where: { season }
  });
  console.log(`   ${effTeamSeasonCount > 0 ? '✅' : '❌'} CfbdEffTeamSeason: ${effTeamSeasonCount} records`);
  
  const ppaTeamGameCount = await prisma.cfbdPpaTeamGame.count({
    where: { gameIdCfbd: { in: cfbdGameIds } }
  });
  console.log(`   ${ppaTeamGameCount > 0 ? '✅' : '❌'} CfbdPpaTeamGame: ${ppaTeamGameCount} records`);
  
  const ppaTeamSeasonCount = await prisma.cfbdPpaTeamSeason.count({
    where: { season }
  });
  console.log(`   ${ppaTeamSeasonCount > 0 ? '✅' : '❌'} CfbdPpaTeamSeason: ${ppaTeamSeasonCount} records`);
  
  // Check Game table
  const gameCount = await prisma.game.count({ where: { season } });
  console.log(`\n   ✅ Game: ${gameCount} games`);
  
  // Check MarketLine table
  const marketLineCount = await prisma.marketLine.count({
    where: { season }
  });
  const spreadLines = await prisma.marketLine.count({
    where: { season, lineType: 'spread' }
  });
  const totalLines = await prisma.marketLine.count({
    where: { season, lineType: 'total' }
  });
  const mlLines = await prisma.marketLine.count({
    where: { season, lineType: 'moneyline' }
  });
  console.log(`   ✅ MarketLine: ${marketLineCount} total lines`);
  console.log(`      - Spread: ${spreadLines} lines`);
  console.log(`      - Total: ${totalLines} lines`);
  console.log(`      - Moneyline: ${mlLines} lines`);
  
  // Check TeamSeasonTalent
  const talentCount = await prisma.teamSeasonTalent.count({ where: { season } });
  console.log(`   ✅ TeamSeasonTalent: ${talentCount} team records`);
  
  // Check TeamSeasonStat (basic stats)
  const teamSeasonStatCount = await prisma.teamSeasonStat.count({ where: { season } });
  console.log(`   ✅ TeamSeasonStat: ${teamSeasonStatCount} team records`);
  
  // Check Weather
  const weatherCount = await prisma.weather.count({
    where: {
      game: {
        season
      }
    }
  });
  console.log(`   ${weatherCount > 0 ? '✅' : '❌'} Weather: ${weatherCount} game records`);
  
  // Check Injuries
  const injuryCount = await prisma.injury.count({
    where: {
      season
    }
  });
  console.log(`   ${injuryCount > 0 ? '✅' : '❌'} Injuries: ${injuryCount} records`);
  
  // Check Power Ratings
  const powerRatingCount = await prisma.powerRating.count({
    where: {
      season,
      modelVersion: 'v1'
    }
  });
  console.log(`   ${powerRatingCount > 0 ? '✅' : '❌'} PowerRating (V1): ${powerRatingCount} records`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Audit Complete\n');
}

// Run the audit
auditV2Metrics()
  .catch((error) => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

