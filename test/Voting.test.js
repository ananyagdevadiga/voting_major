/*
 * End-to-end tests for the Vote circuit + Groth16Verifier + Voting contract.
 * Requires the circuit artifacts: npm run circuit:build
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const {
  PATHS,
  secretToBigInt,
  getHasher,
  buildMerkleTree,
  toSolidityProof
} = require("../scripts/lib/common");

const TREE_DEPTH = require(PATHS.electionConfig).treeDepth;
const ELECTION_ID = "7";
const CANDIDATE_COUNT = 3;
const SECRETS = ["alice-secret-key", "bob-secret-key", "carol-secret-key"];

describe("Voting (ZKP)", function () {
  let hasher;
  let tree;
  let commitments;

  async function prove(secretIndex, vote, overrides = {}) {
    const secret = SECRETS[secretIndex];
    const input = {
      root: tree.root,
      nullifierHash: hasher.nullifier(secret, ELECTION_ID).toString(),
      electionId: ELECTION_ID,
      candidateCount: String(CANDIDATE_COUNT),
      vote: String(vote),
      secret: secretToBigInt(secret).toString(),
      pathElements: tree.proofs[secretIndex].pathElements,
      pathIndices: tree.proofs[secretIndex].pathIndices,
      ...overrides
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      PATHS.wasm,
      PATHS.zkey
    );
    const { a, b, c } = toSolidityProof(proof);
    return { a, b, c, publicSignals };
  }

  // Deploys and walks the election forward to `phase`.
  async function deploy({ root = tree.root, phase = "voting" } = {}) {
    const [owner, other] = await ethers.getSigners();
    const verifier = await (await ethers.getContractFactory("Groth16Verifier")).deploy();
    const voting = await (await ethers.getContractFactory("Voting")).deploy(
      verifier.address,
      ELECTION_ID,
      CANDIDATE_COUNT
    );
    if (phase !== "registration") {
      await voting.closeRegistration();
    }
    if (phase === "voting" || phase === "ended") {
      await voting.openVoting(root);
    }
    if (phase === "ended") {
      await voting.endVoting();
    }
    return { voting, owner, other };
  }

  before(async function () {
    hasher = await getHasher();
    commitments = SECRETS.map((s) => hasher.commitment(s).toString());
    tree = buildMerkleTree(hasher.hash, commitments, TREE_DEPTH);
  });

  describe("circuit", function () {
    it("exposes no commitment, only [root, nullifier, election, count, vote]", async function () {
      const { publicSignals } = await prove(0, 2);
      expect(publicSignals).to.have.length(5);
      expect(publicSignals).to.not.include(commitments[0]);
      expect(publicSignals[4]).to.equal("2");
    });

    for (const badVote of ["0", "4"]) {
      it(`rejects out-of-range vote ${badVote}`, async function () {
        let failed = false;
        try {
          await prove(0, badVote);
        } catch {
          failed = true;
        }
        expect(failed).to.equal(true);
      });
    }

    it("rejects a secret that is not in the tree", async function () {
      let failed = false;
      try {
        await prove(0, 1, { secret: secretToBigInt("not-registered").toString() });
      } catch {
        failed = true;
      }
      expect(failed).to.equal(true);
    });
  });

  describe("contract", function () {
    it("records a valid vote for the candidate inside the proof", async function () {
      const { voting } = await deploy();
      const { a, b, c, publicSignals } = await prove(0, 2);

      await expect(voting.castVote(a, b, c, publicSignals)).to.not.be.reverted;

      const results = await voting.getResults();
      expect(results.map((r) => r.toNumber())).to.deep.equal([0, 1, 0]);
      expect((await voting.getTotalVotes()).toNumber()).to.equal(1);
    });

    it("rejects a second vote with the same nullifier", async function () {
      const { voting } = await deploy();
      const first = await prove(1, 1);
      await voting.castVote(first.a, first.b, first.c, first.publicSignals);

      const second = await prove(1, 3);
      await expect(
        voting.castVote(second.a, second.b, second.c, second.publicSignals)
      ).to.be.revertedWith("Duplicate vote: Nullifier already used");
    });

    it("rejects a proof whose vote signal was tampered with", async function () {
      const { voting } = await deploy();
      const { a, b, c, publicSignals } = await prove(2, 1);
      const tampered = [...publicSignals];
      tampered[4] = "3";

      await expect(voting.castVote(a, b, c, tampered)).to.be.revertedWith("Invalid proof");
    });

    it("rejects a proof for a different voter tree", async function () {
      const { voting } = await deploy({ root: "12345" });
      const { a, b, c, publicSignals } = await prove(0, 1);

      await expect(voting.castVote(a, b, c, publicSignals)).to.be.revertedWith(
        "Unknown Merkle root"
      );
    });

    for (const phase of ["registration", "registration_closed", "ended"]) {
      it(`rejects votes in the ${phase} phase`, async function () {
        const { voting } = await deploy({ phase });
        const { a, b, c, publicSignals } = await prove(0, 1);

        await expect(voting.castVote(a, b, c, publicSignals)).to.be.revertedWith(
          "Voting is not open"
        );
      });
    }

    it("restricts admin functions to the owner", async function () {
      const { voting, other } = await deploy({ phase: "registration" });

      await expect(voting.connect(other).closeRegistration()).to.be.revertedWith(
        "Only owner can call this"
      );
      await voting.closeRegistration();
      await expect(voting.connect(other).openVoting(tree.root)).to.be.revertedWith(
        "Only owner can call this"
      );
      await voting.openVoting(tree.root);
      await expect(voting.connect(other).endVoting()).to.be.revertedWith(
        "Only owner can call this"
      );
    });
  });

  describe("lifecycle", function () {
    it("starts in registration with no root", async function () {
      const { voting } = await deploy({ phase: "registration" });

      expect(await voting.phase()).to.equal(0);
      expect((await voting.merkleRoot()).toString()).to.equal("0");
    });

    it("cannot open voting or end before registration closes", async function () {
      const { voting } = await deploy({ phase: "registration" });

      await expect(voting.openVoting(tree.root)).to.be.revertedWith("Close registration first");
      await expect(voting.endVoting()).to.be.revertedWith("Voting is not open");
    });

    it("fixes the root once: it cannot change after voting opens", async function () {
      const { voting } = await deploy();

      expect((await voting.merkleRoot()).toString()).to.equal(tree.root);
      await expect(voting.openVoting(1)).to.be.revertedWith("Close registration first");
      await expect(voting.closeRegistration()).to.be.revertedWith("Registration is not open");
      expect((await voting.merkleRoot()).toString()).to.equal(tree.root);
    });

    it("cannot reopen an ended election", async function () {
      const { voting } = await deploy({ phase: "ended" });

      expect(await voting.phase()).to.equal(3);
      await expect(voting.openVoting(tree.root)).to.be.revertedWith("Close registration first");
      await expect(voting.endVoting()).to.be.revertedWith("Voting is not open");
    });

    it("rejects a zero or out-of-field root", async function () {
      const { voting } = await deploy({ phase: "registration_closed" });
      const field =
        "21888242871839275222246405745257275088548364400416034343698204186575808495617";

      await expect(voting.openVoting(0)).to.be.revertedWith("Invalid Merkle root");
      await expect(voting.openVoting(field)).to.be.revertedWith("Invalid Merkle root");
    });
  });
});
