const fs = require("fs");
const path = require("path");
const express = require("express");
const { ApiError } = require("./constants");
const { createAdminSessions, verifyPassword, requireAdminHeader } = require("./adminAuth");
const { rateLimit, revertReason } = require("./util");
const { ElectionError } = require("../scripts/lib/errors");
const { addVoters, resetVoter } = require("../scripts/lib/roll");
const {
  readJson,
  writeJson,
  publishVoterRegistry,
  prepareVotingRoot
} = require("../scripts/lib/common");

/*
 * Admin portal API (/admin/*): the terminal admin scripts as HTTP endpoints.
 *
 *   GET  /admin/session                      { enabled, authenticated }
 *   POST /admin/login | /admin/logout
 *   GET  /admin/overview                     phase, roll, registry, results
 *   GET  /admin/voters                       the electoral roll
 *   GET  /admin/activity?limit=              recent admin actions (the log)
 *   POST /admin/voters                       { emails: [...] } add to the roll
 *   POST /admin/voters/:voterId/reset        clear a registration
 *   POST /admin/election/close-registration  close + publish the registry
 *   POST /admin/election/open                fix the root on-chain, open voting
 *   POST /admin/election/end                 end the election
 *
 * Each action checks the election phase exactly like the scripts do, and is
 * appended to the admin log. The roll and registry logic is shared with the
 * scripts (scripts/lib), so the two can never drift apart.
 */

const ELECTION_ERROR_STATUS = {
  INVALID_REQUEST: 400,
  INVALID_EMAIL: 400,
  UNKNOWN_VOTER: 404,
  DUPLICATE_EMAIL: 409,
  ROLL_FULL: 409,
  NO_REGISTERED_VOTERS: 409,
  ROLL_CHANGED: 409
};

function toApiError(error) {
  if (error instanceof ElectionError) {
    return new ApiError(ELECTION_ERROR_STATUS[error.code] || 400, error.code, error.message);
  }
  return error;
}

