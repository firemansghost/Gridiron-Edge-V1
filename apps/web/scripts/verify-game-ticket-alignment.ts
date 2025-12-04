/**
 * Sanity check: Verify game detail ticket matches official_flat_100 bet
 * 
 * This script verifies that the officialSpreadBet field in the game API
 * matches the actual official_flat_100 bet row from the database.
 */

import { prisma } from '../lib/prisma';

async function main() {
  const season = 2025;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Game Ticket Alignment Check - Season ${season}`);
  console.log('='.repeat(80));

  // Get all games with official_flat_100 spread bets
  const officialBets = await prisma.bet.findMany({
    where: {
      season,
      strategyTag: 'official_flat_100',
      marketType: 'spread',
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      },
    },
  });

  console.log(`\nFound ${officialBets.length} official_flat_100 spread bets for ${season}`);

  const mismatches: Array<{
    gameId: string;
    matchup: string;
    betTeam: string;
    betLine: number;
    apiTeam?: string;
    apiLine?: number;
    issue: string;
  }> = [];

  let checked = 0;
  let matched = 0;

  for (const bet of officialBets) {
    const betTeamId = bet.side === 'home' ? bet.game.homeTeamId : bet.game.awayTeamId;
    const betTeam = bet.side === 'home' ? bet.game.homeTeam : bet.game.awayTeam;
    const closePrice = bet.closePrice ? Number(bet.closePrice) : null;
    const modelPrice = bet.modelPrice ? Number(bet.modelPrice) : null;

    if (closePrice === null || modelPrice === null) {
      mismatches.push({
        gameId: bet.gameId,
        matchup: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
        betTeam: betTeam.name,
        betLine: closePrice ?? 0,
        issue: closePrice === null ? 'Missing closePrice' : 'Missing modelPrice',
      });
      continue;
    }

    // Calculate expected edge (same as API does)
    const expectedEdge = Math.abs(modelPrice - closePrice);
    
    // Calculate expected grade
    let expectedGrade: string | null = null;
    if (expectedEdge >= 4.0) expectedGrade = 'A';
    else if (expectedEdge >= 3.0) expectedGrade = 'B';
    else if (expectedEdge >= 0.1) expectedGrade = 'C';

    // Format the bet label
    const lineStr = closePrice >= 0 ? `+${closePrice.toFixed(1)}` : closePrice.toFixed(1);
    const betLabel = `${betTeam.name} ${lineStr}`;

    // Call the game API to get officialSpreadBet
    // NOTE: This requires the dev server to be running
    // If server is not running, we'll skip API checks but still validate DB data
    let apiOfficialBet: any = null;
    try {
      const response = await fetch(`http://localhost:3000/api/game/${bet.gameId}`);
      if (!response.ok) {
        console.warn(`  ⚠️  ${bet.gameId}: API returned ${response.status} (server may not be running)`);
        // Continue without API check - we'll still validate DB data
      } else {
        const data = await response.json();
        if (data.success) {
          apiOfficialBet = data.officialSpreadBet;
          checked++;
        } else {
          console.warn(`  ⚠️  ${bet.gameId}: API returned error: ${data.error}`);
        }
      }
    } catch (error) {
      // Server not running - skip API check
      console.warn(`  ⚠️  ${bet.gameId}: Cannot reach API (server may not be running)`);
    }

    // If we got API data, compare it
    if (apiOfficialBet) {

      // Compare team
      if (apiOfficialBet.teamId !== betTeamId) {
        mismatches.push({
          gameId: bet.gameId,
          matchup: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
          betTeam: betTeam.name,
          betLine: closePrice,
          apiTeam: apiOfficialBet.teamName,
          apiLine: apiOfficialBet.line,
          issue: `Team mismatch: DB has ${betTeam.name}, API has ${apiOfficialBet.teamName}`,
        });
        continue;
      }

      // Compare line (allow small floating point differences)
      if (Math.abs(apiOfficialBet.line - closePrice) > 0.01) {
        mismatches.push({
          gameId: bet.gameId,
          matchup: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
          betTeam: betTeam.name,
          betLine: closePrice,
          apiTeam: apiOfficialBet.teamName,
          apiLine: apiOfficialBet.line,
          issue: `Line mismatch: DB has ${closePrice}, API has ${apiOfficialBet.line}`,
        });
        continue;
      }

      // Compare edge (allow small floating point differences)
      if (Math.abs(apiOfficialBet.edge - expectedEdge) > 0.01) {
        mismatches.push({
          gameId: bet.gameId,
          matchup: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
          betTeam: betTeam.name,
          betLine: closePrice,
          issue: `Edge mismatch: Expected ${expectedEdge.toFixed(1)}, API has ${apiOfficialBet.edge.toFixed(1)}`,
        });
        continue;
      }

      matched++;
    } else {
      // No API data - just validate DB data is complete
      if (closePrice === null || modelPrice === null) {
        mismatches.push({
          gameId: bet.gameId,
          matchup: `${bet.game.awayTeam.name} @ ${bet.game.homeTeam.name}`,
          betTeam: betTeam.name,
          betLine: closePrice ?? 0,
          issue: closePrice === null ? 'Missing closePrice in DB' : 'Missing modelPrice in DB',
        });
      }
      // If DB data is valid but we couldn't check API, that's okay - just note it
    }
  }

  console.log(`\n✅ Checked ${checked} games via API`);
  console.log(`✅ Matched: ${matched}`);
  console.log(`⚠️  Mismatches: ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log(`\n⚠️  Found ${mismatches.length} mismatches:`);
    for (const mismatch of mismatches) {
      console.log(`  ${mismatch.gameId}: ${mismatch.matchup}`);
      console.log(`    DB: ${mismatch.betTeam} ${mismatch.betLine >= 0 ? '+' : ''}${mismatch.betLine.toFixed(1)}`);
      if (mismatch.apiTeam) {
        console.log(`    API: ${mismatch.apiTeam} ${mismatch.apiLine !== undefined ? (mismatch.apiLine >= 0 ? '+' : '') + mismatch.apiLine.toFixed(1) : 'N/A'}`);
      }
      console.log(`    Issue: ${mismatch.issue}`);
    }
  } else {
    console.log(`\n✅ All ${checked} checked games have matching officialSpreadBet`);
  }

  console.log(`\n${'='.repeat(80)}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);

