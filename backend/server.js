const fs = require("fs");
const config = require("./config");
const { initializeBlockchain } = require("./blockchain");
const { createMailer } = require("./mailer");
const { VoterStore } = require("./voterStore");
const { createApp } = require("./app");

async function startup() {
  console.log("Starting voting backend server...");

  const vKey = JSON.parse(fs.readFileSync(config.verificationKeyPath, "utf-8"));
  const electionConfig = JSON.parse(fs.readFileSync(config.electionConfigPath, "utf-8"));

  let chain;
  try {
    chain = await initializeBlockchain();

    if (String(electionConfig.electionId) !== chain.electionId) {
      throw new Error(
        `election.config.json electionId (${electionConfig.electionId}) != contract (${chain.electionId})`
      );
    }
    if (electionConfig.candidates.length !== chain.candidateCount) {
      throw new Error(
        `election.config.json has ${electionConfig.candidates.length} candidates, contract has ${chain.candidateCount}`
      );
    }
  } catch (error) {
    console.error("Startup failed:", error.message);
    console.error("Start a node and deploy first:");
    console.error("  npm run node");
    console.error("  npm run deploy");
    process.exit(1);
  }

  const mailer = createMailer(config.mail);
  if (mailer.mode === "console") {
    console.warn(
      "WARNING: SMTP is not configured. Registration emails are printed to this " +
        "console instead of being sent (development only)."
    );
  }

  if (!config.adminPasswordHash) {
    console.warn(
      "WARNING: the admin portal is disabled. Set a password with: npm run admin:set-password"
    );
  }

  const app = createApp({
    chain,
    store: new VoterStore(config.votersPath),
    mailer,
    vKey,
    electionConfig,
    corsOrigins: config.corsOrigins,
    admin: {
      passwordHash: config.adminPasswordHash,
      sessionOptions: { secure: config.cookieSecure },
      paths: {
        merkle: config.merklePath,
        voterProofData: config.voterProofDataPath,
        adminLog: config.adminLogPath,
        contractInfo: config.contractInfoPath
      }
    }
  });

  app.listen(config.port, () => {
    console.log(`Backend server running on http://localhost:${config.port}`);
    console.log(
      "Endpoints: GET /status, GET /election, GET /results, POST /vote, " +
        "POST /registration/request-code | verify-code | commit, /admin/* (admin portal)"
    );
  });
}

startup();
