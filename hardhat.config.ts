import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as fs from "fs";

// Load .env first, then .env.local as fallback
dotenv.config();
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: false });
}

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
      url: process.env.ETHEREUM_RPC_URL || "https://eth-mainnet.alchemyapi.io/v2/YOUR_ALCHEMY_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: "auto",
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.alchemyapi.io/v2/YOUR_ALCHEMY_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto",
    },

    // Polygon Networks
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
      gasPrice: "auto",
    },

    // Optimism Networks
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 10,
      gasPrice: "auto",
    },

    // Base Networks
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
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
};

export default config;