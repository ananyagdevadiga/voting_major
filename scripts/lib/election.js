// Hardhat-side helpers shared by the election phase scripts.
const fs = require("fs");
const { PATHS, PHASES, readJson } = require("./common");

async function loadVoting(hre) {
  if (!fs.existsSync(PATHS.contractInfo)) {
    throw new Error("contractAddress.json not found. Deploy first: npm run deploy");
  }
  const info = readJson(PATHS.contractInfo);

  if ((await hre.ethers.provider.getCode(info.address)) === "0x") {
    throw new Error(`No contract at ${info.address}. Was the node restarted? Run: npm run deploy`);
  }

  const voting = await hre.ethers.getContractAt("Voting", info.address);
  const phase = PHASES[await voting.phase()];
  return { info, voting, phase };
}

function requirePhase(phase, expected, hint) {
  if (phase !== expected) {
    throw new Error(`Election is in phase "${phase}", expected "${expected}". ${hint}`);
  }
}

module.exports = { loadVoting, requirePhase };
