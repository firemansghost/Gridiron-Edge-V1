import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeasonWeek } from '@/lib/current-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only current season/week for review pages.
 * Intentionally lightweight vs /api/status/week.
 */
export async function GET() {
  const current = await getCurrentSeasonWeek(prisma);
  return NextResponse.json(current);
}

