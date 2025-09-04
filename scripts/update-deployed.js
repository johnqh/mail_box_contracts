#!/usr/bin/env node

/**
 * Update DEPLOYED.json with new deployment information
 * Usage: node scripts/update-deployed.js <network> <program/contract> <address> [additional-info]
 */

const fs = require('fs');
const path = require('path');

const DEPLOYED_FILE = path.join(__dirname, '../DEPLOYED.json');

function updateDeployedFile(network, contractName, address, additionalInfo = {}) {
  // Read existing DEPLOYED.json
  let deployedData;
  try {
    deployedData = JSON.parse(fs.readFileSync(DEPLOYED_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading DEPLOYED.json:', error.message);
    process.exit(1);
  }

  // Update lastUpdated timestamp
  deployedData.lastUpdated = new Date().toISOString();

  // Get the latest version (v1.5.0 currently)
  const latestVersion = Object.keys(deployedData.versions)[0];
  const versionData = deployedData.versions[latestVersion];

  // Determine if this is EVM or Solana based on network
  const isSolana = network.includes('solana') || network.includes('devnet') || network.includes('mainnet-beta');
  
  if (isSolana) {
    // Handle Solana program deployment
    if (!versionData.networks[network]) {
      versionData.networks[network] = {
        cluster: network.includes('devnet') ? 'devnet' : network.includes('mainnet') ? 'mainnet-beta' : 'localnet',
        rpcUrl: network.includes('devnet') ? 'https://api.devnet.solana.com' : 
                network.includes('mainnet') ? 'https://api.mainnet-beta.solana.com' : 
                'http://127.0.0.1:8899',
        deploymentDate: new Date().toISOString().split('T')[0],
        programs: {},
        deploymentCosts: {},
        wallet: additionalInfo.wallet || {},
        programSettings: {}
      };
    }

    // Update program information
    versionData.networks[network].programs[contractName] = {
      programId: address,
      programDataAddress: additionalInfo.programDataAddress,
      authority: additionalInfo.authority,
      dataLength: additionalInfo.dataLength,
      deploymentSlot: additionalInfo.deploymentSlot,
      status: 'deployed',
      ...additionalInfo
    };

    if (additionalInfo.deploymentCost) {
      versionData.networks[network].deploymentCosts[contractName] = additionalInfo.deploymentCost;
    }

  } else {
    // Handle EVM contract deployment
    if (!versionData.networks[network]) {
      versionData.networks[network] = {
        chainId: additionalInfo.chainId,
        deploymentDate: new Date().toISOString().split('T')[0],
        contracts: {},
        transactions: {},
        contractSettings: {},
        usdc: additionalInfo.usdc || {}
      };
    }

    // Update contract information
    versionData.networks[network].contracts[contractName] = address;
    
    if (additionalInfo.transactionHash) {
      versionData.networks[network].transactions[`${contractName}_deployment`] = additionalInfo.transactionHash;
    }
  }

  // Write updated data back to file
  try {
    fs.writeFileSync(DEPLOYED_FILE, JSON.stringify(deployedData, null, 2));
    console.log(`✅ Updated DEPLOYED.json with ${contractName} deployment:`);
    console.log(`   Network: ${network}`);
    console.log(`   Address/Program ID: ${address}`);
    if (additionalInfo.transactionHash) {
      console.log(`   Transaction: ${additionalInfo.transactionHash}`);
    }
  } catch (error) {
    console.error('Error writing DEPLOYED.json:', error.message);
    process.exit(1);
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: node scripts/update-deployed.js <network> <contract/program> <address> [json-additional-info]');
    console.log('');
    console.log('Examples:');
    console.log('  # EVM deployment');
    console.log('  node scripts/update-deployed.js sepolia Mailer 0x123...abc \'{"chainId": 11155111, "transactionHash": "0x456...def"}\'');
    console.log('');
    console.log('  # Solana deployment'); 
    console.log('  node scripts/update-deployed.js solana-devnet mail_service 99U2sAJ1ESKFk5Jz5WYjBWUzdnNyGUc2KLfpaXs5dqi3 \'{"deploymentSlot": 405475148}\'');
    process.exit(1);
  }

  const [network, contractName, address, additionalInfoJson] = args;
  let additionalInfo = {};
  
  if (additionalInfoJson) {
    try {
      additionalInfo = JSON.parse(additionalInfoJson);
    } catch (error) {
      console.error('Error parsing additional info JSON:', error.message);
      process.exit(1);
    }
  }

  updateDeployedFile(network, contractName, address, additionalInfo);
}

module.exports = { updateDeployedFile };