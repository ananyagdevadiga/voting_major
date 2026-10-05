const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");
const { readJson, writeJson } = require("./jsonFile");
const { ElectionError } = require("./errors");

const ROOT_DIR = path.join(__dirname, "../..");

const PATHS = {
  root: ROOT_DIR,
  electionConfig: path.join(ROOT_DIR, "election.config.json"),
  dataDir: path.join(ROOT_DIR, "data"),
  voters: path.join(ROOT_DIR, "data/voters.json"),
  merkle: path.join(ROOT_DIR, "data/merkle.json"),
  buildDir: path.join(ROOT_DIR, "build"),
  circuitsDir: path.join(ROOT_DIR, "circuits"),
  wasm: path.join(ROOT_DIR, "build/main_js/main.wasm"),
  zkey: path.join(ROOT_DIR, "build/vote_final.zkey"),
  vkey: path.join(ROOT_DIR, "build/verification_key.json"),
  clientPublicDir: path.join(ROOT_DIR, "client/public"),
  clientZkDir: path.join(ROOT_DIR, "client/public/zk"),
  voterProofData: path.join(ROOT_DIR, "client/public/voterProofData.json"),
  contractInfo: path.join(ROOT_DIR, "contractAddress.json")
};

// Must match the Phase enum order in contracts/Voting.sol.
const PHASES = ["registration", "registration_closed", "voting", "ended"];

// BN254 scalar field: commitments and roots must be canonical field elements.
const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function loadElectionConfig() {
  const config = readJson(PATHS.electionConfig);
  const candidates = config.candidates || [];

  if (!config.electionId || !/^\d+$/.test(String(config.electionId))) {
    throw new Error("election.config.json: electionId must be a numeric string");
  }
  if (!Number.isInteger(config.treeDepth) || config.treeDepth < 1 || config.treeDepth > 32) {
    throw new Error("election.config.json: treeDepth must be an integer in [1, 32]");
  }
  if (candidates.length < 1 || candidates.length > 255) {
    throw new Error("election.config.json: between 1 and 255 candidates are required");
  }
  candidates.forEach((candidate, index) => {
    if (candidate.id !== index + 1) {
      throw new Error("election.config.json: candidate ids must be 1, 2, 3, ... in order");
    }
  });

  return config;
}

// Secret credentials are text; their UTF-8 bytes are read as one big-endian
// integer. The client (client/src/lib/zk.js) uses exactly the same encoding.
function secretToBigInt(secret) {
  if (!secret) {
    throw new Error("Secret credential is missing");
  }
  return BigInt("0x" + Buffer.from(secret, "utf8").toString("hex"));
}

async function getHasher() {
  const poseidon = await circomlibjs.buildPoseidon();
  const hash = (inputs) => BigInt(poseidon.F.toString(poseidon(inputs)));

  return {
    commitment: (secret) => hash([secretToBigInt(secret)]),
    nullifier: (secret, electionId) =>
      hash([secretToBigInt(secret), BigInt(electionId)]),
    hash
  };
}

// Builds a fixed-depth Poseidon Merkle tree over the commitments, padded with
// zero leaves, and returns the root plus an authentication path per leaf.
function buildMerkleTree(hash, commitments, depth) {
  const size = 2 ** depth;

  if (commitments.length > size) {
    throw new Error(
      `Too many voters (${commitments.length}). Tree depth ${depth} supports ${size}.`
    );
  }

  const leaves = commitments.map((c) => BigInt(c));
  while (leaves.length < size) {
    leaves.push(0n);
  }

  const levels = [leaves];
  for (let level = 0; level < depth; level++) {
    const current = levels[level];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hash([current[i], current[i + 1]]));
    }
    levels.push(next);
  }

  const proofs = commitments.map((_, leafIndex) => {
    const pathElements = [];
    const pathIndices = [];
    let index = leafIndex;

    for (let level = 0; level < depth; level++) {
      const isRight = index % 2;
      pathIndices.push(String(isRight));
      pathElements.push(levels[level][isRight ? index - 1 : index + 1].toString());
      index = Math.floor(index / 2);
    }

    return { pathElements, pathIndices };
  });

  return { root: levels[depth][0].toString(), proofs };
}

