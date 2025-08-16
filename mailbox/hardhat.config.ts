import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
dotenv.config();

const config: import("hardhat/config").HardhatUserConfig = {
  solidity: {
    version: "0.8.20", // must match what you deployed with
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    "flare-testnet-coston2": {
      url: "https://coston2-api.flare.network/ext/C/rpc",
      chainId: 114,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  sourcify: { enabled: false }, // Sourcify doesn’t support chainId 114
  etherscan: {
    // IMPORTANT: use an OBJECT to trigger legacy v1 per-network mode
    apiKey: {
      "flare-testnet-coston2": "empty" // any non-empty placeholder
    },
    customChains: [
      {
        network: "flare-testnet-coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2.testnet.flarescan.com/api",   // Flarescan v1-style API
          browserURL: "https://coston2.testnet.flarescan.com"
        }
      }
    ]
  }
};
export default config;
