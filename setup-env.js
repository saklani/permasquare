#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

try {
  // Read the arweave.json file
  const walletPath = path.join(process.cwd(), 'arweave.json');
  
  if (!fs.existsSync(walletPath)) {
    console.error('❌ arweave.json file not found in current directory');
    process.exit(1);
  }
  
  const walletData = fs.readFileSync(walletPath, 'utf8');
  
  // Validate it's valid JSON
  JSON.parse(walletData);
  
  // Output the environment variable format
  console.log('✅ Found arweave.json file');
  console.log('\n📋 Add this to your .env file:');
  console.log('ARWEAVE_KEY_JSON=\'' + walletData.replace(/\n/g, '') + '\'');
  
  console.log('\n🔒 For production deployment, set this environment variable:');
  console.log('export ARWEAVE_KEY_JSON=\'' + walletData.replace(/\n/g, '') + '\'');
  
  console.log('\n🗑️  After setting the environment variable, you can safely delete arweave.json');
  
} catch (error) {
  console.error('❌ Error reading arweave.json:', error.message);
  process.exit(1);
} 