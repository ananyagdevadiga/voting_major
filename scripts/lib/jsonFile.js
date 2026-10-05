/*
 * Dependency-free JSON file helpers shared by the scripts and the backend.
 * Writes are atomic (temp file + rename) so a crash or a concurrent reader
 * never sees a half-written file.
 */
const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");

  // On Windows the rename can briefly fail while another process (an editor,
  // antivirus) has the target open.
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmpPath, filePath);
      return;
    } catch (error) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(error.code)) {
        fs.rmSync(tmpPath, { force: true });
        throw error;
      }
      sleepSync(50 * attempt);
    }
  }
}

module.exports = { readJson, writeJson };
