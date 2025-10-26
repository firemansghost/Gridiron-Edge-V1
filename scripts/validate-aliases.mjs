#!/usr/bin/env node

/**
 * Validate alias files for duplicate keys
 */

import fs from 'node:fs';
import yaml from 'js-yaml';
import { join } from 'path';

function validateAliasFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(text);
  const seen = new Set();
  const dups = [];

  for (const k of Object.keys(doc)) {
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  
  if (dups.length) {
    throw new Error(
      `Duplicate keys in ${filePath}: ${dups.join(", ")}`
    );
  }
  
  return doc;
}

console.log('🔍 Validating alias files...');

try {
  // Validate main aliases
  const mainAliases = validateAliasFile(join(process.cwd(), 'apps/jobs/config/team_aliases.yml'));
  console.log(`✅ team_aliases.yml: ${Object.keys(mainAliases).length} aliases (no duplicates)`);

  // Validate CFBD aliases
  const cfbdAliases = validateAliasFile(join(process.cwd(), 'apps/jobs/config/team_aliases_cfbd.yml'));
  console.log(`✅ team_aliases_cfbd.yml: ${Object.keys(cfbdAliases).length} aliases (no duplicates)`);

  console.log('🎉 All alias files validated successfully!');

} catch (error) {
  console.error('❌ Alias validation failed:', error.message);
  process.exit(1);
}