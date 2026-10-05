/*
 * Electoral roll operations shared by the admin scripts and the backend's
 * admin portal. They change the roll array in place; the caller reads and
 * writes data/voters.json.
 *
 * The roll holds each voter's ID and the email address the registration code
 * is sent to. It never holds a secret: voters create their own credential in
 * the browser during registration and only its commitment is stored.
 */
const { ElectionError } = require("./errors");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Adds one voter per email. Either every email is added or none is.
// `capacity` (2^treeDepth) caps the roll at what the voter tree can hold.
function addVoters(voters, rawEmails, { capacity = Infinity } = {}) {
  const emails = rawEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean);

  if (emails.length === 0) {
    throw new ElectionError("INVALID_REQUEST", "At least one email address is required");
  }

  const knownEmails = new Set(voters.map((voter) => voter.email));
  for (const email of emails) {
    if (!EMAIL_PATTERN.test(email)) {
      throw new ElectionError("INVALID_EMAIL", `Invalid email address: ${email}`);
    }
    if (knownEmails.has(email)) {
      throw new ElectionError("DUPLICATE_EMAIL", `${email} is already on the roll`);
    }
    knownEmails.add(email);
  }

  if (voters.length + emails.length > capacity) {
    throw new ElectionError(
      "ROLL_FULL",
      `The voter tree holds ${capacity} voters; the roll already has ${voters.length}.`
    );
  }

  return emails.map((email) => {
    const voterId = `VOTER-${String(voters.length + 1).padStart(4, "0")}`;
    voters.push({ voterId, email, commitment: null, registeredAt: null });
    return { voterId, email };
  });
}

// Clears a voter's registered commitment so they can register again (lost
// credential, or someone else registered with their code). Returns whether
// there was anything to clear.
function resetVoter(voters, rawVoterId) {
  const voterId = String(rawVoterId || "").trim().toUpperCase();
  const voter = voters.find((v) => v.voterId === voterId);

  if (!voter) {
    throw new ElectionError("UNKNOWN_VOTER", `${voterId || "That voter"} is not on the roll`);
  }
  if (!voter.commitment) {
    return { voterId, cleared: false };
  }

  voter.commitment = null;
  voter.registeredAt = null;
  return { voterId, cleared: true };
}

module.exports = { addVoters, resetVoter };
