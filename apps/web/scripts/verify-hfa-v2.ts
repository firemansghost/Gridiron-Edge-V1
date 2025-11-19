/**
 * HFA v2 Verification Script
 * 
 * Verifies that HFA v2 is correctly applied in the API and matches the config.
 * Tests a few sample games with known team adjustments.
 */

import { prisma } from '../lib/prisma';
import { computeEffectiveHfa } from '../lib/core-v1-spread';
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

async function main() {
  // Type assertion: JSON clipRange is number[] but we know it's a 2-element tuple
  const config: HfaConfig = {
    ...hfaConfig,
    clipRange: hfaConfig.clipRange as [number, number],
  } as HfaConfig;

  console.log('🔍 HFA v2 Verification');
  console.log('=======================\n');

  // Find a few sample games with teams that have non-zero adjustments
  const teamsWithAdjustments = Object.entries(config.teamAdjustments)
    .filter(([, adj]) => Math.abs(adj.adjustment) > 0.1)
    .slice(0, 10)
    .map(([teamId]) => teamId);

  console.log(`Testing ${teamsWithAdjustments.length} teams with non-zero adjustments:\n`);

  for (const teamId of teamsWithAdjustments) {
    const adjustment = config.teamAdjustments[teamId];
    const effectiveHfa = config.baseHfaPoints + adjustment.adjustment;

    // Find a recent home game for this team
    const homeGame = await prisma.game.findFirst({
      where: {
        homeTeamId: teamId,
        season: 2025,
        neutralSite: false,
        status: { in: ['final', 'scheduled', 'in_progress'] },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (!homeGame) {
      console.log(`⚠️  ${teamId}: No home game found`);
      continue;
    }

    // Compute HFA using the function
    const hfaInfo = computeEffectiveHfa(teamId, homeGame.neutralSite || false);

    console.log(`🏈 ${homeGame.awayTeam.name} @ ${homeGame.homeTeam.name}:`);
    console.log(`   Config adjustment: ${adjustment.adjustment > 0 ? '+' : ''}${adjustment.adjustment.toFixed(2)}`);
    console.log(`   Config effective HFA: ${effectiveHfa.toFixed(2)} pts`);
    console.log(`   Function effective HFA: ${hfaInfo.effectiveHfa.toFixed(2)} pts`);
    console.log(`   Function base HFA: ${hfaInfo.baseHfa.toFixed(2)} pts`);
    console.log(`   Function team adjustment: ${hfaInfo.teamAdjustment > 0 ? '+' : ''}${hfaInfo.teamAdjustment.toFixed(2)}`);
    console.log(`   Function raw HFA: ${hfaInfo.rawHfa.toFixed(2)} pts`);
    console.log(`   Sample size: ${adjustment.sampleSize}`);
    console.log(`   Match: ${Math.abs(effectiveHfa - hfaInfo.effectiveHfa) < 0.01 ? '✅' : '❌'}\n`);
  }

  // Test a neutral site game
  console.log('\n🏟️  Testing neutral site game:');
  const neutralGame = await prisma.game.findFirst({
    where: {
      season: 2025,
      neutralSite: true,
      status: { in: ['final', 'scheduled', 'in_progress'] },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (neutralGame) {
    const hfaInfo = computeEffectiveHfa(neutralGame.homeTeamId, true);
    console.log(`   ${neutralGame.awayTeam.name} @ ${neutralGame.homeTeam.name} (Neutral):`);
    console.log(`   Effective HFA: ${hfaInfo.effectiveHfa.toFixed(2)} pts`);
    console.log(`   Team adjustment: ${hfaInfo.teamAdjustment.toFixed(2)}`);
    console.log(`   Match (should be 0.0): ${hfaInfo.effectiveHfa === 0.0 ? '✅' : '❌'}\n`);
  } else {
    console.log('   ⚠️  No neutral site game found\n');
  }

  // Test a team with max adjustment (clipped)
  const maxAdjustmentTeam = Object.entries(config.teamAdjustments)
    .reduce((max, [teamId, adj]) => {
      const effective = config.baseHfaPoints + adj.adjustment;
      return effective > max.effective ? { teamId, effective, adjustment: adj } : max;
    }, { teamId: '', effective: 0, adjustment: null as TeamAdjustment | null });

  if (maxAdjustmentTeam.adjustment) {
    console.log(`\n📊 Testing max adjustment team (${maxAdjustmentTeam.teamId}):`);
    const hfaInfo = computeEffectiveHfa(maxAdjustmentTeam.teamId, false);
    console.log(`   Effective HFA: ${hfaInfo.effectiveHfa.toFixed(2)} pts`);
    console.log(`   Clip range: [${config.clipRange[0]}, ${config.clipRange[1]}]`);
    console.log(`   Clipped correctly: ${hfaInfo.effectiveHfa <= config.clipRange[1] ? '✅' : '❌'}\n`);
  }

  // Test a team with min adjustment (clipped)
  const minAdjustmentTeam = Object.entries(config.teamAdjustments)
    .reduce((min, [teamId, adj]) => {
      const effective = config.baseHfaPoints + adj.adjustment;
      return effective < min.effective ? { teamId, effective, adjustment: adj } : min;
    }, { teamId: '', effective: 10, adjustment: null as TeamAdjustment | null });

  if (minAdjustmentTeam.adjustment) {
    console.log(`\n📊 Testing min adjustment team (${minAdjustmentTeam.teamId}):`);
    const hfaInfo = computeEffectiveHfa(minAdjustmentTeam.teamId, false);
    console.log(`   Effective HFA: ${hfaInfo.effectiveHfa.toFixed(2)} pts`);
    console.log(`   Clip range: [${config.clipRange[0]}, ${config.clipRange[1]}]`);
    console.log(`   Clipped correctly: ${hfaInfo.effectiveHfa >= config.clipRange[0] ? '✅' : '❌'}\n`);
  }

  console.log('✅ Verification complete');
  await prisma.$disconnect();
}

main().catch(console.error);


