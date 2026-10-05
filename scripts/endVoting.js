/*
 * Ends the election permanently. Results stay readable on-chain.
 *
 * Usage: npm run election:end
 */
const hre = require("hardhat");
const { loadVoting, requirePhase } = require("./lib/election");

async function main() {
  const { voting, phase } = await loadVoting(hre);
  requirePhase(phase, "voting", "Only an open election can be ended.");

  await (await voting.endVoting()).wait();

  const results = await voting.getResults();
  console.log("Voting ended.");
  results.forEach((count, index) => console.log(`  Candidate ${index + 1}: ${count}`));
  console.log(`  Total: ${await voting.getTotalVotes()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exit(1);
  });
