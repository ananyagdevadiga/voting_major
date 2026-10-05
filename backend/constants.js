// BN254 scalar field: every public signal and commitment must be a canonical
// field element.
const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Must match the Phase enum order in contracts/Voting.sol.
const PHASES = ["registration", "registration_closed", "voting", "ended"];

// Public signal layout fixed by circuits/Vote.circom
const SIGNAL = { root: 0, nullifierHash: 1, electionId: 2, candidateCount: 3, vote: 4 };
const PUBLIC_SIGNAL_COUNT = 5;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { SNARK_FIELD, PHASES, SIGNAL, PUBLIC_SIGNAL_COUNT, ApiError };
