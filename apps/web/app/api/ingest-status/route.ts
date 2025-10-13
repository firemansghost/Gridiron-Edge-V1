import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [games, lines, ratings, matchups] = await Promise.all([
      prisma.game.aggregate({ _max: { updatedAt: true }, _count: true }),
      prisma.marketLine.aggregate({ _max: { updatedAt: true }, _count: true }),
      prisma.powerRating.aggregate({ _max: { updatedAt: true }, _count: true }),
      prisma.matchupOutput.aggregate({ _max: { updatedAt: true }, _count: true }),
    ]);

    return Response.json({
      success: true,
      lastUpdated: {
        games: games._max.updatedAt,
        market_lines: lines._max.updatedAt,
        power_ratings: ratings._max.updatedAt,
        matchup_outputs: matchups._max.updatedAt,
      },
      counts: {
        games: games._count,
        market_lines: lines._count,
        power_ratings: ratings._count,
        matchup_outputs: matchups._count,
      }
    });
  } catch (e) {
    return Response.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

