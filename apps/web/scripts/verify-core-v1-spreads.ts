/**
 * Core V1 Spread Verification Script
 * 
 * Verifies that Core V1 spreads are consistent between:
 * - Slate API (/api/model/slate)
 * - Game Detail API (/api/game/[gameId])
 * 
 * Also verifies that totals are disabled (null) in both APIs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SlateGame {
  gameId: string;
  modelSpread: number | null;
  modelTotal: number | null;
  marketSpread: number | null;
  spreadPick: string | null;
  spreadEdgePts: number | null;
  totalPick: string | null;
  totalEdgePts: number | null;
  error?: string;
}

interface GameDetailData {
  modelSpread: number | null;
  modelTotal: number | null;
  atsEdge: number;
  totalEdge: number | null;
}

interface VerificationResult {
  gameId: string;
  matchup: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  slateSpread: number | null;
  gameSpread: number | null;
  spreadMatch: boolean;
  spreadDiff: number | null;
  slateEdge: number | null;
  gameEdge: number | null;
  edgeMatch: boolean;
  edgeDiff: number | null;
  slateTotal: number | null;
  gameTotal: number | null;
  totalsDisabled: boolean;
  errors: string[];
}

const TOLERANCE = 0.05; // Allow ±0.05 point difference due to rounding

/**
 * Get games from database to find team IDs
 */
async function getGameInfo(gameId: string): Promise<{
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  matchup: string;
} | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (!game) {
    return null;
  }

  return {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeamName: game.homeTeam.name,
    awayTeamName: game.awayTeam.name,
    matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
  };
}

/**
 * Call actual Slate API handler
 */
async function getSlateData(season: number, week: number): Promise<SlateGame[]> {
  // Import the actual Slate API handler that the UI uses
  const { GET } = await import('../app/api/weeks/slate/route');
  
  // Create a request with the same query the UI uses
  const url = new URL('http://localhost/api/weeks/slate');
  url.searchParams.set('season', season.toString());
  url.searchParams.set('week', week.toString());
  
  const request = new Request(url.toString());
  
  try {
    const response = await GET(request);
    const data = await response.json();
    
    if (Array.isArray(data)) {
      // Map the API response to our SlateGame interface
      return data.map((game: any) => ({
        gameId: game.gameId,
        modelSpread: game.modelSpread ?? null,
        modelTotal: game.modelTotal ?? null,
        marketSpread: game.closingSpread?.value ?? null,
        spreadPick: game.pickSpread ?? null,
        spreadEdgePts: game.maxEdge ?? null, // maxEdge is the ATS edge for V1
        totalPick: game.pickTotal ?? null,
        totalEdgePts: null, // Totals disabled
      }));
    } else {
      console.error('Slate API returned non-array response:', data);
      return [];
    }
  } catch (error) {
    console.error('Error calling Slate API:', error);
    return [];
  }
}

/**
 * Call actual Game Detail API handler
 */
async function getGameDetail(gameId: string): Promise<{
  modelSpread: number | null;
  modelTotal: number | null;
  atsEdge: number;
  totalEdge: number | null;
} | null> {
  // Import the actual Game Detail API handler
  const { GET } = await import('../app/api/game/[gameId]/route');
  
  // Create a request
  const request = new Request(`http://localhost/api/game/${gameId}`);
  const params = { gameId };
  
  try {
    const response = await GET(request, { params });
    const data = await response.json();
    
    if (!data.success) {
      console.error(`Game Detail API returned error for ${gameId}:`, data.error);
      return null;
    }
    
    // Extract model spread from the response
    // response.model.spread is finalImpliedSpread in HMA format
    const modelSpread = data.model?.spread ?? null;
    
    // Extract ATS edge
    // response.edge.atsEdge is the ATS edge in HMA format
    const atsEdge = data.edge?.atsEdge ?? 0;
    
    // Extract model total (should be null for V1)
    const modelTotal = data.model?.total ?? null;
    
    return {
      modelSpread,
      modelTotal,
      atsEdge: typeof atsEdge === 'number' ? atsEdge : 0,
      totalEdge: data.edge?.totalEdge ?? null,
    };
  } catch (error) {
    console.error(`Error calling Game Detail API for ${gameId}:`, error);
    return null;
  }
}


/**
 * Verify a single game
 */
