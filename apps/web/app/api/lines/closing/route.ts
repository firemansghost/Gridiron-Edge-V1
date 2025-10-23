/**
 * Closing Line Diagnostics API Route
 * 
 * Returns the closing line for a specific game and line type.
 * Used for diagnostics and verification of closing line selection logic.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { selectClosingLine } from '@/lib/closing-line-helpers';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get('gameId');
    const lineType = url.searchParams.get('lineType') as 'spread' | 'total' | null;

    if (!gameId) {
      return NextResponse.json(
        { error: 'Missing required parameter: gameId' },
        { status: 400 }
      );
    }

    if (!lineType || !['spread', 'total'].includes(lineType)) {
      return NextResponse.json(
        { error: 'Missing or invalid parameter: lineType (must be "spread" or "total")' },
        { status: 400 }
      );
    }

    console.log(`[CLOSING_LINE_API] Getting closing line for gameId=${gameId}, lineType=${lineType}`);

    const closingLine = await selectClosingLine(gameId, lineType);

    const response = {
      gameId,
      lineType,
      closing: closingLine
    };

    console.log(`[CLOSING_LINE_API] Result:`, response);

    return NextResponse.json(response);

  } catch (error) {
    console.error('Closing line API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
