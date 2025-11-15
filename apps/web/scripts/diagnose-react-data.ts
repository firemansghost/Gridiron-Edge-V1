/**
 * Diagnostic script to see what data React components actually receive
 * 
 * This simulates what the SlateTable component receives from the API
 */

import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

async function diagnoseSlateTableData() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSING: What SlateTable Component Receives');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Import the actual Slate API handler
  const { GET } = await import('../app/api/weeks/slate/route');
  
  // Create a request with the same query the UI uses
  const url = new URL('http://localhost/api/weeks/slate');
  url.searchParams.set('season', '2025');
  url.searchParams.set('week', '12');
  
  const request = new NextRequest(url.toString());
  
  try {
    const response = await GET(request);
    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.error('❌ Slate API returned non-array response:', data);
      return;
    }
    
    console.log(`✅ Slate API returned ${data.length} games\n`);
    
    // Find target games
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
      
      const slateGame = data.find((g: any) => g.gameId === dbGame.id);
      
      if (!slateGame) {
        console.log(`⚠️  Game not in Slate API response: ${target.away} @ ${target.home}`);
        continue;
      }
      
      console.log(`\n📊 ${target.away} @ ${target.home}`);
      console.log(`   Game ID: ${slateGame.gameId}`);
      console.log(`   Data that SlateTable receives:`);
      console.log(`   - modelSpread: ${slateGame.modelSpread} (type: ${typeof slateGame.modelSpread}, isFinite: ${Number.isFinite(slateGame.modelSpread)})`);
      console.log(`   - modelTotal: ${slateGame.modelTotal} (type: ${typeof slateGame.modelTotal})`);
      console.log(`   - pickSpread: ${slateGame.pickSpread} (type: ${typeof slateGame.pickSpread})`);
      console.log(`   - pickTotal: ${slateGame.pickTotal} (type: ${typeof slateGame.pickTotal})`);
      console.log(`   - maxEdge: ${slateGame.maxEdge} (type: ${typeof slateGame.maxEdge}, isFinite: ${Number.isFinite(slateGame.maxEdge)})`);
      console.log(`   - confidence: ${slateGame.confidence} (type: ${typeof slateGame.confidence})`);
      console.log(`   - closingSpread: ${slateGame.closingSpread?.value ?? 'null'}`);
      console.log(`\n   Full game object (abbreviated):`);
      console.log(JSON.stringify({
        gameId: slateGame.gameId,
        modelSpread: slateGame.modelSpread,
        modelTotal: slateGame.modelTotal,
        pickSpread: slateGame.pickSpread,
        pickTotal: slateGame.pickTotal,
        maxEdge: slateGame.maxEdge,
        confidence: slateGame.confidence,
        closingSpread: slateGame.closingSpread,
        closingTotal: slateGame.closingTotal,
      }, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error calling Slate API:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
  }
}

async function diagnoseGameDetailData() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('DIAGNOSING: What Game Detail Page Receives');
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
    
    // Log key fields that the React component uses
    console.log('📋 Fields that Game Detail Page uses:');
    console.log(`   model_view.modelFavoriteLine: ${data.model_view?.modelFavoriteLine} (type: ${typeof data.model_view?.modelFavoriteLine}, isFinite: ${Number.isFinite(data.model_view?.modelFavoriteLine)})`);
    console.log(`   model_view.modelFavoriteName: ${data.model_view?.modelFavoriteName}`);
    console.log(`   model_view.edges.atsEdgePts: ${data.model_view?.edges?.atsEdgePts} (type: ${typeof data.model_view?.edges?.atsEdgePts}, isFinite: ${Number.isFinite(data.model_view?.edges?.atsEdgePts)})`);
    console.log(`   model_view.edges.ouEdgePts: ${data.model_view?.edges?.ouEdgePts}`);
    console.log(`   model.spread: ${data.model?.spread} (type: ${typeof data.model?.spread}, isFinite: ${Number.isFinite(data.model?.spread)})`);
    console.log(`   validation.ats_inputs_ok: ${data.validation?.ats_inputs_ok} (type: ${typeof data.validation?.ats_inputs_ok})`);
    console.log(`   validation.ats_reason: ${data.validation?.ats_reason}`);
    console.log(`   validation.ou_inputs_ok: ${data.validation?.ou_inputs_ok}`);
    console.log(`   validation.ou_model_valid: ${data.validation?.ou_model_valid}`);
    console.log(`   picks.spread.edgePts: ${data.picks?.spread?.edgePts}`);
    console.log(`   picks.spread.grade: ${data.picks?.spread?.grade}`);
    console.log(`   picks.spread.bettablePick: ${data.picks?.spread?.bettablePick ? 'exists' : 'null/undefined'}`);
    
    console.log('\n📋 Full relevant sections:');
    console.log(JSON.stringify({
      model_view: {
        modelFavoriteLine: data.model_view?.modelFavoriteLine,
        modelFavoriteName: data.model_view?.modelFavoriteName,
        edges: data.model_view?.edges,
      },
      model: {
        spread: data.model?.spread,
      },
      validation: {
        ats_inputs_ok: data.validation?.ats_inputs_ok,
        ats_reason: data.validation?.ats_reason,
        ou_inputs_ok: data.validation?.ou_inputs_ok,
        ou_model_valid: data.validation?.ou_model_valid,
      },
      picks: {
        spread: {
          edgePts: data.picks?.spread?.edgePts,
          grade: data.picks?.spread?.grade,
          bettablePick: data.picks?.spread?.bettablePick,
        },
      },
    }, null, 2));
    
  } catch (error) {
    console.error('❌ Error calling Game Detail API:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
  }
}

async function main() {
  try {
    await diagnoseSlateTableData();
    await diagnoseGameDetailData();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


