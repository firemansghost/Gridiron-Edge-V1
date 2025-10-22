#!/usr/bin/env node

/**
 * Copy job assets to dist directory
 * 
 * This script copies non-TypeScript assets (YAML, JSON, etc.) from the source
 * directory to the compiled dist directory so they're available at runtime.
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';

const sourceDir = 'apps/jobs/config';
const targetDir = 'apps/jobs/dist/config';

console.log('📦 Copying job assets...');

try {
  // Ensure target directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log(`✅ Created directory: ${targetDir}`);
  }

  // Find all config files (including YAML and JSON)
  const configFiles = await glob(`${sourceDir}/**/*`, { nodir: true });
  
  console.log(`🔍 Searching in: ${sourceDir}`);
  console.log(`📁 Found ${configFiles.length} config files`);
  console.log(`📋 Files:`, configFiles);
  
  if (configFiles.length === 0) {
    console.warn(`⚠️  No config files found in ${sourceDir}`);
    process.exit(0);
  }

  // Copy each file
  for (const sourceFile of configFiles) {
    // Extract just the filename from the full path
    const fileName = sourceFile.split('/').pop();
    const targetFile = join(targetDir, fileName);

    copyFileSync(sourceFile, targetFile);
    console.log(`✅ Copied: ${fileName}`);
  }

  console.log(`🎉 Successfully copied ${configFiles.length} assets to ${targetDir}`);

} catch (error) {
  console.error('❌ Error copying assets:', error.message);
  process.exit(1);
}
