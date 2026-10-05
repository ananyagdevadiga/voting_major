import { API_URL } from "./api";

// An error answer from the admin API; `code` is the server's error code
// (e.g. ADMIN_AUTH_REQUIRED when the session has expired).
export class AdminApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// The session lives in an HttpOnly cookie, so every request sends credentials.
// POSTs carry the header the backend requires to rule out cross-site requests.
async function adminRequest(path, { method = "GET", body } = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}/admin${path}`, {
      method,
      credentials: "include",
      headers:
        method === "POST" ? { "Content-Type": "application/json", "X-SecureVote-Admin": "1" } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError("NETWORK_ERROR", "Cannot reach the voting server. Is the backend running?");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AdminApiError(data.code || "SERVER_ERROR", data.message || `Server error (${response.status})`);
  }

  return data;
}

export const getAdminSession = () => adminRequest("/session");
export const adminLogin = (password) => adminRequest("/login", { method: "POST", body: { password } });
export const adminLogout = () => adminRequest("/logout", { method: "POST" });

export const fetchOverview = () => adminRequest("/overview");
export const fetchVoters = () => adminRequest("/voters");
// The newest `limit` admin log entries (the server caps it at 500), plus the total.
export const fetchActivity = (limit = 20) => adminRequest(`/activity?limit=${limit}`);

export const addVoters = (emails) => adminRequest("/voters", { method: "POST", body: { emails } });
export const resetVoter = (voterId) =>
  adminRequest(`/voters/${encodeURIComponent(voterId)}/reset`, { method: "POST" });

export const closeRegistration = () => adminRequest("/election/close-registration", { method: "POST" });
export const openVoting = () => adminRequest("/election/open", { method: "POST" });
export const endElection = () => adminRequest("/election/end", { method: "POST" });
