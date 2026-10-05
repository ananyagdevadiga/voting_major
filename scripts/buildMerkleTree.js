/*
 * Builds the voter Merkle tree from the registered commitments in
 * data/voters.json and writes:
 *   data/merkle.json                   root + depth
 *   client/public/voterProofData.json  public per-voter Merkle paths
 *
 * voterProofData.json deliberately contains NO emails, secrets or nullifiers:
 * the nullifier is derived in the browser from the voter's secret, so it
 * cannot be linked back to a voter ID.
 *
 * The phase scripts (election:close-registration / election:open) run this
 * automatically; use it directly to preview the registry.
 */
const { publishVoterRegistry } = require("./lib/common");

async function main() {
  const registry = await publishVoterRegistry();

  console.log("\n========== MERKLE TREE ==========");
  console.log("Tree depth :", registry.depth);
  console.log("Capacity   :", 2 ** registry.depth);
  console.log("Registered :", `${registry.registeredCount} of ${registry.eligibleCount} eligible`);
  console.log("Merkle root:", registry.root);
  console.log("=================================");
  console.log("Wrote data/merkle.json and client/public/voterProofData.json\n");
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
