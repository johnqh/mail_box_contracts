import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",  // Use latest for better optimization
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,  // Optimize for deployment size (not runtime gas)
      },
      viaIR: true,  // Enable IR-based optimization (can reduce size by 5-15%)
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    // L2 Networks (Cheap Deployment Options)
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 137,
      // Deployment cost: ~$1-4
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 8453,
      // Deployment cost: ~$5-17
    },
    optimism: {
      url: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 10,
      // Deployment cost: ~$5-17
    },
    // Testnet Networks (FREE)
    polygonMumbai: {
      url: process.env.POLYGON_MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 80001,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 84532,
    },
    // Mainnet (Expensive - Use Only If Necessary)
    mainnet: {
      url: process.env.MAINNET_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: (process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY) ? [process.env.EVM_PRIVATE_KEY || process.env.PRIVATE_KEY!] : [],
      chainId: 1,
      // Deployment cost: ~$412-1,675 (depends on gas)
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
    externalArtifacts: ["externalArtifacts/*.json"],
  },
  paths: {
    sources: "./contracts",
    tests: "./test/evm",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;