const express = require("express");
const cors = require("cors");
const snarkjs = require("snarkjs");
const {
  SNARK_FIELD,
  PHASES,
  SIGNAL,
  PUBLIC_SIGNAL_COUNT,
  ApiError
} = require("./constants");
const { createRegistration } = require("./registration");
const { createAdminRouter } = require("./admin");
const { rateLimit, revertReason, createTxQueue } = require("./util");

function parsePublicSignals(publicSignals) {
  if (!Array.isArray(publicSignals) || publicSignals.length !== PUBLIC_SIGNAL_COUNT) {
    throw new ApiError(400, "INVALID_REQUEST", "publicSignals must contain 5 values");
  }

  return publicSignals.map((value) => {
    if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) {
      throw new ApiError(400, "INVALID_REQUEST", "publicSignals must be decimal strings");
    }
    const n = BigInt(value);
    if (n >= SNARK_FIELD) {
      throw new ApiError(400, "INVALID_REQUEST", "publicSignals value out of field range");
    }
    return n;
  });
}

function validateProofShape(proof) {
  const isPair = (v) => Array.isArray(v) && v.length >= 2;
  if (
    !proof ||
    !isPair(proof.pi_a) ||
    !isPair(proof.pi_c) ||
    !Array.isArray(proof.pi_b) ||
    proof.pi_b.length < 2 ||
    !isPair(proof.pi_b[0]) ||
    !isPair(proof.pi_b[1])
  ) {
    throw new ApiError(400, "INVALID_REQUEST", "Malformed proof");
  }
}

// snarkjs proof -> Groth16Verifier calldata (pi_b coordinates swapped for the EVM)
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

function toBytes32(value) {
  return "0x" + value.toString(16).padStart(64, "0");
}

/*
 * chain: { contract, ownerContract?, ownerIssue?, contractAddress, chainId,
 *          electionId, candidateCount, treeDepth? }
 * store: VoterStore; mailer: { send({ to, subject, text }) }
 * admin: { passwordHash, paths: { merkle, voterProofData, adminLog, contractInfo? },
 *          loginLimit?, sessionOptions? } — omit to leave the admin portal off
 */
