/*
 * Generates a real Groth16 vote proof from the command line (useful for
 * testing the backend without the web client).
 *
 * Usage:
 *   node scripts/generateProof.js <credential> <candidateId>
 *   (<credential> is the one the voter saved at /register)
 *
 * Writes build/proof.json, build/public.json and build/vote-request.json —
 * the latter is the exact body for POST /vote.
 */
const path = require("path");
const snarkjs = require("snarkjs");
const {
  PATHS,
  readJson,
  writeJson,
  loadElectionConfig,
  secretToBigInt,
  getHasher
} = require("./lib/common");

function parseArgs() {
  const [secretKey, candidateArg] = process.argv.slice(2);

  if (!secretKey || !candidateArg) {
    throw new Error("Usage: node scripts/generateProof.js <credential> <candidateId>");
  }

  return { secretKey, candidate: Number(candidateArg) };
}

async function main() {
  const { secretKey, candidate } = parseArgs();
  const config = loadElectionConfig();
  const candidateCount = config.candidates.length;

  if (!Number.isInteger(candidate) || candidate < 1 || candidate > candidateCount) {
    throw new Error(`Candidate must be an integer between 1 and ${candidateCount}`);
  }

  const hasher = await getHasher();
  const proofData = readJson(PATHS.voterProofData);
  const commitment = hasher.commitment(secretKey).toString();
  const voter = proofData.voters.find((v) => v.commitment === commitment);

  if (!voter) {
    throw new Error("This secret key does not belong to any registered voter");
  }

  const input = {
    root: proofData.root,
    nullifierHash: hasher.nullifier(secretKey, config.electionId).toString(),
    electionId: String(config.electionId),
    candidateCount: String(candidateCount),
    vote: String(candidate),
    secret: secretToBigInt(secretKey).toString(),
    pathElements: voter.pathElements,
    pathIndices: voter.pathIndices
  };

  console.log(`Generating proof for ${voter.voterId}, candidate ${candidate}...`);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    PATHS.wasm,
    PATHS.zkey
  );

  const ok = await snarkjs.groth16.verify(readJson(PATHS.vkey), publicSignals, proof);
  if (!ok) {
    throw new Error("Generated proof failed local verification");
  }

  writeJson(path.join(PATHS.buildDir, "proof.json"), proof);
  writeJson(path.join(PATHS.buildDir, "public.json"), publicSignals);
  writeJson(path.join(PATHS.buildDir, "vote-request.json"), { proof, publicSignals });

  console.log("\nProof verified locally.");
  console.log("Public signals [root, nullifierHash, electionId, candidateCount, vote]:");
  console.log(publicSignals);
  console.log("\nSubmit with:");
  console.log(
    '  curl -X POST http://localhost:3000/vote -H "Content-Type: application/json" -d @build/vote-request.json'
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:", error.message);
    process.exit(1);
  });
