import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentInfo {
  network: string;
  chainId: number;
  timestamp: string;
  deployer: string;
  owner: string;
  contracts: {
    usdc: string;
    mailer: string;
    mailService: string;
  };
  fees: {
    sendFee: string;
    registrationFee: string;
    delegationFee: string;
  };
}

async function verifyContract(contractAddress: string, constructorArgs: any[], contractName?: string) {
  try {
    console.log(`🔍 Verifying contract at ${contractAddress}...`);
    
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
      contract: contractName
    });
    
    console.log(`✅ Contract verified successfully!`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ Contract already verified!`);
    } else {
      console.error(`❌ Verification failed:`, error.message);
      throw error;
    }
  }
}

async function main() {
  const networkName = network.name;
  
  console.log("=".repeat(50));
  console.log("CONTRACT VERIFICATION SCRIPT");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);

  // Load deployment info
  const deploymentDir = path.join(__dirname, '..', 'deployments');
  const deploymentFile = path.join(deploymentDir, `${networkName}.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    console.error(`❌ Deployment file not found: ${deploymentFile}`);
    console.error("Please run the deployment script first.");
    process.exit(1);
  }
  
  const deploymentInfo: DeploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
  console.log("Loaded deployment info from:", deploymentFile);
  console.log("-".repeat(50));

  try {
    // Verify MockUSDC if it was deployed (for testnets)
    const testNetworks = ["sepolia", "goerli", "mumbai", "optimism-goerli", "arbitrum-goerli", 
                         "arbitrum-sepolia", "base-goerli", "base-sepolia", "fuji", "bscTestnet", 
                         "fantomTestnet", "zkSyncTestnet", "linea-goerli", "scroll-sepolia", 
                         "mantle-testnet", "chiado", "moonbaseAlpha", "alfajores", "hardhat", "localhost"];
    
    if (testNetworks.includes(networkName) && deploymentInfo.contracts.usdc !== "0x0000000000000000000000000000000000000000") {
      console.log("📝 Verifying MockUSDC...");
      await verifyContract(deploymentInfo.contracts.usdc, [], "contracts/MockUSDC.sol:MockUSDC");
    }

    // Verify Mailer
    console.log("📧 Verifying Mailer...");
    await verifyContract(
      deploymentInfo.contracts.mailer, 
      [deploymentInfo.contracts.usdc, deploymentInfo.owner],
      "contracts/Mailer.sol:Mailer"
    );

    // Verify MailService
    console.log("📬 Verifying MailService...");
    await verifyContract(
      deploymentInfo.contracts.mailService, 
      [deploymentInfo.contracts.usdc, deploymentInfo.owner],
      "contracts/MailService.sol:MailService"
    );

    console.log("=".repeat(50));
    console.log("🎉 ALL CONTRACTS VERIFIED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("Network:", networkName);
    console.log("Mailer:", deploymentInfo.contracts.mailer);
    console.log("MailService:", deploymentInfo.contracts.mailService);
    if (testNetworks.includes(networkName)) {
      console.log("MockUSDC:", deploymentInfo.contracts.usdc);
    }
    console.log("=".repeat(50));

  } catch (error) {
    console.error("❌ Verification failed:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Script execution failed:");
  console.error(error);
  process.exitCode = 1;
});