/*
 * Builds the voter registry from the roll (data/voters.json). Only voters who
 * registered a commitment become leaves. Returns the root and the public
 * per-voter Merkle paths written to client/public/voterProofData.json —
 * that file holds voter IDs and commitments only, never emails or secrets.
 */
function buildVoterRegistry(hash, voters, { electionId, depth }) {
  const seen = new Set();
  const registered = [];

  for (const voter of voters) {
    if (!voter.voterId) {
      throw new Error(`Invalid voter entry: ${JSON.stringify(voter)}`);
    }
    if ("secretKey" in voter || "secret" in voter) {
      throw new Error(`${voter.voterId}: data/voters.json must not contain secrets`);
    }
    if (!voter.commitment) {
      continue;
    }
    if (seen.has(voter.commitment)) {
      throw new Error(`${voter.voterId}: duplicate commitment`);
    }
    seen.add(voter.commitment);
    registered.push(voter);
  }

  const { root, proofs } = buildMerkleTree(
    hash,
    registered.map((voter) => voter.commitment),
    depth
  );

  return {
    root,
    registeredCount: registered.length,
    voterProofData: {
      electionId: String(electionId),
      root,
      depth,
      voters: registered.map((voter, index) => ({
        voterId: voter.voterId,
        commitment: voter.commitment,
        pathElements: proofs[index].pathElements,
        pathIndices: proofs[index].pathIndices
      }))
    }
  };
}

// Builds the registry from the roll and writes data/merkle.json and
// client/public/voterProofData.json. Used by tree:build, the phase scripts and
// the backend's admin portal (which passes its own roll and paths).
async function publishVoterRegistry({
  voters = readJson(PATHS.voters),
  config = loadElectionConfig(),
  merklePath = PATHS.merkle,
  voterProofDataPath = PATHS.voterProofData
} = {}) {
  const { hash } = await getHasher();

  const registry = buildVoterRegistry(hash, voters, {
    electionId: config.electionId,
    depth: config.treeDepth
  });

  writeJson(merklePath, {
    root: registry.root,
    depth: config.treeDepth,
    voterCount: registry.registeredCount,
    builtAt: new Date().toISOString()
  });
  writeJson(voterProofDataPath, registry.voterProofData);

  return { ...registry, eligibleCount: voters.length, depth: config.treeDepth };
}

/*
 * Returns the registry root to fix on-chain when voting opens. The registry is
 * rebuilt from the roll and must match the one published when registration
 * closed; if the roll changed since (e.g. a reset), the new registry is
 * published instead and nothing is returned, so it can be reviewed first.
 */
async function prepareVotingRoot({
  voters = readJson(PATHS.voters),
  config = loadElectionConfig(),
  merklePath = PATHS.merkle,
  voterProofDataPath = PATHS.voterProofData
} = {}) {
  const { hash } = await getHasher();
  const registry = buildVoterRegistry(hash, voters, {
    electionId: config.electionId,
    depth: config.treeDepth
  });

  if (registry.registeredCount === 0) {
    throw new ElectionError(
      "NO_REGISTERED_VOTERS",
      "No voter has registered a credential; refusing to open voting."
    );
  }

  const published = fs.existsSync(merklePath) ? readJson(merklePath) : null;
  if (published?.root !== registry.root) {
    await publishVoterRegistry({ voters, config, merklePath, voterProofDataPath });
    throw new ElectionError(
      "ROLL_CHANGED",
      (published
        ? "The roll changed after the registry was published."
        : "No voter registry had been published.") +
        " The current registry has been published now — review it, then open voting again."
    );
  }

  return { root: registry.root, registeredCount: registry.registeredCount };
}

// snarkjs proof -> arguments of Groth16Verifier.verifyProof / Voting.castVote.
// pi_b coordinates are swapped for the EVM pairing precompile.
function toSolidityProof(proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ],
    c: [proof.pi_c[0], proof.pi_c[1]]
  };
}

module.exports = {
  PATHS,
  PHASES,
  SNARK_FIELD,
  readJson,
  writeJson,
  loadElectionConfig,
  secretToBigInt,
  getHasher,
  buildMerkleTree,
  buildVoterRegistry,
  publishVoterRegistry,
  prepareVotingRoot,
  toSolidityProof
};
