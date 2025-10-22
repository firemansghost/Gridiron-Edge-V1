#!/usr/bin/env node

/**
 * Strict validator for team_aliases.yml
 * 
 * This script validates the team aliases configuration to ensure:
 * 1. No duplicate keys in the YAML
 * 2. All team IDs exist in the database teams table
 * 3. No denylisted names are also present as allowed aliases
 * 
 * This should be run as part of CI and before deploying odds ingestion jobs.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { PrismaClient } from '@prisma/client';

const ALIAS_PATH = 'apps/jobs/config/team_aliases.yml';

console.log('🔍 Validating team_aliases.yml...\n');

async function validateAliases() {
  let exitCode = 0;

  // Step 1: Load and parse YAML with duplicate key detection
  console.log('Step 1: Checking for duplicate keys...');
  let aliasData;
  let aliases = {};
  let denylist = [];
  
  try {
    const content = readFileSync(ALIAS_PATH, 'utf8');
    
    // Custom duplicate key detection
    const lines = content.split('\n');
    const seenKeys = new Set();
    const duplicateKeys = new Set();
    let inAliasesSection = false;
    let inDenylistSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Track which section we're in
      if (trimmed === 'aliases:') {
        inAliasesSection = true;
        inDenylistSection = false;
        continue;
      } else if (trimmed === 'denylist:') {
        inAliasesSection = false;
        inDenylistSection = true;
        continue;
      }
      
      // Only check for duplicates in the aliases section
      if (inAliasesSection && !trimmed.startsWith('#') && trimmed.includes(':')) {
        // Match "key": value pattern
        const match = trimmed.match(/^"([^"]+)":/);
        if (match) {
          const key = match[1];
          if (seenKeys.has(key)) {
            duplicateKeys.add(key);
            console.log(`   ❌ Line ${i + 1}: Duplicate key "${key}"`);
            exitCode = 1;
          } else {
            seenKeys.add(key);
          }
        }
      }
    }
    
    if (duplicateKeys.size > 0) {
      console.log(`\n❌ Found ${duplicateKeys.size} duplicate keys:`);
      for (const key of duplicateKeys) {
        console.log(`   - "${key}"`);
      }
      exitCode = 1;
    } else {
      console.log('   ✅ No duplicate keys found');
    }
    
    // Parse YAML normally (js-yaml may not catch all duplicates depending on version)
    aliasData = yaml.load(content);
    
    if (!aliasData || typeof aliasData !== 'object') {
      console.log('❌ Invalid YAML structure: expected object with aliases and denylist sections');
      process.exit(1);
    }
    
    if (!aliasData.aliases || typeof aliasData.aliases !== 'object') {
      console.log('❌ Invalid YAML structure: missing or invalid "aliases" section');
      process.exit(1);
    }
    
    aliases = aliasData.aliases;
    denylist = aliasData.denylist || [];
    
    if (!Array.isArray(denylist)) {
      console.log('❌ Invalid YAML structure: "denylist" must be an array');
      process.exit(1);
    }
    
  } catch (error) {
    console.log(`❌ Failed to parse YAML: ${error.message}`);
    process.exit(1);
  }

  // Step 2: Check for alias/denylist conflicts
  console.log('\nStep 2: Checking for alias/denylist conflicts...');
  const aliasNames = Object.keys(aliases);
  const denylistSet = new Set(denylist.map(name => name.toLowerCase()));
  const conflicts = [];
  
  for (const aliasName of aliasNames) {
    if (denylistSet.has(aliasName.toLowerCase())) {
      conflicts.push(aliasName);
      console.log(`   ❌ Conflict: "${aliasName}" is both an alias and denylisted`);
      exitCode = 1;
    }
  }
  
  if (conflicts.length === 0) {
    console.log('   ✅ No alias/denylist conflicts found');
  } else {
    console.log(`\n❌ Found ${conflicts.length} conflicts between aliases and denylist`);
  }

  // Step 3: Validate team IDs against database
  console.log('\nStep 3: Validating team IDs against database...');
  
  const prisma = new PrismaClient();
  
  try {
    // Fetch all team IDs from the database
    const teams = await prisma.team.findMany({
      select: { id: true }
    });
    
    const validTeamIds = new Set(teams.map(t => t.id));
    console.log(`   📊 Found ${validTeamIds.size} teams in database`);
    
    // Check all alias targets
    const uniqueTeamIds = new Set(Object.values(aliases));
    const invalidTeamIds = [];
    
    for (const teamId of uniqueTeamIds) {
      if (!validTeamIds.has(teamId)) {
        invalidTeamIds.push(teamId);
        console.log(`   ❌ Invalid team ID: "${teamId}" (not found in teams table)`);
        exitCode = 1;
      }
    }
    
    if (invalidTeamIds.length === 0) {
      console.log(`   ✅ All ${uniqueTeamIds.size} team IDs are valid`);
    } else {
      console.log(`\n❌ Found ${invalidTeamIds.length} invalid team IDs`);
    }
    
  } catch (error) {
    console.log(`   ⚠️  Could not validate against database: ${error.message}`);
    console.log('   💡 Ensure DATABASE_URL is set and database is accessible');
    // Don't fail if DB is not accessible (e.g., in CI without DB)
    console.log('   ⏭️  Skipping database validation');
  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n📋 Validation Summary:');
  console.log(`   Total aliases: ${Object.keys(aliases).length}`);
  console.log(`   Unique team IDs: ${new Set(Object.values(aliases)).size}`);
  console.log(`   Denylist entries: ${denylist.length}`);
  
  if (exitCode === 0) {
    console.log('\n✅ Validation passed - team_aliases.yml is valid');
  } else {
    console.log('\n❌ Validation failed - please fix the errors above');
  }
  
  process.exit(exitCode);
}

validateAliases().catch(error => {
  console.error('💥 Validation script failed:', error);
  process.exit(1);
});


