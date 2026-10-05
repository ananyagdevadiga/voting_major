/*
 * Walks through every building block of the system on a throwaway in-memory
 * chain and prints what each check proves. Touches no files, no running node
 * and no running backend.
 *
 *   npm run check
 */
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const crypto = require("crypto");
const {
  PATHS,
  loadElectionConfig,
  secretToBigInt,
  getHasher,
  buildMerkleTree,
  toSolidityProof
} = require("./lib/common");

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const short = (v) => {
  const s = String(v);
  return s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
};

// Same as generateSecret() in client/src/lib/zk.js.
const newSecret = () => crypto.randomBytes(16).toString("base64url");

async function expectRevert(promise, reason) {
  try {
    await promise;
    return false;
  } catch (error) {
    return String(error.message).includes(reason);
  }
}

async function main() {
  const config = loadElectionConfig();
  const electionId = config.electionId;
  const candidateCount = config.candidates.length;
  const depth = config.treeDepth;
  const hasher = await getHasher();
  const vKey = require(PATHS.vkey);

  console.log(
    `Election "${config.name}" (id ${electionId}), ${candidateCount} candidates, ` +
      `tree depth ${depth} (${2 ** depth} voters max)`
  );

  // ------------------------------------------------------------------
  section("1. Secret + commitment (registration)");
  const secrets = [newSecret(), newSecret(), newSecret()];
  const commitments = secrets.map((s) => hasher.commitment(s).toString());
  console.log(`  voter A secret      ${secrets[0]}   (stays in the browser)`);
  console.log(`  voter A commitment  ${short(commitments[0])}   (the only thing the server gets)`);
  check("same secret always gives the same commitment",
    hasher.commitment(secrets[0]).toString() === commitments[0]);
  check("different secrets give different commitments",
    new Set(commitments).size === commitments.length);

  // ------------------------------------------------------------------
  section("2. Merkle tree (voter registry)");
  const tree = buildMerkleTree(hasher.hash, commitments, depth);
  console.log(`  root of ${commitments.length} registered voters: ${short(tree.root)}`);
  check(`each voter gets a ${depth}-step authentication path`,
    tree.proofs.every((p) => p.pathElements.length === depth));
  const rebuilt = buildMerkleTree(hasher.hash, [...commitments.slice(0, 2), commitments[0]], depth);
  check("changing any voter changes the root", rebuilt.root !== tree.root);

  // ------------------------------------------------------------------
  section("3. Nullifier (one vote per voter)");
  const nullA = hasher.nullifier(secrets[0], electionId).toString();
  console.log(`  voter A nullifier   ${short(nullA)}`);
  check("same voter, same election -> same nullifier (so a 2nd vote is detectable)",
    hasher.nullifier(secrets[0], electionId).toString() === nullA);
  check("nullifier differs from the commitment (vote cannot be linked to registration)",
    nullA !== commitments[0]);
  check("different election -> different nullifier",
    hasher.nullifier(secrets[0], String(BigInt(electionId) + 1n)).toString() !== nullA);

  // ------------------------------------------------------------------
  section("4. Zero-knowledge proof (in the browser)");
  async function prove(i, vote, overrides = {}) {
    const input = {
      root: tree.root,
      nullifierHash: hasher.nullifier(secrets[i], electionId).toString(),
      electionId,
      candidateCount: String(candidateCount),
      vote: String(vote),
      secret: secretToBigInt(secrets[i]).toString(),
      pathElements: tree.proofs[i].pathElements,
      pathIndices: tree.proofs[i].pathIndices,
      ...overrides
    };
    return snarkjs.groth16.fullProve(input, PATHS.wasm, PATHS.zkey);
  }
  const canProve = async (...args) => {
    try {
      await prove(...args);
      return true;
    } catch {
      return false;
    }
  };

  const started = Date.now();
  const proofA = await prove(0, 2);
  const proofMs = Date.now() - started;
  console.log(`  public signals: [root, nullifier, electionId, candidateCount, vote]`);
  console.log(`                  [${proofA.publicSignals.map(short).join(", ")}]`);
  console.log(`  proof generated in ${proofMs} ms`);
  check("proof verifies with the verification key",
    await snarkjs.groth16.verify(vKey, proofA.publicSignals, proofA.proof));
  const leaked = proofA.publicSignals.some(
    (s) => s === commitments[0] || s === secretToBigInt(secrets[0]).toString()
  );
  check("proof reveals neither the secret nor the commitment", !leaked);

  const outsider = newSecret();
  check("a secret that never registered cannot make a proof",
    !(await canProve(0, 1, { secret: secretToBigInt(outsider).toString() })));
  check("vote 0 (below range) cannot be proven", !(await canProve(0, 0)));
  check(`vote ${candidateCount + 1} (above range) cannot be proven`,
    !(await canProve(0, candidateCount + 1)));
  check("a wrong nullifier cannot be proven",
    !(await canProve(0, 1, { nullifierHash: hasher.nullifier(secrets[1], electionId).toString() })));

  const tampered = [...proofA.publicSignals];
  tampered[4] = "3";
  check("changing the vote after proving breaks the proof",
    !(await snarkjs.groth16.verify(vKey, tampered, proofA.proof)));

  // ------------------------------------------------------------------
  section("5. Smart contract (on-chain verification + counting)");
  const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
  const voting = await (await ethers.getContractFactory("Voting")).deploy(
    verifier.address,
    electionId,
    candidateCount
  );
  const cast = ({ proof, publicSignals }) => {
    const { a, b, c } = toSolidityProof(proof);
    return voting.castVote(a, b, c, publicSignals);
  };

  check("votes are refused during registration",
    await expectRevert(cast(proofA), "Voting is not open"));
  await (await voting.closeRegistration()).wait();
  await (await voting.openVoting(tree.root)).wait();
  check("root is fixed on-chain when voting opens",
    (await voting.merkleRoot()).toString() === tree.root);
  check("root cannot be changed afterwards",
    await expectRevert(voting.openVoting(tree.root), "Close registration first"));

  const { a, b, c } = toSolidityProof(proofA.proof);
  check("a proof whose vote was changed (2 -> 3) is rejected on-chain",
    await expectRevert(voting.castVote(a, b, c, tampered), "Invalid proof"));

  const receipt = await (await cast(proofA)).wait();
  console.log(`  voter A voted for candidate 2 in block ${receipt.blockNumber}`);
  check("valid vote is counted for the candidate inside the proof",
    (await voting.getVotes(2)).toString() === "1");

  const proofA2 = await prove(0, 1);
  check("voter A voting again (even for another candidate) is rejected",
    await expectRevert(cast(proofA2), "Duplicate vote"));

  await (await cast(await prove(1, 1))).wait();
  await (await cast(await prove(2, 2))).wait();
  const results = (await voting.getResults()).map((v) => v.toString());
  console.log(`  results: ${results.map((v, i) => `${config.candidates[i].name}=${v}`).join(", ")}`);
  check("results match the votes cast (1, 2, 0) and total = 3",
    results.join(",") === "1,2,0" && (await voting.totalVotes()).toString() === "3");

  await (await voting.endVoting()).wait();
  check("votes are refused after the election ends",
    await expectRevert(cast(await prove(1, 3)), "Voting is not open"));

  // ------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

// snarkjs leaves worker threads running, so exit explicitly.
main()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
