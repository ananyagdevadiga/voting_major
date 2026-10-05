/*
 * Recomputes every voter's Merkle path in client/public/voterProofData.json
 * and checks it against the root in data/merkle.json.
 */
const { PATHS, readJson, getHasher } = require("./lib/common");

async function main() {
  const { hash } = await getHasher();
  const merkle = readJson(PATHS.merkle);
  const proofData = readJson(PATHS.voterProofData);

  if (proofData.root !== merkle.root) {
    throw new Error(
      "voterProofData.json root does not match data/merkle.json. Run: npm run tree:build"
    );
  }

  let valid = 0;

  for (const voter of proofData.voters) {
    let node = BigInt(voter.commitment);

    voter.pathElements.forEach((sibling, level) => {
      node =
        voter.pathIndices[level] === "0"
          ? hash([node, BigInt(sibling)])
          : hash([BigInt(sibling), node]);
    });

    if (node.toString() === merkle.root) {
      valid++;
      console.log(`OK       ${voter.voterId}`);
    } else {
      console.log(`INVALID  ${voter.voterId}`);
    }
  }

  console.log(`\nValid Merkle paths: ${valid}/${proofData.voters.length}`);
  if (valid !== proofData.voters.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
