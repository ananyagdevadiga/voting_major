/*
 * Closes voter registration on-chain (the backend then refuses new
 * registrations) and publishes the voter registry for audit:
 *   client/public/voterProofData.json  voter IDs + commitments + Merkle paths
 *   data/merkle.json                   the root that election:open will fix
 *
 * Usage: npm run election:close-registration
 */
const hre = require("hardhat");
const { publishVoterRegistry } = require("./lib/common");
const { loadVoting, requirePhase } = require("./lib/election");

async function main() {
  const { voting, phase } = await loadVoting(hre);
  requirePhase(phase, "registration", "Registration can only be closed once.");

  await (await voting.closeRegistration()).wait();
  console.log("Registration closed on-chain.");

  const registry = await publishVoterRegistry();

  console.log("\n========== VOTER REGISTRY ==========");
  console.log("Registered :", `${registry.registeredCount} of ${registry.eligibleCount} eligible`);
  console.log("Merkle root:", registry.root);
  console.log("====================================");
  console.log("Published client/public/voterProofData.json for audit.");
  console.log("Anyone can rebuild the tree from it and check the root above.");
  console.log("When the registry has been reviewed: npm run election:open\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exit(1);
  });
