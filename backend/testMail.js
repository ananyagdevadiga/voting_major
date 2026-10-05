/*
 * Sends one test email with the SMTP settings in backend/.env.
 *
 *   npm run mail:test -- someone@example.com
 */
const config = require("./config");
const { createMailer } = require("./mailer");

async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error("Usage: npm run mail:test -- someone@example.com");
  }
  if (!config.mail.smtpHost) {
    throw new Error("SMTP_HOST is empty in backend/.env, so emails are only printed to the console");
  }
  if (!config.mail.smtpUser || !config.mail.smtpPass) {
    throw new Error("Set SMTP_USER and SMTP_PASS in backend/.env");
  }

  const mailer = createMailer(config.mail);
  await mailer.send({
    to,
    subject: "SecureVote test email",
    text: "Email is working. Registration codes will be delivered to this address."
  });
  console.log(`Sent a test email to ${to} via ${config.mail.smtpHost} as ${config.mail.smtpUser}`);
}

main().catch((error) => {
  console.error(`Email failed: ${error.message}`);
  if (/Invalid login|535/.test(error.message)) {
    console.error("Gmail rejected the login: SMTP_PASS must be an App Password, and 2-Step Verification must be on.");
  }
  process.exitCode = 1;
});
