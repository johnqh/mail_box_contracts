import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // For local testing, use a mock USDC address (zero address for simplicity)
  // In production, use the actual USDC token address
  const mockUsdcAddress = "0x0000000000000000000000000000000000000000";

  const PrivilegedMail = await ethers.getContractFactory("PrivilegedMail");
  const privilegedMail = await PrivilegedMail.deploy(mockUsdcAddress);

  await privilegedMail.waitForDeployment();

  console.log("PrivilegedMail deployed to:", await privilegedMail.getAddress());
  console.log("USDC token address:", await privilegedMail.usdcToken());
  console.log("Send fee (in USDC):", (await privilegedMail.SEND_FEE()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});