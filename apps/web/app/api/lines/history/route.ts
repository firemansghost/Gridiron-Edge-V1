/**
 * Line History API
 * 
 * Returns historical market line data for a game, ordered by timestamp
 * 
 * Query params:
 *   - gameId: string (required)
 *   - lineType: 'spread' | 'total' | 'moneyline' (optional, returns all if not specified)
 *   - bookName: string (optional, filter by specific book)
 *   - source: string (optional, filter by source)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    const lineTypeParam = searchParams.get('lineType');
    const bookName = searchParams.get('bookName');
    const source = searchParams.get('source');

    if (!gameId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: gameId' },
        { status: 400 }
      );
    }

    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, season: true, week: true }
    });

    if (!game) {
      return NextResponse.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    // Build where clause
    const where: any = {
      gameId,
    };

    if (lineTypeParam) {
      const validLineTypes = ['spread', 'total', 'moneyline'];
      if (!validLineTypes.includes(lineTypeParam)) {
        return NextResponse.json(
          { success: false, error: `Invalid lineType. Must be one of: ${validLineTypes.join(', ')}` },
          { status: 400 }
        );
      }
      where.lineType = lineTypeParam;
    }

    if (bookName) {
      where.bookName = bookName;
    }

    if (source) {
      where.source = source;
    }

    // Query market lines ordered by timestamp (ascending for chronological history)
    const marketLines = await prisma.marketLine.findMany({
      where,
      orderBy: {
        timestamp: 'asc'
      },
      select: {
        id: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        timestamp: true,
        source: true,
        bookName: true,
        createdAt: true,
      }
    });

    // Group by lineType for easier consumption
    const grouped = marketLines.reduce((acc, line) => {
      if (!acc[line.lineType]) {
        acc[line.lineType] = [];
      }
      acc[line.lineType].push({
        id: line.id,
        lineValue: line.lineValue,
        closingLine: line.closingLine,
        timestamp: line.timestamp.toISOString(),
        source: line.source,
        bookName: line.bookName,
        createdAt: line.createdAt.toISOString(),
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Calculate statistics for each line type
    const stats: Record<string, any> = {};
    
    for (const [type, lines] of Object.entries(grouped)) {
      if (lines.length > 0) {
        const values = lines.map(l => l.lineValue);
        const opening = lines[0];
        const closing = lines[lines.length - 1];
        
        stats[type] = {
          count: lines.length,
          opening: {
            value: opening.lineValue,
            timestamp: opening.timestamp,
            bookName: opening.bookName,
            source: opening.source,
          },
          closing: {
            value: closing.closingLine !== null ? closing.closingLine : closing.lineValue,
            timestamp: closing.timestamp,
            bookName: closing.bookName,
            source: closing.source,
          },
          movement: closing.closingLine !== null 
            ? closing.closingLine - opening.lineValue
            : closing.lineValue - opening.lineValue,
          min: Math.min(...values),
          max: Math.max(...values),
          range: Math.max(...values) - Math.min(...values),
        };
      }
    }

    return NextResponse.json({
      success: true,
      gameId,
      season: game.season,
      week: game.week,
      filters: {
        lineType: lineTypeParam || null,
        bookName: bookName || null,
        source: source || null,
      },
      history: grouped,
      statistics: stats,
      totalLines: marketLines.length,
    });

  } catch (error) {
    console.error('Error fetching line history:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

