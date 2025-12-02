/**
 * Quick spot-check of continuity scores
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  
  // Count teams with continuity scores
  const allTeams = await prisma.teamSeasonStat.findMany({
    where: { season },
  });
  
  let withScore = 0;
  const samples: Array<{ teamId: string; score: number }> = [];
  
  for (const ts of allTeams) {
    const rawJson = (ts.rawJson as any) || {};
    const portalMeta = rawJson.portal_meta;
    
    if (portalMeta && typeof portalMeta.continuityScore === 'number') {
      withScore++;
      if (samples.length < 5) {
        samples.push({
          teamId: ts.teamId,
          score: portalMeta.continuityScore,
        });
      }
    }
  }
  
  console.log(`\n${season} Continuity Score Spot-Check:\n`);
  console.log(`Teams with continuityScore: ${withScore} of ${allTeams.length}\n`);
  
  // Get team names for samples and sort by score
  const samplesWithNames: Array<{ name: string; score: number }> = [];
  
  for (const sample of samples) {
    const team = await prisma.team.findUnique({
      where: { id: sample.teamId },
      select: { name: true },
    });
    
    samplesWithNames.push({
      name: team?.name || sample.teamId,
      score: sample.score,
    });
  }
  
  // Sort by score descending
  samplesWithNames.sort((a, b) => b.score - a.score);
  
  console.log('\nSample teams (sorted by score):');
  for (const s of samplesWithNames) {
    console.log(`  ${s.name}: ${(s.score * 100).toFixed(1)}%`);
  }
  
  // Get a few more high and low examples
  const allWithScores: Array<{ teamId: string; score: number }> = [];
  for (const ts of allTeams) {
    const rawJson = (ts.rawJson as any) || {};
    const portalMeta = rawJson.portal_meta;
    if (portalMeta && typeof portalMeta.continuityScore === 'number') {
      allWithScores.push({
        teamId: ts.teamId,
        score: portalMeta.continuityScore,
      });
    }
  }
  
  allWithScores.sort((a, b) => b.score - a.score);
  
  console.log('\nTop 3 teams:');
  for (let i = 0; i < Math.min(3, allWithScores.length); i++) {
    const team = await prisma.team.findUnique({
      where: { id: allWithScores[i].teamId },
      select: { name: true },
    });
    console.log(`  ${team?.name || allWithScores[i].teamId}: ${(allWithScores[i].score * 100).toFixed(1)}%`);
  }
  
  console.log('\nBottom 3 teams:');
  for (let i = Math.max(0, allWithScores.length - 3); i < allWithScores.length; i++) {
    const team = await prisma.team.findUnique({
      where: { id: allWithScores[i].teamId },
      select: { name: true },
    });
    console.log(`  ${team?.name || allWithScores[i].teamId}: ${(allWithScores[i].score * 100).toFixed(1)}%`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);

