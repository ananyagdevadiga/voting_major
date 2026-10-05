/*
 * Fixes the voter registry root on-chain and opens voting. The root can never
 * change after this, so no voter can be added while votes are being cast.
 *
 * The registry is rebuilt from data/voters.json and must match the one
 * published by election:close-registration; if it does not, the new registry
 * is published and nothing is opened, so it can be reviewed again first.
 *
 * Usage: npm run election:open
 */
const hre = require("hardhat");
const { PATHS, writeJson, loadElectionConfig, prepareVotingRoot } = require("./lib/common");
const { loadVoting, requirePhase } = require("./lib/election");

async function main() {
  const config = loadElectionConfig();
  const { info, voting, phase } = await loadVoting(hre);
  requirePhase(phase, "registration_closed", "Run npm run election:close-registration first.");

  if (info.treeDepth !== undefined && info.treeDepth !== config.treeDepth) {
    throw new Error(
      `election.config.json treeDepth (${config.treeDepth}) != deployed (${info.treeDepth}). Redeploy.`
    );
  }

  const registry = await prepareVotingRoot({ config });

  await (await voting.openVoting(registry.root)).wait();
  writeJson(PATHS.contractInfo, { ...info, merkleRoot: registry.root });

  console.log("Voting is open.");
  console.log("Registered voters:", registry.registeredCount);
  console.log("Merkle root (fixed):", registry.root);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exit(1);
  });
