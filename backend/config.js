const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const ROOT_DIR = path.join(__dirname, "..");

function resolveFromRoot(value, fallback) {
  return path.resolve(ROOT_DIR, value || fallback);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy backend/.env.example to backend/.env.`
    );
  }
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  // Relayer wallet that submits vote transactions (pays gas only — it cannot
  // forge votes, the contract verifies every proof).
  privateKey: required("PRIVATE_KEY"),
  // Contract owner wallet the admin portal uses for phase changes (close
  // registration, open voting, end). Optional: without it the portal still
  // manages the roll, but phase changes stay in the terminal scripts.
  ownerPrivateKey: process.env.OWNER_PRIVATE_KEY || "",
  // scrypt hash of the admin portal password (npm run admin:set-password).
  // Without it the admin portal is disabled.
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  // Admin session cookie: Secure (HTTPS only) in production.
  cookieSecure: process.env.NODE_ENV === "production",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  contractInfoPath: resolveFromRoot(process.env.CONTRACT_INFO_PATH, "contractAddress.json"),
  electionConfigPath: resolveFromRoot(process.env.ELECTION_CONFIG_PATH, "election.config.json"),
  verificationKeyPath: resolveFromRoot(process.env.VERIFICATION_KEY_PATH, "build/verification_key.json"),
  // Electoral roll: voter IDs, emails and registered commitments (no secrets).
  votersPath: resolveFromRoot(process.env.VOTERS_PATH, "data/voters.json"),
  // Voter registry published when registration closes (admin portal).
  merklePath: resolveFromRoot(process.env.MERKLE_PATH, "data/merkle.json"),
  voterProofDataPath: resolveFromRoot(
    process.env.VOTER_PROOF_DATA_PATH,
    "client/public/voterProofData.json"
  ),
  // Append-only log of admin portal actions (one JSON object per line).
  adminLogPath: resolveFromRoot(process.env.ADMIN_LOG_PATH, "data/admin-log.jsonl"),
  // Without SMTP_HOST, registration emails are printed to the console (dev only).
  mail: {
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "SecureVote <no-reply@securevote.local>"
  }
};
