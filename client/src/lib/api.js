export const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3000"
).replace(/\/$/, "");

async function request(path, options) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new Error("Cannot reach the voting server. Is the backend running?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok && !("success" in data)) {
    throw new Error(data.message || `Server error (${response.status})`);
  }

  return data;
}

export function fetchElection() {
  return request("/election");
}

export function fetchResults() {
  return request("/results");
}

function postJson(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Registration: these resolve with { success, code?, message, ... }.
export function requestRegistrationCode(voterId) {
  return postJson("/registration/request-code", { voterId });
}

export function verifyRegistrationCode(voterId, code) {
  return postJson("/registration/verify-code", { voterId, code });
}

// Only the commitment Poseidon(secret) is sent — never the secret.
export function commitRegistration(token, commitment) {
  return postJson("/registration/commit", { token, commitment });
}

// Resolves with the server response ({ success, code, message, ... }) for
// both accepted and rejected votes; throws only on network/server failure.
export function submitVote(proof, publicSignals) {
  return request("/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof, publicSignals }),
  });
}