async function verifyGame(slateGame: SlateGame): Promise<VerificationResult> {
  const gameInfo = await getGameInfo(slateGame.gameId);
  const gameDetail = await getGameDetail(slateGame.gameId);

  const errors: string[] = [];
  let spreadMatch = false;
  let spreadDiff: number | null = null;
  let edgeMatch = false;
  let edgeDiff: number | null = null;
  let totalsDisabled = true;

  if (!gameInfo) {
    errors.push('Could not fetch game info from database');
    return {
      gameId: slateGame.gameId,
      matchup: 'Unknown',
      homeTeamId: null,
      awayTeamId: null,
      slateSpread: slateGame.modelSpread,
      gameSpread: null,
      spreadMatch: false,
      spreadDiff: null,
      slateEdge: slateGame.spreadEdgePts,
      gameEdge: null,
      edgeMatch: false,
      edgeDiff: null,
      slateTotal: slateGame.modelTotal,
      gameTotal: null,
      totalsDisabled: false,
      errors,
    };
  }

  if (!gameDetail) {
    errors.push('Could not compute game detail data');
    return {
      gameId: slateGame.gameId,
      matchup: gameInfo.matchup,
      homeTeamId: gameInfo.homeTeamId,
      awayTeamId: gameInfo.awayTeamId,
      slateSpread: slateGame.modelSpread,
      gameSpread: null,
      spreadMatch: false,
      spreadDiff: null,
      slateEdge: slateGame.spreadEdgePts,
      gameEdge: null,
      edgeMatch: false,
      edgeDiff: null,
      slateTotal: slateGame.modelTotal,
      gameTotal: null,
      totalsDisabled: false,
      errors,
    };
  }

  // Compare spreads
  // Note: Slate API rounds to 1 decimal, Game API may have different rounding
  // We'll compare with tolerance
  const slateSpread = slateGame.modelSpread;
  const gameSpread = gameDetail.modelSpread;

  if (slateSpread !== null && gameSpread !== null) {
    spreadDiff = Math.abs(slateSpread - gameSpread);
    spreadMatch = spreadDiff <= TOLERANCE;
    if (!spreadMatch) {
      errors.push(
        `Spread mismatch: Slate=${slateSpread.toFixed(2)}, Game=${gameSpread.toFixed(2)}, Diff=${spreadDiff.toFixed(2)}`
      );
    }
  } else if (slateSpread === null && gameSpread === null) {
    spreadMatch = true; // Both null is OK
  } else {
    errors.push(`Spread null mismatch: Slate=${slateSpread}, Game=${gameSpread}`);
    spreadMatch = false;
  }

  // Compare ATS edges
  const slateEdge = slateGame.spreadEdgePts;
  const gameEdge = gameDetail.atsEdge;

  if (slateEdge !== null) {
    edgeDiff = Math.abs(slateEdge - Math.abs(gameEdge));
    edgeMatch = edgeDiff <= TOLERANCE;
    if (!edgeMatch) {
      errors.push(
        `ATS Edge mismatch: Slate=${slateEdge.toFixed(2)}, Game=${Math.abs(gameEdge).toFixed(2)}, Diff=${edgeDiff.toFixed(2)}`
      );
    }
  } else {
    // If slate has no edge (no market line), that's OK
    edgeMatch = true;
  }

  // Check totals are disabled
  const slateTotal = slateGame.modelTotal;
  const gameTotal = gameDetail.modelTotal;

  if (slateTotal !== null) {
    errors.push(`Slate modelTotal should be null but is ${slateTotal}`);
    totalsDisabled = false;
  }
  if (gameTotal !== null) {
    errors.push(`Game modelTotal should be null but is ${gameTotal}`);
    totalsDisabled = false;
  }

  return {
    gameId: slateGame.gameId,
    matchup: gameInfo.matchup,
    homeTeamId: gameInfo.homeTeamId,
    awayTeamId: gameInfo.awayTeamId,
    slateSpread,
    gameSpread,
    spreadMatch,
    spreadDiff,
    slateEdge,
    gameEdge: Math.abs(gameDetail.atsEdge),
    edgeMatch,
    edgeDiff,
    slateTotal,
    gameTotal,
    totalsDisabled,
    errors,
  };
}

/**
 * Main verification function
 */
async function main() {
  const season = 2025;
  const week = 12;

  console.log(`\n🔍 Core V1 Spread Verification`);
  console.log(`Season: ${season}, Week: ${week}\n`);

  // Get slate data
  console.log('📊 Fetching slate data...');
  const slateGames = await getSlateData(season, week);
  console.log(`   Found ${slateGames.length} games\n`);

  // Find specific games to verify
  const targetMatchups = [
    { home: 'UConn', away: 'Air Force' },
    { home: 'Oklahoma State', away: 'Kansas State' },
    { home: 'Alabama', away: 'Oklahoma' },
  ];

  const gamesToVerify: SlateGame[] = [];

  // Find target games
  for (const target of targetMatchups) {
    for (const game of slateGames) {
      const info = await getGameInfo(game.gameId);
      if (info) {
        const homeMatch = info.homeTeamName.toLowerCase().includes(target.home.toLowerCase());
        const awayMatch = info.awayTeamName.toLowerCase().includes(target.away.toLowerCase());
        if (homeMatch && awayMatch) {
          gamesToVerify.push(game);
          console.log(`   ✓ Found: ${info.matchup}`);
          break;
        }
      }
    }
  }

  // Add a few random games
  const randomGames = slateGames
    .filter((g) => !gamesToVerify.some((v) => v.gameId === g.gameId))
    .slice(0, 3);
  gamesToVerify.push(...randomGames);

  console.log(`\n📋 Verifying ${gamesToVerify.length} games...\n`);

  // Verify each game
  const results: VerificationResult[] = [];
  for (const game of gamesToVerify) {
    const result = await verifyGame(game);
    results.push(result);
  }

  // Print results
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let allPassed = true;
  for (const result of results) {
    const status = result.spreadMatch && result.edgeMatch && result.totalsDisabled && result.errors.length === 0;
    const icon = status ? '✅' : '❌';
    
    console.log(`${icon} ${result.matchup}`);
    console.log(`   Game ID: ${result.gameId}`);
    console.log(`   Spread: Slate=${result.slateSpread?.toFixed(2) ?? 'null'}, Game=${result.gameSpread?.toFixed(2) ?? 'null'}, Diff=${result.spreadDiff?.toFixed(2) ?? 'N/A'}`);
    console.log(`   Edge: Slate=${result.slateEdge?.toFixed(2) ?? 'null'}, Game=${result.gameEdge?.toFixed(2) ?? 'null'}, Diff=${result.edgeDiff?.toFixed(2) ?? 'N/A'}`);
    console.log(`   Totals Disabled: ${result.totalsDisabled ? '✅' : '❌'}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors:`);
      result.errors.forEach((err) => console.log(`     - ${err}`));
      allPassed = false;
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  if (allPassed) {
    console.log('✅ All verifications passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some verifications failed. See errors above.\n');
    process.exit(1);
  }
}

// Run verification
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

