/**
 * M4.1 Weeks CSV Export API Route
 * 
 * Exports filtered week data as CSV for download.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0; // no caching; always run on server

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick } from '@/lib/pick-helpers';
import { pickMoneyline, getLineValue, americanToProb } from '@/lib/market-line-helpers';
import { abbrevSource } from '@/lib/market-badges';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const season = parseInt(searchParams.get('season') || '2024');
    const week = parseInt(searchParams.get('week') || '1');
    const confidence = searchParams.get('confidence') || '';
    const market = searchParams.get('market') || '';

    // Build where clause for filters
    const whereClause: any = {
      season,
      week
    };

    if (confidence) {
      whereClause.edgeConfidence = confidence;
    }

    // Get games with matchup outputs
    const games = await prisma.game.findMany({
      where: {
        season,
        week
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1',
            ...(confidence ? { edgeConfidence: confidence as 'A' | 'B' | 'C' } : {})
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Filter by market type if specified
    let filteredGames = games;
    if (market === 'spread') {
      filteredGames = games.filter(game => 
        game.matchupOutputs.some(output => 
          Math.abs(output.impliedSpread - (game.marketLines.find(line => line.lineType === 'spread')?.closingLine || 0)) >= 2.0
        )
      );
    } else if (market === 'total') {
      filteredGames = games.filter(game => 
        game.matchupOutputs.some(output => 
          Math.abs(output.impliedTotal - (game.marketLines.find(line => line.lineType === 'total')?.closingLine || 45)) >= 2.0
        )
      );
    }

    // Format CSV data
    const csvRows = filteredGames.map(game => {
      const matchupOutput = game.matchupOutputs[0];
      const spreadLine = game.marketLines.find(line => line.lineType === 'spread');
      const totalLine = game.marketLines.find(line => line.lineType === 'total');
      
      const impliedSpread = matchupOutput?.impliedSpread || 0;
      const impliedTotal = matchupOutput?.impliedTotal || 45;
      const marketSpread = spreadLine?.closingLine || 0;
      const marketTotal = totalLine?.closingLine || 45;

      // Get moneyline data using our helpers
      const mlLine = pickMoneyline(game.marketLines);
      const mlPrice = getLineValue(mlLine);
      const mlSource = mlLine?.source ? abbrevSource(mlLine.source) : '';
      const mlImpliedProb = americanToProb(mlPrice);
      
      // Determine moneyline pick label
      let mlPickLabel = '';
      if (mlPrice != null) {
        const fav = mlPrice < 0 ? game.homeTeam.name : game.awayTeam.name;
        mlPickLabel = `${fav} ML`;
      }

      // Compute spread pick details
      const spreadPick = computeSpreadPick(
        impliedSpread,
        game.homeTeam.name,
        game.awayTeam.name,
        game.homeTeamId,
        game.awayTeamId
      );

      // Compute total pick details
      const totalPick = computeTotalPick(impliedTotal, marketTotal);

      // Calculate edge points
      const spreadEdgePts = Math.abs(impliedSpread - marketSpread);
      const totalEdgePts = Math.abs(impliedTotal - marketTotal);

      // Calculate result and CLV if scores exist
      let resultSpread = '';
      let clvSpread = '';
      
      if (game.homeScore !== null && game.awayScore !== null) {
        const actualSpread = game.homeScore - game.awayScore;
        const modelLine = spreadPick.modelSpreadPick.line;
        const marketLine = marketSpread;
        
        // Determine result: W/L/Push
        const modelPickWon = (actualSpread > modelLine && actualSpread > marketLine) ||
                            (actualSpread < modelLine && actualSpread < marketLine);
        const push = Math.abs(actualSpread - modelLine) < 0.5;
        
        if (push) {
          resultSpread = 'Push';
        } else if (modelPickWon) {
          resultSpread = 'Win';
        } else {
          resultSpread = 'Loss';
        }
        
        // Calculate CLV
        const modelEdge = Math.abs(impliedSpread - marketSpread);
        const closingEdge = Math.abs(actualSpread - marketSpread);
        clvSpread = (modelEdge - closingEdge).toFixed(1);
      }

      return {
        'Matchup': `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        'Kickoff': new Date(game.date).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        'Model Line': spreadPick.spreadPickLabel,
        'Pick (Spread)': spreadPick.spreadPickLabel,
        'Pick (Total)': totalPick.totalPickLabel || '',
        'Market Close Spread': marketSpread.toFixed(1),
        'Market Close Total': marketTotal.toFixed(1),
        'Spread Edge': spreadEdgePts.toFixed(1),
        'Total Edge': totalEdgePts.toFixed(1),
        'Moneyline Price': mlPrice != null ? (mlPrice > 0 ? '+' : '') + mlPrice : '',
        'Moneyline Pick': mlPickLabel,
        'Moneyline Implied Prob': mlImpliedProb != null ? (mlImpliedProb * 100).toFixed(1) + '%' : '',
        'Moneyline Source': mlSource,
        'Confidence': matchupOutput?.edgeConfidence || 'C',
        'Result': resultSpread,
        'CLV': clvSpread,
        'Home Score': game.homeScore || '',
        'Away Score': game.awayScore || ''
      };
    });

    // Convert to CSV
    if (csvRows.length === 0) {
      return new Response('No data found', { status: 404 });
    }

    const headers = Object.keys(csvRows[0]);
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="week-${week}-${season}.csv"`
      }
    });

  } catch (error) {
    console.error('Error generating CSV:', error);
    return new Response('Error generating CSV', { status: 500 });
  }
}
