/*
 * Adds eligible voters to the electoral roll (data/voters.json).
 *
 * The roll holds each voter's ID and the email address the registration code
 * is sent to. It never holds a secret: voters create their own credential in
 * the browser during registration and only its commitment is stored.
 * (Also available in the admin portal: /admin.)
 *
 * Usage: npm run voter:add -- alice@example.com bob@example.com ...
 */
const fs = require("fs");
const { PATHS, readJson, writeJson, loadElectionConfig } = require("./lib/common");
const { addVoters } = require("./lib/roll");

function main() {
  const emails = process.argv.slice(2);

  if (emails.length === 0) {
    throw new Error("Usage: npm run voter:add -- <email> [<email> ...]");
  }

  const voters = fs.existsSync(PATHS.voters) ? readJson(PATHS.voters) : [];
  const added = addVoters(voters, emails, { capacity: 2 ** loadElectionConfig().treeDepth });
  writeJson(PATHS.voters, voters);

  console.log("\nAdded to the electoral roll:");
  for (const { voterId, email } of added) {
    console.log(`  ${voterId}  ${email}`);
  }
  console.log(`\nRoll size: ${voters.length}`);
  console.log("Tell each voter their voter ID; they register at /register.\n");
}

try {
  main();
} catch (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}
