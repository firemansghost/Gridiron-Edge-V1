/**
 * M6 Rulesets API
 * 
 * CRUD operations for strategy rulesets
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/strategies/rulesets - List all rulesets
export async function GET() {
  try {
    const rulesets = await prisma.ruleset.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      rulesets,
    });
  } catch (error) {
    console.error('Error fetching rulesets:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rulesets' },
      { status: 500 }
    );
  }
}

// POST /api/strategies/rulesets - Create new ruleset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, parameters, active } = body;

    if (!name || !parameters) {
      return NextResponse.json(
        { success: false, error: 'Name and parameters are required' },
        { status: 400 }
      );
    }

    const ruleset = await prisma.ruleset.create({
      data: {
        name,
        description: description || null,
        parameters,
        active: active !== undefined ? active : true,
      },
    });

    return NextResponse.json({
      success: true,
      ruleset,
    });
  } catch (error) {
    console.error('Error creating ruleset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create ruleset' },
      { status: 500 }
    );
  }
}
