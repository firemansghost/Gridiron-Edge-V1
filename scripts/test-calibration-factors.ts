import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const configPath = path.join(__dirname, '../apps/jobs/config/model-weights.yml');

async function testCalibrationFactors() {
  const factors = [6.5, 8.0, 10.0, 12.0];
  const results: Array<{ factor: number; r2: number; rmse: number; beta1: number }> = [];
  
  console.log('\n🔬 Testing Calibration Factors\n');
  console.log('='.repeat(70));
  
  for (const factor of factors) {
    console.log(`\n📊 Testing calibration_factor: ${factor}`);
    
    // Read current config
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(configContent) as any;
    
    // Update calibration factor
    config.v1.calibration_factor = factor;
    
    // Write back
    fs.writeFileSync(configPath, yaml.dump(config));
    
    console.log(`   ✅ Updated model-weights.yml`);
    console.log(`   🔨 Rebuilding jobs...`);
    
    // Rebuild
    const { execSync } = require('child_process');
    execSync('npm run build:jobs', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    
    console.log(`   📊 Re-computing 2025 ratings...`);
    execSync(`node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season=2025`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    
    console.log(`   🎯 Running calibration...`);
    const output = execSync('npm run calibrate:ridge 2025 1-11', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8'
    });
    
    // Parse R² and RMSE from output
    const r2Match = output.match(/R²:\s+([\d.]+)%/);
    const rmseMatch = output.match(/RMSE:\s+([\d.]+)\s+points/);
    const beta1Match = output.match(/β₁ \(rating_diff\):\s+([-\d.]+)/);
    
    const r2 = r2Match ? parseFloat(r2Match[1]) : 0;
    const rmse = rmseMatch ? parseFloat(rmseMatch[1]) : 999;
    const beta1 = beta1Match ? parseFloat(beta1Match[1]) : 0;
    
    results.push({ factor, r2, rmse, beta1 });
    
    console.log(`   📈 Results: R²=${r2.toFixed(2)}%, RMSE=${rmse.toFixed(2)}pts, β₁=${beta1.toFixed(4)}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 SUMMARY: Calibration Factor Comparison\n');
  console.log('Factor | R² (%) | RMSE (pts) | β₁ (rating_diff)');
  console.log('-'.repeat(50));
  results.forEach(r => {
    console.log(`${r.factor.toString().padStart(6)} | ${r.r2.toFixed(2).padStart(6)} | ${r.rmse.toFixed(2).padStart(10)} | ${r.beta1.toFixed(4).padStart(14)}`);
  });
  
  // Find best
  const best = results.reduce((best, curr) => curr.r2 > best.r2 ? curr : best);
  console.log(`\n🏆 Best: calibration_factor=${best.factor} (R²=${best.r2.toFixed(2)}%, RMSE=${best.rmse.toFixed(2)}pts)`);
  
  // Restore to best factor
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = yaml.load(configContent) as any;
  config.v1.calibration_factor = best.factor;
  fs.writeFileSync(configPath, yaml.dump(config));
  
  console.log(`\n✅ Restored model-weights.yml to best factor: ${best.factor}`);
}

testCalibrationFactors().catch(console.error);

