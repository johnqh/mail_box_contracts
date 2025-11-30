import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
import * as fs from "fs";

// Load .env first, then .env.local with higher priority (overrides .env)
dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}

// Build Alchemy URLs using ALCHEMY_API_KEY
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const getAlchemyUrl = (network: string) =>
  ALCHEMY_API_KEY ? `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    
    // Ethereum Networks
    mainnet: {
      url: process.env.MAINNET_RPC_URL || getAlchemyUrl("eth-mainnet") || "https://ethereum-rpc.publicnode.com",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 1,
      gasPrice: "auto",
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || getAlchemyUrl("eth-sepolia") || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 11155111,
      gasPrice: "auto",
    },

    // Polygon Networks
    polygon: {
      url: process.env.POLYGON_RPC_URL || getAlchemyUrl("polygon-mainnet") || "https://polygon-rpc.com",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 137,
      gasPrice: "auto",
    },

    // Optimism Networks
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || getAlchemyUrl("opt-mainnet") || "https://mainnet.optimism.io",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 10,
      gasPrice: "auto",
    },

    // Base Networks
    base: {
      url: process.env.BASE_RPC_URL || getAlchemyUrl("base-mainnet") || "https://mainnet.base.org",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 8453,
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_MULTICHAIN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_MULTICHAIN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.ETHERSCAN_MULTICHAIN_API_KEY || process.env.POLYGONSCAN_API_KEY || "",
      optimisticEthereum: process.env.ETHERSCAN_MULTICHAIN_API_KEY || process.env.OPTIMISTIC_ETHERSCAN_API_KEY || "",
      base: process.env.ETHERSCAN_MULTICHAIN_API_KEY || process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6", // Keep ethers target for now since viem can use these types
  },
};

export default config;