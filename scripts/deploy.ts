import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // For local testing, use a mock USDC address (zero address for simplicity)
  // In production, use the actual USDC token address
  const mockUsdcAddress = "0x0000000000000000000000000000000000000000";

  // Deploy SafeChecker
  console.log("Deploying SafeChecker...");
  const SafeChecker = await ethers.getContractFactory("SafeChecker");
  const safeChecker = await SafeChecker.deploy();
  await safeChecker.waitForDeployment();
  console.log("SafeChecker deployed to:", await safeChecker.getAddress());

  // Deploy PrivilegedMail
  console.log("Deploying PrivilegedMail...");
  const PrivilegedMail = await ethers.getContractFactory("PrivilegedMail");
  const privilegedMail = await PrivilegedMail.deploy(mockUsdcAddress);
  await privilegedMail.waitForDeployment();
  console.log("PrivilegedMail deployed to:", await privilegedMail.getAddress());
  console.log("USDC token address:", await privilegedMail.usdcToken());
  console.log("Send fee (in USDC):", (await privilegedMail.sendFee()).toString());

  // Deploy MailService
  console.log("Deploying MailService...");
  const MailService = await ethers.getContractFactory("MailService");
  const mailService = await MailService.deploy(mockUsdcAddress, await safeChecker.getAddress());
  await mailService.waitForDeployment();
  console.log("MailService deployed to:", await mailService.getAddress());
  console.log("Registration fee (in USDC):", (await mailService.registrationFee()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});