function createApp({
  chain,
  store,
  mailer,
  vKey,
  electionConfig,
  corsOrigins = [],
  registrationLimit = { windowMs: 10 * 60 * 1000, max: 30 },
  registrationOptions = {},
  admin
}) {
  const app = express();
  const { contract } = chain;

  // credentials: the admin portal's session cookie (only to these origins).
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  const registration = createRegistration({
    store,
    mailer,
    electionName: electionConfig.name || "Election",
    ...registrationOptions
  });

  // Every transaction (votes and admin phase changes) is sent one at a time.
  const enqueue = createTxQueue();

  async function readPhase() {
    return PHASES[Number(await contract.phase())];
  }

  async function requireRegistrationOpen() {
    if ((await readPhase()) !== "registration") {
      throw new ApiError(403, "REGISTRATION_CLOSED", "Voter registration is closed");
    }
  }

  async function readResults() {
    const [results, total] = await Promise.all([contract.getResults(), contract.getTotalVotes()]);
    return {
      electionId: chain.electionId,
      total: total.toString(),
      candidates: electionConfig.candidates.map((candidate, index) => ({
        ...candidate,
        votes: (results[index] ?? 0n).toString()
      }))
    };
  }

  // -------------------------------------------------------------- general

  app.get("/", (req, res) => {
    res.send("ZKP blockchain voting backend is running");
  });

  app.get("/status", (req, res) => {
    res.json({
      status: "running",
      blockchain: "connected",
      contract: chain.contractAddress,
      chainId: chain.chainId
    });
  });

  app.get("/election", async (req, res) => {
    const [phase, merkleRoot] = await Promise.all([readPhase(), contract.merkleRoot()]);

    res.json({
      electionId: chain.electionId,
      name: electionConfig.name,
      description: electionConfig.description,
      candidateCount: chain.candidateCount,
      candidates: electionConfig.candidates,
      phase,
      votingOpen: phase === "voting",
      merkleRoot: merkleRoot.toString(),
      contractAddress: chain.contractAddress,
      chainId: chain.chainId
    });
  });

  app.get("/results", async (req, res) => {
    res.json(await readResults());
  });

  // --------------------------------------------------------- registration

  const limiter = rateLimit(registrationLimit);

  app.post("/registration/request-code", limiter, async (req, res) => {
    await requireRegistrationOpen();
    await registration.requestCode(req.body?.voterId);

    res.json({
      success: true,
      message:
        "If this voter ID is on the electoral roll, a 6-digit code has been sent to " +
        "the email address registered for it. A new code can be requested once a minute."
    });
  });

  app.post("/registration/verify-code", limiter, async (req, res) => {
    await requireRegistrationOpen();
    const result = registration.verifyCode(req.body?.voterId, req.body?.code);
    res.json({ success: true, ...result });
  });

  app.post("/registration/commit", limiter, async (req, res) => {
    await requireRegistrationOpen();
    const result = await registration.commit(req.body?.token, req.body?.commitment);

    res.json({
      success: true,
      ...result,
      message: result.replaced
        ? "Your new credential is registered. The previous one no longer works."
        : "Your credential is registered. Keep it safe — you need it to vote."
    });
  });

  // ---------------------------------------------------------------- voting

  app.post("/vote", async (req, res) => {
    const { proof, publicSignals } = req.body || {};

    validateProofShape(proof);
    const signals = parsePublicSignals(publicSignals);

    // The candidate comes from the proof, never from a separate request field.
    const vote = Number(signals[SIGNAL.vote]);

    if (signals[SIGNAL.electionId].toString() !== chain.electionId) {
      throw new ApiError(400, "WRONG_ELECTION", "Proof is for a different election");
    }
    if (Number(signals[SIGNAL.candidateCount]) !== chain.candidateCount) {
      throw new ApiError(400, "WRONG_ELECTION", "Proof uses a different candidate list");
    }
    if (!Number.isInteger(vote) || vote < 1 || vote > chain.candidateCount) {
      throw new ApiError(400, "INVALID_CANDIDATE", `Candidate must be 1-${chain.candidateCount}`);
    }

    const [phase, merkleRoot] = await Promise.all([readPhase(), contract.merkleRoot()]);

    if (phase !== "voting") {
      throw new ApiError(403, "VOTING_CLOSED", "Voting is not open");
    }
    if (signals[SIGNAL.root] !== merkleRoot) {
      throw new ApiError(
        400,
        "UNKNOWN_ROOT",
        "Proof was generated for an outdated or unknown voter registry"
      );
    }

    // Off-chain check first so invalid proofs never cost gas.
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    if (!isValid) {
      throw new ApiError(400, "INVALID_PROOF", "Invalid proof - ZKP verification failed");
    }

    const nullifier = toBytes32(signals[SIGNAL.nullifierHash]);
    if (await contract.hasVoted(nullifier)) {
      throw new ApiError(409, "DUPLICATE_VOTE", "Duplicate vote - this voter has already voted");
    }

    const { a, b, c } = toSolidityProof(proof);

    const receipt = await enqueue(async () => {
      try {
        // Simulate first to surface revert reasons (e.g. a concurrent duplicate).
        await contract.castVote.staticCall(a, b, c, publicSignals);
        const tx = await contract.castVote(a, b, c, publicSignals);
        return await tx.wait();
      } catch (error) {
        const reason = revertReason(error);
        if (reason.includes("Duplicate vote")) {
          throw new ApiError(409, "DUPLICATE_VOTE", "Duplicate vote - this voter has already voted");
        }
        if (reason) {
          throw new ApiError(400, "VOTE_REJECTED", `Vote rejected by contract: ${reason}`);
        }
        throw error;
      }
    });

    res.json({
      success: true,
      message: "Vote recorded on blockchain successfully",
      candidate: vote,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      results: await readResults()
    });
  });

  // ----------------------------------------------------------------- admin

  if (admin) {
    app.use(
      "/admin",
      createAdminRouter({
        chain,
        store,
        electionConfig,
        enqueue,
        readPhase,
        readResults,
        ...admin
      })
    );
  }

  // Errors: known API errors are returned as-is; anything else is logged and
  // reported generically so internals are not leaked to clients.
  app.use((error, req, res, next) => {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Invalid request body"
      });
    }

    console.error(`Error in ${req.method} ${req.path}:`, error);
    return res.status(500).json({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Internal server error"
    });
  });

  return app;
}

module.exports = { createApp };
