/**
 * API Response Diagnostic Script
 * 
 * Calls the actual Slate and Game Detail API handlers and logs
 * the raw JSON responses to see what the UI is actually receiving.
 */

import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

/**
 * Task 1: Inspect actual Slate API JSON
 */
async function diagnoseSlateAPI() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TASK 1: SLATE API RESPONSE DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Import the actual Slate API handler that the UI uses
  const { GET } = await import('../app/api/weeks/slate/route');
  
  // Create a request with the same query the UI uses
  const url = new URL('http://localhost/api/weeks/slate');
  url.searchParams.set('season', '2025');
  url.searchParams.set('week', '12');
  
  const request = new NextRequest(url.toString());
  
  try {
    const response = await GET(request);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      console.log(`✅ Slate API returned ${data.length} games\n`);
    } else if (data.error) {
      console.error('❌ Slate API returned error:', data.error);
      return;
    } else {
      console.log(`✅ Slate API returned data (type: ${typeof data})\n`);
    }
    
    // Find the target games
    const targetGames = [
      { home: 'UConn', away: 'Air Force' },
      { home: 'Oklahoma State', away: 'Kansas State' },
      { home: 'Alabama', away: 'Oklahoma' },
    ];
    
    for (const target of targetGames) {
      // Find by team names in database
      const dbGame = await prisma.game.findFirst({
        where: {
          season: 2025,
          week: 12,
          homeTeam: {
            name: {
              contains: target.home,
              mode: 'insensitive',
            },
          },
          awayTeam: {
            name: {
              contains: target.away,
              mode: 'insensitive',
            },
          },
        },
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      });
      
      if (!dbGame) {
        console.log(`⚠️  Game not found: ${target.away} @ ${target.home}`);
        continue;
      }
      
      const slateGame = Array.isArray(data) 
        ? data.find((g: any) => g.gameId === dbGame.id)
        : null;
      
      if (!slateGame) {
        console.log(`⚠️  Game not in Slate API response: ${target.away} @ ${target.home}`);
        continue;
      }
      
      console.log(`\n📊 ${target.away} @ ${target.home}`);
      console.log(`   Game ID: ${slateGame.gameId}`);
      console.log(`   Model Spread: ${slateGame.modelSpread ?? 'null/undefined'}`);
      console.log(`   Model Total: ${slateGame.modelTotal ?? 'null/undefined'}`);
      console.log(`   Pick Spread: ${slateGame.pickSpread ?? 'null/undefined'}`);
      console.log(`   Pick Total: ${slateGame.pickTotal ?? 'null/undefined'}`);
      console.log(`   Max Edge: ${slateGame.maxEdge ?? 'null/undefined'}`);
      console.log(`   Confidence: ${slateGame.confidence ?? 'null/undefined'}`);
      console.log(`   Market Spread: ${slateGame.closingSpread?.value ?? 'null/undefined'}`);
      console.log(`   Market Total: ${slateGame.closingTotal?.value ?? 'null/undefined'}`);
      console.log(`\n   Full JSON:`);
      console.log(JSON.stringify(slateGame, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error calling Slate API:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
  }
}

/**
 * Task 2: Inspect actual Game Detail API JSON
 */
async function diagnoseGameDetailAPI() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TASK 2: GAME DETAIL API RESPONSE DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Find OU @ Alabama game
  const game = await prisma.game.findFirst({
    where: {
      season: 2025,
      week: 12,
      homeTeam: {
        name: {
          contains: 'Alabama',
          mode: 'insensitive',
        },
      },
      awayTeam: {
        name: {
          contains: 'Oklahoma',
          mode: 'insensitive',
        },
      },
    },
  });
  
  if (!game) {
    console.error('❌ OU @ Alabama game not found');
    return;
  }
  
  console.log(`📊 Oklahoma @ Alabama`);
  console.log(`   Game ID: ${game.id}\n`);
  
  // Import the Game Detail API handler
  const { GET } = await import('../app/api/game/[gameId]/route');
  
  // Create a request
  const request = new NextRequest(`http://localhost/api/game/${game.id}`);
  const params = { gameId: game.id };
  
  try {
    const response = await GET(request, { params });
    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Game Detail API returned error:', data.error);
      return;
    }
    
    console.log('✅ Game Detail API response:\n');
    
    // Log key fields
    console.log('📋 Model Spread Fields:');
    console.log(`   model.spread: ${data.model?.spread ?? 'null/undefined'}`);
    console.log(`   model.favorite.spread: ${data.model?.favorite?.spread ?? 'null/undefined'}`);
    console.log(`   model_view.modelFavoriteLine: ${data.model_view?.modelFavoriteLine ?? 'null/undefined'}`);
    console.log(`   model_view.modelFavoriteName: ${data.model_view?.modelFavoriteName ?? 'null/undefined'}`);
    
    console.log('\n📋 ATS Edge Fields:');
    console.log(`   edge.atsEdge: ${data.edge?.atsEdge ?? 'null/undefined'}`);
    console.log(`   model_view.edges.atsEdgePts: ${data.model_view?.edges?.atsEdgePts ?? 'null/undefined'}`);
    console.log(`   picks.spread.edgePts: ${data.picks?.spread?.edgePts ?? 'null/undefined'}`);
    
    console.log('\n📋 Totals Fields:');
    console.log(`   model.total: ${data.model?.total ?? 'null/undefined'}`);
    console.log(`   model_view.modelTotal: ${data.model_view?.modelTotal ?? 'null/undefined'}`);
    console.log(`   edge.totalEdge: ${data.edge?.totalEdge ?? 'null/undefined'}`);
    console.log(`   picks.total.edgePts: ${data.picks?.total?.edgePts ?? 'null/undefined'}`);
    
    console.log('\n📋 Moneyline Fields:');
    console.log(`   picks.moneyline:`, JSON.stringify(data.picks?.moneyline ?? null, null, 2));
    
    console.log('\n📋 Full Response (abbreviated - key sections):');
    console.log(JSON.stringify({
      model: data.model,
      model_view: data.model_view,
      edge: data.edge,
      picks: {
        spread: data.picks?.spread,
        total: data.picks?.total,
        moneyline: data.picks?.moneyline,
      },
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Error calling Game Detail API:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
  }
}

/**
 * Main diagnostic function
 */
async function main() {
  try {
    await diagnoseSlateAPI();
    await diagnoseGameDetailAPI();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


