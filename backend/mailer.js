const nodemailer = require("nodemailer");

/*
 * Sends registration emails. The only things ever emailed are one-time
 * registration codes and "your credential was registered" notices — never a
 * voting credential (the server never has one).
 *
 * Without SMTP_HOST the mailer prints emails to the server console, which is
 * for local development only and refused when NODE_ENV=production.
 */
function createMailer(mail) {
  if (!mail.smtpHost) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST is required when NODE_ENV=production");
    }

    return {
      mode: "console",
      async send({ to, subject, text }) {
        console.log(`\n----- [mail → ${to}] ${subject} -----\n${text}\n-----`);
      }
    };
  }

  const transporter = nodemailer.createTransport({
    host: mail.smtpHost,
    port: mail.smtpPort,
    secure: mail.smtpSecure,
    auth: mail.smtpUser ? { user: mail.smtpUser, pass: mail.smtpPass } : undefined,
    // nodemailer's defaults wait up to 10 minutes on a stalled connection,
    // which leaves the registration page stuck on "Sending...".
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });

  return {
    mode: "smtp",
    async send({ to, subject, text }) {
      await transporter.sendMail({ from: mail.from, to, subject, text });
    }
  };
}

module.exports = { createMailer };
