import { poseidon1, poseidon2 } from "poseidon-lite";

export const VOTE_WASM_URL = "/zk/vote.wasm";
export const VOTE_ZKEY_URL = "/zk/vote_final.zkey";

// Same encoding as scripts/lib/common.js: UTF-8 bytes read as one big-endian
// integer.
export function secretToBigInt(secret) {
  if (!secret) {
    throw new Error("Secret credential is missing");
  }

  const bytes = new TextEncoder().encode(secret);
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return BigInt("0x" + hex);
}

// A new voting credential: 16 random bytes from the browser's CSPRNG as a
// 22-character base64url string (128 bits of entropy; as an integer it is
// 176 bits, well inside the SNARK field). It is created on the voter's device
// and never sent anywhere — only computeCommitment(secret) is.
export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function computeCommitment(secret) {
  return poseidon1([secretToBigInt(secret)]).toString();
}

// Derived locally so the nullifier is never published next to a voter ID.
export function computeNullifier(secret, electionId) {
  return poseidon2([secretToBigInt(secret), BigInt(electionId)]).toString();
}

export async function loadVoterProofData() {
  const response = await fetch("/voterProofData.json");

  if (!response.ok) {
    throw new Error("Voter registry (voterProofData.json) not found");
  }

  return response.json();
}
