#!/usr/bin/env node

/**
 * Preflight check for job assets
 * 
 * This script verifies that all required assets are present after build
 * and provides useful diagnostics for troubleshooting.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

const requiredAssets = [
  'apps/jobs/dist/config/team_aliases.yml',
  'apps/jobs/dist/config/denylist.ts',
  'apps/jobs/dist/config/transitional_teams.ts',
  'apps/jobs/dist/config/fbs_slugs.json'
];

console.log('🔍 Preflight check: Verifying job assets...\n');

let allAssetsPresent = true;
let aliasCount = 0;
let denylistCount = 0;

for (const assetPath of requiredAssets) {
  if (existsSync(assetPath)) {
    console.log(`✅ Found: ${assetPath}`);
    
    // Special handling for team_aliases.yml
    if (assetPath.endsWith('team_aliases.yml')) {
      try {
        const content = readFileSync(assetPath, 'utf8');
        const data = yaml.load(content);
        
        if (data && data.aliases) {
          aliasCount = Object.keys(data.aliases).length;
          console.log(`   📊 Aliases loaded: ${aliasCount}`);
          
          if (data.denylist && Array.isArray(data.denylist)) {
            denylistCount = data.denylist.length;
            console.log(`   🚫 Denylist entries: ${denylistCount}`);
          }
        } else {
          console.log(`   ⚠️  Invalid YAML structure`);
          allAssetsPresent = false;
        }
      } catch (error) {
        console.log(`   ❌ Failed to parse YAML: ${error.message}`);
        allAssetsPresent = false;
      }
    }
  } else {
    console.log(`❌ Missing: ${assetPath}`);
    allAssetsPresent = false;
  }
}

console.log('\n📋 Summary:');
console.log(`   Assets present: ${allAssetsPresent ? '✅' : '❌'}`);
console.log(`   Team aliases: ${aliasCount}`);
console.log(`   Denylist entries: ${denylistCount}`);

if (!allAssetsPresent) {
  console.log('\n❌ Preflight check failed - missing required assets');
  console.log('💡 Make sure to run: npm run build:jobs');
  process.exit(1);
}

if (aliasCount === 0) {
  console.log('\n❌ Preflight check failed - no aliases loaded');
  process.exit(1);
}

console.log('\n✅ Preflight check passed - all assets present and valid');
