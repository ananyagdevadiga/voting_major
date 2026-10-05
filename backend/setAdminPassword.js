/*
 * Sets the admin portal password. Only its scrypt hash is saved, as
 * ADMIN_PASSWORD_HASH in backend/.env; restart the backend afterwards.
 *
 *   npm run admin:set-password
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { hashPassword } = require("./adminAuth");

const ENV_PATH = path.join(__dirname, ".env");
const MIN_LENGTH = 10;

// Asks for lines one at a time; typed characters are hidden on a terminal.
// Lines are buffered, so piped input (echo ... | npm run ...) works too.
function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY)
  });
  let muted = false;
  rl._writeToOutput = (text) => {
    if (!muted) rl.output.write(text);
  };
  const lines = rl[Symbol.asyncIterator]();

  return {
    async ask(question) {
      process.stdout.write(question);
      muted = true;
      const { value = "" } = await lines.next();
      muted = false;
      process.stdout.write("\n");
      return value;
    },
    close: () => rl.close()
  };
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error("backend/.env not found. Copy backend/.env.example to backend/.env first.");
  }

  const prompt = createPrompt();
  const password = await prompt.ask("New admin password: ");
  const confirm = await prompt.ask("Repeat the password: ");
  prompt.close();

  if (password.length < MIN_LENGTH) {
    throw new Error(`Use at least ${MIN_LENGTH} characters.`);
  }
  if (password !== confirm) {
    throw new Error("The passwords do not match.");
  }

  const line = `ADMIN_PASSWORD_HASH=${await hashPassword(password)}`;
  const env = fs.readFileSync(ENV_PATH, "utf8");
  const updated = /^ADMIN_PASSWORD_HASH=.*$/m.test(env)
    ? env.replace(/^ADMIN_PASSWORD_HASH=.*$/m, line)
    : `${env.replace(/\s*$/, "")}\n\n# Admin portal password (scrypt hash, set by npm run admin:set-password)\n${line}\n`;
  fs.writeFileSync(ENV_PATH, updated);

  console.log("Admin password saved (as a hash) in backend/.env. Restart the backend to apply it.");
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
