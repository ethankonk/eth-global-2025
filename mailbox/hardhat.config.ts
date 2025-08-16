import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import * as dotenv from 'dotenv';
dotenv.config();

const config: import('hardhat/config').HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    'flare-testnet-coston2': {
      url: 'https://coston2-api.flare.network/ext/C/rpc',
      chainId: 114,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  sourcify: { enabled: false },
  etherscan: {
    apiKey: {
      'flare-testnet-coston2': 'empty',
    },
    customChains: [
      {
        network: 'flare-testnet-coston2',
        chainId: 114,
        urls: {
          apiURL: 'https://coston2.testnet.flarescan.com/api',
          browserURL: 'https://coston2.testnet.flarescan.com',
        },
      },
    ],
  },
};
export default config;
