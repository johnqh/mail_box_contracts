import hre from "hardhat";
import { formatUnits } from "viem";
const { ethers, upgrades, network } = hre;

/**
 * Script to upgrade the Mailer contract to a new implementation
 *
 * Usage:
 *   PROXY_ADDRESS=0x... npx hardhat run scripts/evm/upgrade.ts --network <network>
 *
 * This script:
 * 1. Loads the existing proxy address
 * 2. Deploys the new implementation
 * 3. Upgrades the proxy to point to the new implementation
 * 4. Verifies the upgrade succeeded and state is preserved
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("=".repeat(50));
  console.log("MAILER CONTRACT UPGRADE SCRIPT");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);
  console.log("Upgrading with account:", deployer.address);

  // Get proxy address from environment or deployment file
  let proxyAddress = process.env.PROXY_ADDRESS;

  if (!proxyAddress) {
    // Try to read from deployment file
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const deploymentFile = path.join(__dirname, '..', '..', 'deployments', `${networkName}-upgradeable.json`);

      if (fs.existsSync(deploymentFile)) {
        const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));
        proxyAddress = deployment.contracts.mailerProxy;
        console.log("Loaded proxy address from deployment file:", proxyAddress);
      }
    } catch (error) {
      // Ignore file read errors
    }
  }

  if (!proxyAddress) {
    console.error("❌ Proxy address not found!");
    console.error("Please provide PROXY_ADDRESS environment variable or ensure deployment file exists.");
    console.error("Example: PROXY_ADDRESS=0x... npx hardhat run scripts/evm/upgrade.ts --network sepolia");
    process.exit(1);
  }

  console.log("Proxy address:", proxyAddress);
  console.log("-".repeat(50));

  try {
    // Get current implementation address before upgrade
    const currentImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("Current implementation:", currentImplementation);

    // Get current contract state to verify it's preserved
    const MailerFactory = await ethers.getContractFactory("Mailer");
    const mailerBefore = MailerFactory.attach(proxyAddress);

    const usdcBefore = await mailerBefore.usdcToken();
    const sendFeeBefore = await mailerBefore.sendFee();
    const ownerBefore = await mailerBefore.owner();

    console.log("\n📊 Current contract state:");
    console.log("   - USDC Token:", usdcBefore);
    console.log("   - Send Fee:", formatUnits(sendFeeBefore, 6), "USDC");
    console.log("   - Owner:", ownerBefore);
    console.log("-".repeat(50));

    // Deploy new implementation and upgrade
    console.log("📧 Upgrading Mailer to new implementation...");
    const MailerV2 = await ethers.getContractFactory("Mailer");

    const upgraded = await upgrades.upgradeProxy(proxyAddress, MailerV2, {
      kind: 'uups'
    });
    await upgraded.waitForDeployment();

    const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("✅ Upgrade successful!");
    console.log("   New implementation:", newImplementation);

    // Verify state is preserved
    console.log("\n🔍 Verifying state preservation...");
    const usdcAfter = await upgraded.usdcToken();
    const sendFeeAfter = await upgraded.sendFee();
    const ownerAfter = await upgraded.owner();

    console.log("   - USDC Token:", usdcAfter, usdcAfter === usdcBefore ? "✅" : "❌");
    console.log("   - Send Fee:", formatUnits(sendFeeAfter, 6), "USDC", sendFeeAfter === sendFeeBefore ? "✅" : "❌");
    console.log("   - Owner:", ownerAfter, ownerAfter === ownerBefore ? "✅" : "❌");

    if (usdcAfter !== usdcBefore || sendFeeAfter !== sendFeeBefore || ownerAfter !== ownerBefore) {
      console.error("❌ State verification failed! Some values were not preserved.");
      process.exit(1);
    }

    console.log("=".repeat(50));
    console.log("🎉 UPGRADE COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("Network:", networkName);
    console.log("Proxy address:", proxyAddress);
    console.log("Old implementation:", currentImplementation);
    console.log("New implementation:", newImplementation);
    console.log("=".repeat(50));

    // Update deployment info file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const deploymentDir = path.join(__dirname, '..', '..', 'deployments');
    const deploymentFile = path.join(deploymentDir, `${networkName}-upgradeable.json`);

    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf-8'));

      // Add upgrade history
      if (!deployment.upgrades) {
        deployment.upgrades = [];
      }
      deployment.upgrades.push({
        timestamp: new Date().toISOString(),
        upgrader: deployer.address,
        oldImplementation: currentImplementation,
        newImplementation: newImplementation
      });

      // Update current implementation
      deployment.contracts.mailerImplementation = newImplementation;
      deployment.lastUpgrade = new Date().toISOString();

      fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
      console.log("📄 Deployment info updated:", deploymentFile);
    }

  } catch (error) {
    console.error("❌ Upgrade failed:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Script execution failed:");
  console.error(error);
  process.exitCode = 1;
});