function createAdminRouter({
  chain,
  store,
  electionConfig,
  enqueue,
  readPhase,
  readResults,
  passwordHash,
  paths,
  loginLimit = { windowMs: 15 * 60 * 1000, max: 10 },
  sessionOptions = {}
}) {
  const router = express.Router();
  const sessions = createAdminSessions(sessionOptions);
  const { requireAdmin } = sessions;
  const capacity = 2 ** electionConfig.treeDepth;
  const registryPaths = {
    config: electionConfig,
    merklePath: paths.merkle,
    voterProofDataPath: paths.voterProofData
  };

  function logAction(req, action, details = {}) {
    const entry = { at: new Date().toISOString(), action, ip: req.ip, ...details };
    fs.mkdirSync(path.dirname(paths.adminLog), { recursive: true });
    fs.appendFileSync(paths.adminLog, JSON.stringify(entry) + "\n");
  }

  // The newest `limit` entries, newest first, and how many there are in all.
  function readActivity(limit) {
    if (!fs.existsSync(paths.adminLog)) return { entries: [], total: 0 };
    const lines = fs.readFileSync(paths.adminLog, "utf8").split("\n").filter(Boolean);
    return {
      entries: lines.slice(-limit).reverse().map((line) => JSON.parse(line)),
      total: lines.length
    };
  }

  async function requirePhase(allowed, message) {
    const phase = await readPhase();
    if (!allowed.includes(phase)) {
      throw new ApiError(409, "WRONG_PHASE", message);
    }
  }

  // Phase changes are owner-only on-chain; they go through the same queue as
  // vote transactions so the two never race for a nonce.
  function sendOwnerTx(method, ...args) {
    if (!chain.ownerContract) {
      throw new ApiError(
        503,
        "PHASE_CONTROLS_UNAVAILABLE",
        `Phase changes are unavailable: ${chain.ownerIssue || "no owner account configured"}`
      );
    }

    return enqueue(async () => {
      try {
        await chain.ownerContract[method].staticCall(...args);
        const tx = await chain.ownerContract[method](...args);
        return await tx.wait();
      } catch (error) {
        const reason = revertReason(error);
        if (reason) {
          throw new ApiError(409, "PHASE_CHANGE_REJECTED", `Rejected by the contract: ${reason}`);
        }
        throw error;
      }
    });
  }

  router.use(requireAdminHeader);

  // -------------------------------------------------------------- session

  router.get("/session", (req, res) => {
    res.json({ enabled: Boolean(passwordHash), authenticated: sessions.isValid(req) });
  });

  router.post("/login", rateLimit(loginLimit), async (req, res) => {
    if (!passwordHash) {
      throw new ApiError(
        503,
        "ADMIN_DISABLED",
        "The admin portal is not set up. Run: cd backend && npm run admin:set-password"
      );
    }

    if (!(await verifyPassword(req.body?.password, passwordHash))) {
      logAction(req, "login_failed");
      throw new ApiError(401, "INVALID_PASSWORD", "Incorrect password");
    }

    sessions.start(res);
    logAction(req, "login");
    res.json({ success: true });
  });

  router.post("/logout", (req, res) => {
    sessions.end(req, res);
    res.json({ success: true });
  });

  // ------------------------------------------------------------- overview

  router.get("/overview", requireAdmin, async (req, res) => {
    const [phase, merkleRoot, results] = await Promise.all([
      readPhase(),
      chain.contract.merkleRoot(),
      readResults()
    ]);
    const voters = store.all();
    // data/merkle.json is left over from the previous election until this
    // one closes registration, so it is only shown after that.
    const registry =
      phase !== "registration" && fs.existsSync(paths.merkle) ? readJson(paths.merkle) : null;

    res.json({
      election: {
        electionId: chain.electionId,
        name: electionConfig.name,
        contractAddress: chain.contractAddress,
        chainId: chain.chainId,
        capacity
      },
      phase,
      merkleRoot: merkleRoot.toString(),
      roll: {
        eligible: voters.length,
        registered: voters.filter((voter) => voter.commitment).length
      },
      registry,
      results,
      phaseControls: {
        available: Boolean(chain.ownerContract),
        reason: chain.ownerContract ? null : chain.ownerIssue || "no owner account configured"
      }
    });
  });

  router.get("/voters", requireAdmin, (req, res) => {
    res.json({
      voters: store.all().map((voter) => ({
        voterId: voter.voterId,
        email: voter.email,
        registered: Boolean(voter.commitment),
        registeredAt: voter.registeredAt
      }))
    });
  });

  // ?limit= how many of the newest entries to return (default 20, at most 500).
  router.get("/activity", requireAdmin, (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 500);
    const { entries, total } = readActivity(limit);
    res.json({ activity: entries, total });
  });

  // ----------------------------------------------------------------- roll

  router.post("/voters", requireAdmin, async (req, res) => {
    const emails = req.body?.emails;
    if (!Array.isArray(emails) || emails.length > 1000 || !emails.every((e) => typeof e === "string")) {
      throw new ApiError(400, "INVALID_REQUEST", "emails must be a list of up to 1000 addresses");
    }
    await requirePhase(["registration"], "Voters can only be added while registration is open.");

    let added;
    try {
      added = store.update((voters) => addVoters(voters, emails, { capacity }));
    } catch (error) {
      throw toApiError(error);
    }

    logAction(req, "voters_added", { voterIds: added.map((voter) => voter.voterId) });
    res.json({ success: true, added });
  });

  router.post("/voters/:voterId/reset", requireAdmin, async (req, res) => {
    await requirePhase(
      ["registration", "registration_closed"],
      "Registrations cannot be reset once voting has opened: the voter list is fixed on-chain."
    );

    let result;
    try {
      result = store.update((voters) => resetVoter(voters, req.params.voterId));
    } catch (error) {
      throw toApiError(error);
    }

    if (result.cleared) {
      logAction(req, "voter_reset", { voterId: result.voterId });
    }
    res.json({ success: true, ...result });
  });

  // ---------------------------------------------------------------- phases

  router.post("/election/close-registration", requireAdmin, async (req, res) => {
    await requirePhase(["registration"], "Registration is not open.");
    await sendOwnerTx("closeRegistration");

    const registry = await publishVoterRegistry({ voters: store.all(), ...registryPaths });

    logAction(req, "registration_closed", {
      registered: registry.registeredCount,
      eligible: registry.eligibleCount,
      root: registry.root
    });
    res.json({
      success: true,
      registry: {
        root: registry.root,
        registered: registry.registeredCount,
        eligible: registry.eligibleCount
      }
    });
  });

  router.post("/election/open", requireAdmin, async (req, res) => {
    await requirePhase(["registration_closed"], "Close registration before opening voting.");

    if (chain.treeDepth !== undefined && chain.treeDepth !== electionConfig.treeDepth) {
      throw new ApiError(
        409,
        "CONFIG_MISMATCH",
        `election.config.json treeDepth (${electionConfig.treeDepth}) differs from the deployed election (${chain.treeDepth}). Redeploy.`
      );
    }

    let registry;
    try {
      registry = await prepareVotingRoot({ voters: store.all(), ...registryPaths });
    } catch (error) {
      throw toApiError(error);
    }

    await sendOwnerTx("openVoting", registry.root);

    if (paths.contractInfo && fs.existsSync(paths.contractInfo)) {
      writeJson(paths.contractInfo, { ...readJson(paths.contractInfo), merkleRoot: registry.root });
    }

    logAction(req, "voting_opened", { registered: registry.registeredCount, root: registry.root });
    res.json({ success: true, root: registry.root, registered: registry.registeredCount });
  });

  router.post("/election/end", requireAdmin, async (req, res) => {
    await requirePhase(["voting"], "Only an open election can be ended.");
    await sendOwnerTx("endVoting");

    const results = await readResults();
    logAction(req, "voting_ended", { total: results.total });
    res.json({ success: true, results });
  });

  return router;
}

module.exports = { createAdminRouter };
