console.log('Starting simple test...');

// Test basic functionality
const fs = require('fs');
const path = require('path');

try {
  // Test if we can read the alias file
  const aliasPath = path.join(__dirname, 'apps/jobs/config/team_aliases_cfbd.yml');
  console.log('Alias path:', aliasPath);
  
  if (fs.existsSync(aliasPath)) {
    console.log('Alias file exists');
    const content = fs.readFileSync(aliasPath, 'utf8');
    console.log('Alias file size:', content.length);
  } else {
    console.log('Alias file does not exist');
  }
  
  console.log('Simple test completed');
} catch (error) {
  console.error('Error:', error);
}

