import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Load CFBD aliases
    const aliasPath = path.join(process.cwd(), 'apps/jobs/config/team_aliases_cfbd.yml');
    const aliasContent = fs.readFileSync(aliasPath, 'utf8');
    const cfbdAliases = yaml.load(aliasContent) as Record<string, string>;
    
    // Get all team IDs from database
    const dbTeams = await prisma.team.findMany({
      select: { id: true }
    });
    const dbTeamIds = new Set(dbTeams.map(t => t.id.toLowerCase()));
    
    // Find aliases that point to non-existent teams
    const missingTeams: string[] = [];
    const validTeams: string[] = [];
    
    for (const [alias, teamId] of Object.entries(cfbdAliases)) {
      if (dbTeamIds.has(teamId.toLowerCase())) {
        validTeams.push(teamId);
      } else {
        missingTeams.push(teamId);
      }
    }
    
    return NextResponse.json({
      totalAliases: Object.keys(cfbdAliases).length,
      validTeams: validTeams.length,
      missingTeams: missingTeams.length,
      missingTeamIds: missingTeams.sort(),
      validTeamIds: validTeams.sort()
    });
    
  } catch (error) {
    console.error('Error checking team differences:', error);
    return NextResponse.json(
      { error: 'Failed to check team differences' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
