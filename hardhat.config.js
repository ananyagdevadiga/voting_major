require("dotenv").config();
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const networks = {
  hardhat: {
    chainId: 31337,
  },
  localhost: {
    url: process.env.LOCALHOST_RPC_URL || "http://127.0.0.1:8545",
  },
};

// Any other EVM network: set DEPLOY_RPC_URL and DEPLOYER_PRIVATE_KEY in .env,
// then use `--network remote`.
if (process.env.DEPLOY_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) {
  networks.remote = {
    url: process.env.DEPLOY_RPC_URL,
    accounts: [process.env.DEPLOYER_PRIVATE_KEY],
  };
}

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
  mocha: {
    // Proof generation in tests takes a few seconds.
    timeout: 120000,
  },
};
