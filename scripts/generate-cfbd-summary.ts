import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

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
  
  // Get counts
  const games = await prisma.cfbdGame.count({
    where: { season, week: { in: weeks } },
  });
  
  const teamSeason = await prisma.cfbdEffTeamSeason.count({
    where: { season },
  });
  
  const teamGame = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: {
        in: (await prisma.cfbdGame.findMany({
          where: { season, week: { in: weeks } },
          select: { gameIdCfbd: true },
        })).map(g => g.gameIdCfbd),
      },
    },
  });
  
  const priors = await prisma.cfbdPriorsTeamSeason.count({
    where: { season },
  });
  
  const mappings = await prisma.cfbdTeamMap.count();
  
  // Generate markdown summary
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  
  const summaryPath = path.join(reportsDir, 'cfbd_job_summary.md');
  const summary = `# CFBD Feature Ingest Job Summary

**Season:** ${season}  
**Weeks:** ${weeks.join(', ')}  
**Completed:** ${new Date().toISOString()}

## Row Counts

| Table | Rows |
|-------|------|
| CFBD Games | ${games} |
| Team-Season Stats | ${teamSeason} |
| Team-Game Stats | ${teamGame} |
| Priors (Talent + Returning) | ${priors} |
| Team Mappings | ${mappings} |

## Completeness

- **Game Stats:** ${teamGame > 0 ? ((teamGame / (games * 2)) * 100).toFixed(1) : 0}% (${teamGame}/${games * 2} expected)
- **Season Stats:** ${teamSeason > 0 ? ((teamSeason / 130) * 100).toFixed(1) : 0}% (${teamSeason}/130 expected)
- **Priors:** ${priors > 0 ? ((priors / 130) * 100).toFixed(1) : 0}% (${priors}/130 expected)

## Artifacts

- \`team_mapping_mismatches.csv\`
- \`feature_completeness.csv\`
- \`feature_store_stats.csv\`
`;

  fs.writeFileSync(summaryPath, summary);
  console.log(`✅ Job summary saved to ${summaryPath}`);
  
  await prisma.$disconnect();
}

main();

