/*
 * Prints the on-chain election state.
 *
 * Usage: npm run election:status
 */
const fs = require("fs");
const hre = require("hardhat");
const { PATHS, readJson } = require("./lib/common");
const { loadVoting } = require("./lib/election");

async function main() {
  const { info, voting, phase } = await loadVoting(hre);
  const roll = fs.existsSync(PATHS.voters) ? readJson(PATHS.voters) : [];

  console.log("Contract   :", info.address);
  console.log("Election   :", (await voting.electionId()).toString());
  console.log("Phase      :", phase);
  console.log("Roll       :", `${roll.filter((v) => v.commitment).length} of ${roll.length} registered`);
  console.log("Merkle root:", (await voting.merkleRoot()).toString(), "(0 = not fixed yet)");

  const results = await voting.getResults();
  results.forEach((count, index) => console.log(`Candidate ${index + 1}: ${count}`));
  console.log("Total votes:", (await voting.getTotalVotes()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exit(1);
  });
