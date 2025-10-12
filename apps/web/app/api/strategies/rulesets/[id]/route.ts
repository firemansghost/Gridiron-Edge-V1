/**
 * API Route: Get/Update Single Ruleset
 * 
 * GET: Fetch ruleset by ID
 * PUT: Update existing ruleset
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const ruleset = await prisma.ruleset.findUnique({
      where: { id },
    });

    if (!ruleset) {
      return NextResponse.json(
        { success: false, error: 'Ruleset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      ruleset: {
        id: ruleset.id,
        name: ruleset.name,
        description: ruleset.description,
        parameters: ruleset.parameters,
        active: ruleset.active,
        createdAt: ruleset.createdAt.toISOString(),
        updatedAt: ruleset.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching ruleset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ruleset' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    // Validate required fields
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Ruleset name is required' },
        { status: 400 }
      );
    }

    // Check if ruleset exists
    const existing = await prisma.ruleset.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Ruleset not found' },
        { status: 404 }
      );
    }

    // Update ruleset
    const updated = await prisma.ruleset.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description || null,
        parameters: body.parameters || {},
        active: body.active !== undefined ? body.active : existing.active,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      ruleset: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        parameters: updated.parameters,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating ruleset:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update ruleset' },
      { status: 500 }
    );
  }
}

