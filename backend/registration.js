const crypto = require("crypto");
const { SNARK_FIELD, ApiError } = require("./constants");

/*
 * Voter registration:
 *
 *   1. requestCode(voterId)        a 6-digit code is emailed to the address on
 *                                  the roll for that voter ID
 *   2. verifyCode(voterId, code)   proves the voter controls that email and
 *                                  returns a short-lived registration token
 *   3. commit(token, commitment)   stores Poseidon(secret) for the voter
 *
 * The secret itself is generated in the voter's browser and never sent here,
 * so the server cannot compute any voter's nullifier or vote on their behalf.
 * Codes and tokens live in memory only; a restart simply invalidates them.
 */

const DEFAULTS = {
  codeTtlMs: 10 * 60 * 1000,
  codeCooldownMs: 60 * 1000,
  maxCodeAttempts: 5,
  tokenTtlMs: 15 * 60 * 1000
};

const VOTER_ID_PATTERN = /^[A-Z0-9-]{1,32}$/;

function normalizeVoterId(value) {
  const voterId = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!VOTER_ID_PATTERN.test(voterId)) {
    throw new ApiError(400, "INVALID_REQUEST", "A valid voter ID is required");
  }
  return voterId;
}

function parseCommitment(value) {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) {
    throw new ApiError(400, "INVALID_COMMITMENT", "Commitment must be a decimal string");
  }
  const n = BigInt(value);
  if (n === 0n || n >= SNARK_FIELD) {
    throw new ApiError(400, "INVALID_COMMITMENT", "Commitment is out of range");
  }
  return n.toString();
}

function hashCode(voterId, code) {
  return crypto.createHash("sha256").update(`${voterId}:${code}`).digest();
}

function createRegistration({ store, mailer, electionName, now = Date.now, ...options }) {
  const settings = { ...DEFAULTS, ...options };
  const codes = new Map(); // voterId -> { hash, sentAt, expiresAt, attempts }
  const tokens = new Map(); // token -> { voterId, expiresAt }

  function prune() {
    const t = now();
    for (const [key, entry] of codes) if (entry.expiresAt <= t) codes.delete(key);
    for (const [key, entry] of tokens) if (entry.expiresAt <= t) tokens.delete(key);
  }

  // Responds identically whether or not the voter ID exists, so the endpoint
  // cannot be used to discover who is on the roll.
  async function requestCode(rawVoterId) {
    prune();
    const voterId = normalizeVoterId(rawVoterId);
    const voter = store.find(voterId);

    if (!voter || !voter.email) {
      return;
    }

    const pending = codes.get(voterId);
    if (pending && now() - pending.sentAt < settings.codeCooldownMs) {
      return;
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    codes.set(voterId, {
      hash: hashCode(voterId, code),
      sentAt: now(),
      expiresAt: now() + settings.codeTtlMs,
      attempts: 0
    });

    const minutes = Math.round(settings.codeTtlMs / 60000);
    try {
      await mailer.send({
        to: voter.email,
        subject: `${electionName}: your registration code`,
        text:
          `Your registration code for voter ID ${voterId} is: ${code}\n\n` +
          `It expires in ${minutes} minutes and can be used once.\n\n` +
          "Your voting credential will be created on your own device during " +
          "registration. Nobody — including the election administrator — ever " +
          "sees it, and we will never ask you for it.\n\n" +
          "If you did not request this code, you can ignore this email."
      });
    } catch (error) {
      codes.delete(voterId);
      console.error("Failed to send registration code:", error.message);
      throw new ApiError(502, "EMAIL_FAILED", "Could not send the registration code. Try again later.");
    }
  }

  function verifyCode(rawVoterId, rawCode) {
    prune();
    const voterId = normalizeVoterId(rawVoterId);
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const pending = codes.get(voterId);

    if (!pending || !/^\d{6}$/.test(code)) {
      throw new ApiError(400, "INVALID_CODE", "The code is invalid or has expired");
    }

    pending.attempts++;

    if (!crypto.timingSafeEqual(hashCode(voterId, code), pending.hash)) {
      if (pending.attempts >= settings.maxCodeAttempts) {
        codes.delete(voterId);
        throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new code.");
      }
      throw new ApiError(400, "INVALID_CODE", "The code is invalid or has expired");
    }

    codes.delete(voterId);

    const token = crypto.randomBytes(32).toString("hex");
    tokens.set(token, { voterId, expiresAt: now() + settings.tokenTtlMs });

    return {
      token,
      voterId,
      alreadyRegistered: Boolean(store.find(voterId)?.commitment)
    };
  }

  async function commit(rawToken, rawCommitment) {
    prune();
    const session = typeof rawToken === "string" ? tokens.get(rawToken) : undefined;

    if (!session) {
      throw new ApiError(401, "INVALID_TOKEN", "Registration session expired. Request a new code.");
    }

    const commitment = parseCommitment(rawCommitment);
    const { voterId } = session;

    const { email, replaced } = store.update((voters) => {
      const voter = voters.find((v) => v.voterId === voterId);
      if (!voter) {
        throw new ApiError(404, "UNKNOWN_VOTER", "Voter is no longer on the roll");
      }
      if (voters.some((v) => v.voterId !== voterId && v.commitment === commitment)) {
        throw new ApiError(409, "DUPLICATE_COMMITMENT", "This credential is already registered. Generate a new one.");
      }

      const wasRegistered = Boolean(voter.commitment);
      voter.commitment = commitment;
      voter.registeredAt = new Date(now()).toISOString();
      return { email: voter.email, replaced: wasRegistered };
    });

    tokens.delete(rawToken);

    // The notice lets a voter spot a registration they did not make while
    // the administrator can still reset it (before voting opens).
    try {
      await mailer.send({
        to: email,
        subject: `${electionName}: voting credential ${replaced ? "replaced" : "registered"}`,
        text:
          `A voting credential was ${replaced ? "re-registered (the previous one no longer works)" : "registered"} ` +
          `for voter ID ${voterId} at ${new Date(now()).toISOString()}.\n\n` +
          "If this was not you, contact the election administrator before voting opens."
      });
    } catch (error) {
      console.error("Failed to send registration notice:", error.message);
    }

    return { voterId, replaced };
  }

  return { requestCode, verifyCode, commit };
}

module.exports = { createRegistration };
