/**
 * Quick check for roster_churn data
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const seasons = [2024, 2025];
  
  for (const season of seasons) {
    const teamSeasons = await prisma.teamSeasonStat.findMany({
      where: { season },
      take: 10,
    });
    
    let withRosterChurn = 0;
    for (const ts of teamSeasons) {
      const rawJson = (ts.rawJson as any) || {};
      if (rawJson.roster_churn) {
        withRosterChurn++;
        console.log(`\n${season} - ${ts.teamId}:`);
        console.log(JSON.stringify(rawJson.roster_churn, null, 2));
        if (withRosterChurn >= 3) break;
      }
    }
    
    console.log(`\n${season}: ${withRosterChurn} of ${teamSeasons.length} sample teams have roster_churn`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);


