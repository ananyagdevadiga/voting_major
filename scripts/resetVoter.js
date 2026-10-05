/*
 * Clears a voter's registered commitment so they can register again (e.g. the
 * voter lost their credential, or someone else registered with their code).
 *
 * Only meaningful before voting opens: the on-chain registry root is fixed
 * when voting opens, so later changes to data/voters.json have no effect.
 * (Also available in the admin portal: /admin.)
 *
 * Usage: npm run voter:reset -- VOTER-0001
 */
const { PATHS, readJson, writeJson } = require("./lib/common");
const { resetVoter } = require("./lib/roll");

function main() {
  if (!process.argv[2]) {
    throw new Error("Usage: npm run voter:reset -- <voterId>");
  }

  const voters = readJson(PATHS.voters);
  const { voterId, cleared } = resetVoter(voters, process.argv[2]);

  if (!cleared) {
    console.log(`${voterId} has no registered credential; nothing to reset.`);
    return;
  }

  writeJson(PATHS.voters, voters);

  console.log(`${voterId}: registration cleared. The voter can register again at /register.`);
  console.log("(This has no effect once voting has opened — the root is fixed on-chain.)");
}

try {
  main();
} catch (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}
