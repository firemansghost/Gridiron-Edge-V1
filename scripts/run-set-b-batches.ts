/**
 * Batch runner for Set B feature engineering (Weeks 1-7)
 * Runs in smaller batches to avoid timeouts
 */

import { execSync } from 'child_process';

const batches = [
  { weeks: [1, 2], label: 'Weeks 1-2' },
  { weeks: [3, 4], label: 'Weeks 3-4' },
  { weeks: [5, 6], label: 'Weeks 5-6' },
  { weeks: [7], label: 'Week 7' },
];

async function runBatch(batch: typeof batches[0]) {
  const weeksStr = batch.weeks.join(',');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Running ${batch.label}...`);
  console.log(`${'='.repeat(60)}\n`);
  
  try {
    execSync(
      `npx tsx scripts/engineer-features.ts --season 2025 --weeks "${weeksStr}" --featureVersion fe_v1 --sourceWindow pre_kick --noArtifacts`,
      { stdio: 'inherit' }
    );
    console.log(`\n✅ ${batch.label} completed successfully\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${batch.label} failed\n`);
    throw error;
  }
}

async function main() {
  console.log('📦 Set B Feature Engineering (Batched)');
  console.log('Running Weeks 1-7 in smaller batches to avoid timeouts\n');
  
  for (const batch of batches) {
    await runBatch(batch);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ All batches completed!');
  console.log('📄 Generating artifacts for all weeks...');
  console.log(`${'='.repeat(60)}\n`);
  
  // Generate artifacts for all weeks after compute is done
  try {
    execSync(
      `npx tsx scripts/generate-artifacts.ts --season 2025 --weeks "1,2,3,4,5,6,7" --featureVersion fe_v1`,
      { stdio: 'inherit' }
    );
    console.log('\n✅ Artifacts generated\n');
  } catch (error) {
    console.error('\n⚠️  Artifact generation failed (non-fatal)\n');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

