const fs = require("fs");
const { readJson, writeJson } = require("../scripts/lib/jsonFile");

/*
 * The electoral roll (data/voters.json):
 *   [{ voterId, email, commitment | null, registeredAt | null }]
 *
 * It is re-read on every access so changes made by the admin scripts are
 * picked up without a restart. update() reads, mutates and writes
 * synchronously, so two requests can never interleave a read-modify-write;
 * the write itself is atomic (temp file + rename).
 */
class VoterStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  all() {
    return fs.existsSync(this.filePath) ? readJson(this.filePath) : [];
  }

  find(voterId) {
    return this.all().find((voter) => voter.voterId === voterId) || null;
  }

  update(mutate) {
    const voters = this.all();
    const result = mutate(voters);
    writeJson(this.filePath, voters);
    return result;
  }
}

module.exports = { VoterStore };
