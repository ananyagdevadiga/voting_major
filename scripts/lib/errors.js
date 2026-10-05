// An expected failure of an election operation (bad input, wrong phase, ...).
// `code` lets the backend turn it into an API error; the scripts print the message.
class ElectionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = { ElectionError };
