#!/usr/bin/env node

/**
 * Simple copy script for job assets
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const sourceDir = 'apps/jobs/config';
const targetDir = 'apps/jobs/dist/config';

console.log('📦 Copying job assets...');

try {
  // Ensure target directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
    console.log(`✅ Created directory: ${targetDir}`);
  }

  // Get all files in source directory
  const files = readdirSync(sourceDir);
  console.log(`📁 Found ${files.length} files in ${sourceDir}:`, files);

  // Copy each file
  for (const fileName of files) {
    const sourceFile = join(sourceDir, fileName);
    const targetFile = join(targetDir, fileName);
    
    copyFileSync(sourceFile, targetFile);
    console.log(`✅ Copied: ${fileName}`);
  }

  console.log(`🎉 Successfully copied ${files.length} assets to ${targetDir}`);

} catch (error) {
  console.error('❌ Error copying assets:', error.message);
  process.exit(1);
}
