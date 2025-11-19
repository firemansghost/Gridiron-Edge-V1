/**
 * HFA v2 Summary Diagnostics
 * 
 * Reads core_v1_hfa_config.json and prints summary statistics.
 */

import * as fs from 'fs';
import * as path from 'path';
import hfaConfig from '../lib/data/core_v1_hfa_config.json';

interface TeamAdjustment {
  adjustment: number;
  sampleSize: number;
  meanResidual: number;
  stdevResidual: number;
}

interface HfaConfig {
  baseHfaPoints: number;
  clipRange: [number, number];
  teamAdjustments: Record<string, TeamAdjustment>;
}

function main() {
  // Type assertion: JSON clipRange is number[] but we know it's a 2-element tuple
  // Cast to any first to handle JSON import typing, then assert as tuple
  const clipRangeArray = hfaConfig.clipRange as any as number[];
  const config: HfaConfig = {
    ...hfaConfig,
    clipRange: [clipRangeArray[0], clipRangeArray[1]] as [number, number],
  } as HfaConfig;

  console.log('📊 HFA v2 Summary Diagnostics');
  console.log('==============================\n');

  const adjustments = Object.values(config.teamAdjustments);
  const effectiveHfas = adjustments.map(
    (adj) => config.baseHfaPoints + adj.adjustment
  );

  if (effectiveHfas.length === 0) {
    console.log('⚠️  No team adjustments found in config');
    return;
  }

  // Overall stats
  const minHfa = Math.min(...effectiveHfas);
  const maxHfa = Math.max(...effectiveHfas);
  const meanHfa =
    effectiveHfas.reduce((sum, hfa) => sum + hfa, 0) / effectiveHfas.length;
  const sortedHfas = [...effectiveHfas].sort((a, b) => a - b);
  const medianHfa =
    sortedHfas.length % 2 === 0
      ? (sortedHfas[sortedHfas.length / 2 - 1] +
          sortedHfas[sortedHfas.length / 2]) /
        2
      : sortedHfas[Math.floor(sortedHfas.length / 2)];

  console.log('📈 Overall Statistics:');
  console.log(`  Teams with adjustments: ${adjustments.length}`);
  console.log(`  Min effective HFA: ${minHfa.toFixed(2)} pts`);
  console.log(`  Mean effective HFA: ${meanHfa.toFixed(2)} pts`);
  console.log(`  Median effective HFA: ${medianHfa.toFixed(2)} pts`);
  console.log(`  Max effective HFA: ${maxHfa.toFixed(2)} pts`);

  // Count by bucket
  const bucket1 = effectiveHfas.filter((hfa) => hfa < 1.5).length;
  const bucket2 = effectiveHfas.filter(
    (hfa) => hfa >= 1.5 && hfa <= 2.5
  ).length;
  const bucket3 = effectiveHfas.filter((hfa) => hfa > 2.5).length;

  console.log('\n📊 Distribution by Effective HFA:');
  console.log(`  < 1.5 pts: ${bucket1} teams`);
  console.log(`  1.5 - 2.5 pts: ${bucket2} teams`);
  console.log(`  > 2.5 pts: ${bucket3} teams`);

  // Top/bottom 10 with sampleSize >= 15
  const qualifiedTeams = Object.entries(config.teamAdjustments)
    .filter(([, adj]) => adj.sampleSize >= 15)
    .map(([teamId, adj]) => ({
      teamId,
      effectiveHfa: config.baseHfaPoints + adj.adjustment,
      adjustment: adj.adjustment,
      sampleSize: adj.sampleSize,
    }))
    .sort((a, b) => b.effectiveHfa - a.effectiveHfa);

  console.log(`\n🏆 Top 10 teams by effective HFA (n >= 15):`);
  qualifiedTeams.slice(0, 10).forEach((team, i) => {
    console.log(
      `  ${i + 1}. ${team.teamId}: ${team.effectiveHfa.toFixed(2)} pts (adj: ${team.adjustment > 0 ? '+' : ''}${team.adjustment.toFixed(2)}, n=${team.sampleSize})`
    );
  });

  console.log(`\n📉 Bottom 10 teams by effective HFA (n >= 15):`);
  qualifiedTeams.slice(-10).reverse().forEach((team, i) => {
    console.log(
      `  ${i + 1}. ${team.teamId}: ${team.effectiveHfa.toFixed(2)} pts (adj: ${team.adjustment > 0 ? '+' : ''}${team.adjustment.toFixed(2)}, n=${team.sampleSize})`
    );
  });

  console.log('\n✅ Summary complete');
}

main();



