/*
 * Backend API tests: registration (codes, tokens, commitments, rate limits),
 * the election lifecycle, an end-to-end vote with real proofs, and the core
 * privacy property — the server never stores or emails a voter's secret.
 *
 * The real Express app talks to the Voting contract on the in-process Hardhat
 * chain (via the backend's ethers v6); voters.json lives in a temp directory
 * and emails are captured in memory.
 * Requires the circuit artifacts: npm run circuit:build
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const hre = require("hardhat");
const snarkjs = require("snarkjs");
const ethers6 = require("../backend/node_modules/ethers");
const { createApp } = require("../backend/app");
const { VoterStore } = require("../backend/voterStore");
const { hashPassword } = require("../backend/adminAuth");
const {
  PATHS,
  SNARK_FIELD,
  readJson,
  secretToBigInt,
  getHasher,
  buildVoterRegistry
} = require("../scripts/lib/common");

const TREE_DEPTH = readJson(PATHS.electionConfig).treeDepth;
const ELECTION = {
  electionId: "11",
  name: "Test Election",
  treeDepth: TREE_DEPTH,
  candidates: [
    { id: 1, name: "A" },
    { id: 2, name: "B" },
    { id: 3, name: "C" }
  ]
};
const ROLL = [
  { voterId: "VOTER-0001", email: "alice@example.com", commitment: null, registeredAt: null },
  { voterId: "VOTER-0002", email: "bob@example.com", commitment: null, registeredAt: null }
];

// Same format the browser produces (client/src/lib/zk.js generateSecret).
const newSecret = () => crypto.randomBytes(16).toString("base64url");

const ADMIN_PASSWORD = "correct horse battery staple";

describe("Backend API", function () {
  let hasher;
  let adminPasswordHash;
  let ctx;

  async function setup({ registrationLimit, registrationOptions, admin = {}, withOwner = true } = {}) {
    const [owner, relayer] = await hre.ethers.getSigners();
    const verifier = await (await hre.ethers.getContractFactory("Groth16Verifier")).deploy();
    const voting = await (await hre.ethers.getContractFactory("Voting")).deploy(
      verifier.address,
      ELECTION.electionId,
      ELECTION.candidates.length
    );

    const { abi } = await hre.artifacts.readArtifact("Voting");
    const provider = new ethers6.BrowserProvider(hre.network.provider, undefined, {
      pollingInterval: 50
    });
    const contract = new ethers6.Contract(
      voting.address,
      abi,
      await provider.getSigner(relayer.address)
    );

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "securevote-"));
    const store = new VoterStore(path.join(dir, "voters.json"));
    store.update((voters) => voters.push(...ROLL.map((v) => ({ ...v }))));

    // Phase changes from the admin portal are signed by the contract owner.
    const ownerContract = withOwner
      ? new ethers6.Contract(voting.address, abi, await provider.getSigner(owner.address))
      : null;

    const mails = [];
    const app = createApp({
      chain: {
        contract,
        ownerContract,
        ownerIssue: withOwner ? null : "OWNER_PRIVATE_KEY is not set in backend/.env",
        contractAddress: voting.address,
        chainId: "31337",
        electionId: ELECTION.electionId,
        candidateCount: ELECTION.candidates.length,
        treeDepth: TREE_DEPTH
      },
      store,
      mailer: { send: async (mail) => mails.push(mail) },
      vKey: readJson(PATHS.vkey),
      electionConfig: ELECTION,
      registrationLimit: registrationLimit || { windowMs: 60000, max: 1000 },
      registrationOptions: { codeCooldownMs: 0, ...registrationOptions },
      admin: {
        passwordHash: adminPasswordHash,
        paths: {
          merkle: path.join(dir, "merkle.json"),
          voterProofData: path.join(dir, "voterProofData.json"),
          adminLog: path.join(dir, "admin-log.jsonl")
        },
        ...admin
      }
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const url = `http://127.0.0.1:${server.address().port}`;

    let cookie = ""; // the admin session, like a browser's cookie jar
    const call = async (method, route, body, headers = {}) => {
      const response = await fetch(url + route, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie && { Cookie: cookie }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      return { status: response.status, body: await response.json() };
    };

    ctx = {
      voting,
      store,
      mails,
      dir,
      get: (route) => call("GET", route),
      post: (route, body) => call("POST", route, body),
      // Admin portal requests carry the header the real client sends.
      admin: (route, body) => call("POST", route, body, { "X-SecureVote-Admin": "1" }),
      login: () => call("POST", "/admin/login", { password: ADMIN_PASSWORD }, { "X-SecureVote-Admin": "1" }),
      close: () => {
        server.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    return ctx;
  }

  function lastCode(mails, email) {
    const mail = [...mails].reverse().find((m) => m.to === email && /code/.test(m.subject));
    return mail.text.match(/is: (\d{6})/)[1];
  }

  async function getToken(voterId, email) {
    const requested = await ctx.post("/registration/request-code", { voterId });
    expect(requested.status).to.equal(200);
    const verified = await ctx.post("/registration/verify-code", {
      voterId,
      code: lastCode(ctx.mails, email)
    });
    expect(verified.status).to.equal(200);
    return verified.body;
  }

  async function register(voterId, email, secret) {
    const { token } = await getToken(voterId, email);
    return ctx.post("/registration/commit", {
      token,
      commitment: hasher.commitment(secret).toString()
    });
  }

  async function proveVote(registry, secret, vote) {
    const commitment = hasher.commitment(secret).toString();
    const voter = registry.voterProofData.voters.find((v) => v.commitment === commitment);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      {
        root: registry.root,
        nullifierHash: hasher.nullifier(secret, ELECTION.electionId).toString(),
        electionId: ELECTION.electionId,
        candidateCount: String(ELECTION.candidates.length),
        vote: String(vote),
        secret: secretToBigInt(secret).toString(),
        pathElements: voter.pathElements,
        pathIndices: voter.pathIndices
      },
      PATHS.wasm,
      PATHS.zkey
    );
    return { proof, publicSignals };
  }

  before(async function () {
    hasher = await getHasher();
    adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
  });

  afterEach(function () {
    ctx?.close();
    ctx = null;
  });

  describe("registration", function () {
    it("emails a code only to the address on the roll and answers unknown IDs identically", async function () {
      await setup();

      const known = await ctx.post("/registration/request-code", { voterId: "voter-0001" });
      const unknown = await ctx.post("/registration/request-code", { voterId: "VOTER-9999" });

      expect(known.status).to.equal(200);
      expect(unknown.status).to.equal(200);
      expect(unknown.body).to.deep.equal(known.body);
      expect(ctx.mails).to.have.length(1);
      expect(ctx.mails[0].to).to.equal("alice@example.com");
      expect(ctx.mails[0].text).to.match(/is: \d{6}/);
    });

    it("does not resend a code within the cooldown", async function () {
      await setup({ registrationOptions: { codeCooldownMs: 60000 } });

      await ctx.post("/registration/request-code", { voterId: "VOTER-0001" });
      await ctx.post("/registration/request-code", { voterId: "VOTER-0001" });

      expect(ctx.mails).to.have.length(1);
    });

    it("stores only the commitment, notifies the voter, and makes the token single-use", async function () {
      await setup();
      const secret = newSecret();
      const commitment = hasher.commitment(secret).toString();

      const { token, alreadyRegistered } = await getToken("VOTER-0001", "alice@example.com");
      expect(alreadyRegistered).to.equal(false);

      const committed = await ctx.post("/registration/commit", { token, commitment });
      expect(committed.status).to.equal(200);
      expect(committed.body.replaced).to.equal(false);

      const stored = ctx.store.find("VOTER-0001");
      expect(stored.commitment).to.equal(commitment);
      expect(stored.registeredAt).to.be.a("string");
      expect(Object.keys(stored).sort()).to.deep.equal(
        ["commitment", "email", "registeredAt", "voterId"]
      );

      const notice = ctx.mails[ctx.mails.length - 1];
      expect(notice.to).to.equal("alice@example.com");
      expect(notice.subject).to.match(/registered/);

      const reused = await ctx.post("/registration/commit", { token, commitment });
      expect(reused.status).to.equal(401);
      expect(reused.body.code).to.equal("INVALID_TOKEN");
    });

    it("rejects wrong codes and invalidates the code after too many attempts", async function () {
      await setup();
      await ctx.post("/registration/request-code", { voterId: "VOTER-0001" });
      const code = lastCode(ctx.mails, "alice@example.com");
      const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");

      for (let i = 0; i < 4; i++) {
        const r = await ctx.post("/registration/verify-code", { voterId: "VOTER-0001", code: wrong });
        expect(r.status).to.equal(400);
        expect(r.body.code).to.equal("INVALID_CODE");
      }
      const locked = await ctx.post("/registration/verify-code", { voterId: "VOTER-0001", code: wrong });
      expect(locked.status).to.equal(429);
      expect(locked.body.code).to.equal("TOO_MANY_ATTEMPTS");

      const tooLate = await ctx.post("/registration/verify-code", { voterId: "VOTER-0001", code });
      expect(tooLate.status).to.equal(400);
      expect(tooLate.body.code).to.equal("INVALID_CODE");
    });

    it("rejects out-of-range and duplicate commitments without consuming the token", async function () {
      await setup();
      const aliceSecret = newSecret();
      expect((await register("VOTER-0001", "alice@example.com", aliceSecret)).status).to.equal(200);

      const { token } = await getToken("VOTER-0002", "bob@example.com");

      for (const commitment of ["0", SNARK_FIELD.toString(), "12ab", 5]) {
        const r = await ctx.post("/registration/commit", { token, commitment });
        expect(r.status).to.equal(400);
        expect(r.body.code).to.equal("INVALID_COMMITMENT");
      }

      const duplicate = await ctx.post("/registration/commit", {
        token,
        commitment: hasher.commitment(aliceSecret).toString()
      });
      expect(duplicate.status).to.equal(409);
      expect(duplicate.body.code).to.equal("DUPLICATE_COMMITMENT");

      const ok = await ctx.post("/registration/commit", {
        token,
        commitment: hasher.commitment(newSecret()).toString()
      });
      expect(ok.status).to.equal(200);
    });

    it("lets a voter re-register, replacing the old commitment", async function () {
      await setup();
      await register("VOTER-0001", "alice@example.com", newSecret());

      const secondSecret = newSecret();
      const { token, alreadyRegistered } = await getToken("VOTER-0001", "alice@example.com");
      expect(alreadyRegistered).to.equal(true);

      const r = await ctx.post("/registration/commit", {
        token,
        commitment: hasher.commitment(secondSecret).toString()
      });
      expect(r.body.replaced).to.equal(true);
      expect(ctx.store.find("VOTER-0001").commitment).to.equal(
        hasher.commitment(secondSecret).toString()
      );
      expect(ctx.mails[ctx.mails.length - 1].subject).to.match(/replaced/);
    });

    it("refuses every registration step once registration is closed", async function () {
      await setup();
      const { token } = await getToken("VOTER-0001", "alice@example.com");
      const mailsBefore = ctx.mails.length;

      await ctx.voting.closeRegistration();

      for (const [route, body] of [
        ["/registration/request-code", { voterId: "VOTER-0002" }],
        ["/registration/verify-code", { voterId: "VOTER-0002", code: "123456" }],
        ["/registration/commit", { token, commitment: hasher.commitment(newSecret()).toString() }]
      ]) {
        const r = await ctx.post(route, body);
        expect(r.status).to.equal(403);
        expect(r.body.code).to.equal("REGISTRATION_CLOSED");
      }
      expect(ctx.mails).to.have.length(mailsBefore);
      expect(ctx.store.find("VOTER-0001").commitment).to.equal(null);
    });

    it("rate-limits registration requests per client", async function () {
      await setup({ registrationLimit: { windowMs: 60000, max: 2 } });

      await ctx.post("/registration/request-code", { voterId: "VOTER-0001" });
      await ctx.post("/registration/request-code", { voterId: "VOTER-0002" });
      const third = await ctx.post("/registration/request-code", { voterId: "VOTER-0001" });

      expect(third.status).to.equal(429);
      expect(third.body.code).to.equal("RATE_LIMITED");
    });
  });

  describe("end to end", function () {
    it("register → close → open → vote, and the server never holds a secret", async function () {
      await setup();
      const alice = newSecret();
      const bob = newSecret();

      expect((await register("VOTER-0001", "alice@example.com", alice)).status).to.equal(200);
      expect((await register("VOTER-0002", "bob@example.com", bob)).status).to.equal(200);
      expect((await ctx.get("/election")).body.phase).to.equal("registration");

      // Admin: close registration, build the registry from the roll, fix the root.
      await ctx.voting.closeRegistration();
      const registry = buildVoterRegistry(hasher.hash, ctx.store.all(), {
        electionId: ELECTION.electionId,
        depth: TREE_DEPTH
      });
      expect(registry.registeredCount).to.equal(2);
      await ctx.voting.openVoting(registry.root);

      const election = (await ctx.get("/election")).body;
      expect(election.phase).to.equal("voting");
      expect(election.votingOpen).to.equal(true);
      expect(election.merkleRoot).to.equal(registry.root);

      const aliceVote = await proveVote(registry, alice, 2);
      const accepted = await ctx.post("/vote", aliceVote);
      expect(accepted.status).to.equal(200);
      expect(accepted.body.candidate).to.equal(2);

      const again = await ctx.post("/vote", aliceVote);
      expect(again.status).to.equal(409);
      expect(again.body.code).to.equal("DUPLICATE_VOTE");

      expect((await ctx.post("/vote", await proveVote(registry, bob, 3))).status).to.equal(200);

      const results = (await ctx.get("/results")).body;
      expect(results.total).to.equal("2");
      expect(results.candidates.map((c) => c.votes)).to.deep.equal(["0", "1", "1"]);

      await ctx.voting.endVoting();
      const afterEnd = await ctx.post("/vote", aliceVote);
      expect(afterEnd.status).to.equal(403);
      expect(afterEnd.body.code).to.equal("VOTING_CLOSED");

      // Privacy: nothing the server persisted or emailed contains a secret
      // in any encoding, so it cannot derive anyone's nullifier.
      const persisted = fs
        .readdirSync(ctx.dir)
        .map((file) => fs.readFileSync(path.join(ctx.dir, file), "utf8"))
        .join("\n");
      const emailed = JSON.stringify(ctx.mails);

      for (const secret of [alice, bob]) {
        for (const encoding of [secret, secretToBigInt(secret).toString()]) {
          expect(persisted).to.not.include(encoding);
          expect(emailed).to.not.include(encoding);
        }
      }
    });
  });

  describe("admin portal", function () {
    it("requires a signed-in session, the admin header and the right password", async function () {
      await setup({ admin: { loginLimit: { windowMs: 60000, max: 2 } } });

      expect((await ctx.get("/admin/session")).body).to.deep.equal({ enabled: true, authenticated: false });
      for (const route of ["/admin/overview", "/admin/voters", "/admin/activity"]) {
        const r = await ctx.get(route);
        expect(r.status).to.equal(401);
        expect(r.body.code).to.equal("ADMIN_AUTH_REQUIRED");
      }
      expect((await ctx.admin("/admin/election/close-registration")).body.code).to.equal("ADMIN_AUTH_REQUIRED");

      const noHeader = await ctx.post("/admin/login", { password: ADMIN_PASSWORD });
      expect(noHeader.status).to.equal(403);
      expect(noHeader.body.code).to.equal("FORBIDDEN");

      const wrong = await ctx.admin("/admin/login", { password: "not the password" });
      expect(wrong.status).to.equal(401);
      expect(wrong.body.code).to.equal("INVALID_PASSWORD");

      expect((await ctx.login()).status).to.equal(200);
      expect((await ctx.get("/admin/session")).body.authenticated).to.equal(true);
      const overview = await ctx.get("/admin/overview");
      expect(overview.status).to.equal(200);
      expect(overview.body.phase).to.equal("registration");
      expect(overview.body.roll).to.deep.equal({ eligible: 2, registered: 0 });
      expect(overview.body.phaseControls.available).to.equal(true);

      expect((await ctx.admin("/admin/logout")).status).to.equal(200);
      expect((await ctx.get("/admin/overview")).status).to.equal(401);

      const limited = await ctx.login();
      expect(limited.status).to.equal(429);
      expect(limited.body.code).to.equal("RATE_LIMITED");
    });

    it("is disabled until a password is set", async function () {
      await setup({ admin: { passwordHash: "" } });

      expect((await ctx.get("/admin/session")).body.enabled).to.equal(false);
      const r = await ctx.login();
      expect(r.status).to.equal(503);
      expect(r.body.code).to.equal("ADMIN_DISABLED");
    });

    it("adds voters and resets registrations through the shared roll logic", async function () {
      await setup();
      await ctx.login();

      const added = await ctx.admin("/admin/voters", { emails: ["Carol@Example.com", "dave@example.com"] });
      expect(added.status).to.equal(200);
      expect(added.body.added).to.deep.equal([
        { voterId: "VOTER-0003", email: "carol@example.com" },
        { voterId: "VOTER-0004", email: "dave@example.com" }
      ]);

      const duplicate = await ctx.admin("/admin/voters", { emails: ["erin@example.com", "alice@example.com"] });
      expect(duplicate.status).to.equal(409);
      expect(duplicate.body.code).to.equal("DUPLICATE_EMAIL");
      expect(ctx.store.all()).to.have.length(4); // nothing from the failed batch was added

      expect((await ctx.admin("/admin/voters", { emails: ["not-an-email"] })).body.code).to.equal("INVALID_EMAIL");
      expect((await ctx.admin("/admin/voters", { emails: "x@example.com" })).body.code).to.equal("INVALID_REQUEST");

      await register("VOTER-0001", "alice@example.com", newSecret());
      const voters = (await ctx.get("/admin/voters")).body.voters;
      expect(voters.find((v) => v.voterId === "VOTER-0001").registered).to.equal(true);
      expect(Object.keys(voters[0]).sort()).to.deep.equal(["email", "registered", "registeredAt", "voterId"]);

      const reset = await ctx.admin("/admin/voters/voter-0001/reset");
      expect(reset.body).to.include({ voterId: "VOTER-0001", cleared: true });
      expect(ctx.store.find("VOTER-0001").commitment).to.equal(null);
      expect((await ctx.admin("/admin/voters/VOTER-0099/reset")).body.code).to.equal("UNKNOWN_VOTER");

      const actions = (await ctx.get("/admin/activity")).body.activity.map((a) => a.action);
      expect(actions).to.deep.equal(["voter_reset", "voters_added", "login"]);

      const newest = (await ctx.get("/admin/activity?limit=1")).body;
      expect(newest.activity.map((a) => a.action)).to.deep.equal(["voter_reset"]);
      expect(newest.total).to.equal(3);
      expect(newest.activity[0].ip).to.be.a("string");
    });

    it("runs the election phases in order: close → open → vote → end", async function () {
      await setup();
      await ctx.login();
      const alice = newSecret();
      await register("VOTER-0001", "alice@example.com", alice);
      await register("VOTER-0002", "bob@example.com", newSecret());

      // Out of order: opening or ending before registration closes.
      expect((await ctx.admin("/admin/election/open")).body.code).to.equal("WRONG_PHASE");
      expect((await ctx.admin("/admin/election/end")).body.code).to.equal("WRONG_PHASE");

      const closed = await ctx.admin("/admin/election/close-registration");
      expect(closed.status).to.equal(200);
      expect(closed.body.registry).to.include({ registered: 2, eligible: 2 });
      expect(readJson(path.join(ctx.dir, "merkle.json")).root).to.equal(closed.body.registry.root);
      expect((await ctx.get("/election")).body.phase).to.equal("registration_closed");
      expect((await ctx.admin("/admin/voters", { emails: ["late@example.com"] })).body.code).to.equal("WRONG_PHASE");

      // A reset after publication changes the roll: opening republishes and stops.
      await ctx.admin("/admin/voters/VOTER-0002/reset");
      const changed = await ctx.admin("/admin/election/open");
      expect(changed.status).to.equal(409);
      expect(changed.body.code).to.equal("ROLL_CHANGED");
      expect(readJson(path.join(ctx.dir, "voterProofData.json")).voters).to.have.length(1);

      const opened = await ctx.admin("/admin/election/open");
      expect(opened.status).to.equal(200);
      expect(opened.body.registered).to.equal(1);
      expect((await ctx.voting.merkleRoot()).toString()).to.equal(opened.body.root);
      expect((await ctx.admin("/admin/voters/VOTER-0001/reset")).body.code).to.equal("WRONG_PHASE");
      expect((await ctx.admin("/admin/election/open")).body.code).to.equal("WRONG_PHASE");

      const published = readJson(path.join(ctx.dir, "voterProofData.json"));
      const vote = await ctx.post("/vote", await proveVote({ root: published.root, voterProofData: published }, alice, 1));
      expect(vote.status).to.equal(200);

      const ended = await ctx.admin("/admin/election/end");
      expect(ended.status).to.equal(200);
      expect(ended.body.results.total).to.equal("1");

      const overview = (await ctx.get("/admin/overview")).body;
      expect(overview.phase).to.equal("ended");
      expect(overview.registry.root).to.equal(opened.body.root);

      const actions = (await ctx.get("/admin/activity")).body.activity.map((a) => a.action);
      expect(actions).to.deep.equal(["voting_ended", "voting_opened", "voter_reset", "registration_closed", "login"]);
    });

    it("keeps phase controls off without the owner account, but still manages the roll", async function () {
      await setup({ withOwner: false });
      await ctx.login();

      const overview = (await ctx.get("/admin/overview")).body;
      expect(overview.phaseControls).to.deep.equal({
        available: false,
        reason: "OWNER_PRIVATE_KEY is not set in backend/.env"
      });

      const r = await ctx.admin("/admin/election/close-registration");
      expect(r.status).to.equal(503);
      expect(r.body.code).to.equal("PHASE_CONTROLS_UNAVAILABLE");
      expect((await ctx.get("/election")).body.phase).to.equal("registration");

      expect((await ctx.admin("/admin/voters", { emails: ["carol@example.com"] })).status).to.equal(200);
    });
  });
});
