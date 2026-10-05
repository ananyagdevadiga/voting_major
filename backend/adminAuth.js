const crypto = require("crypto");
const { promisify } = require("util");
const { ApiError } = require("./constants");

/*
 * Admin portal authentication: one administrator password, stored only as a
 * scrypt hash (ADMIN_PASSWORD_HASH, written by `npm run admin:set-password`),
 * and in-memory sessions carried in an HttpOnly cookie scoped to /admin.
 * A backend restart signs the administrator out.
 */

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

const COOKIE_NAME = "sv_admin";
const COOKIE_PATH = "/admin";

// Every admin POST must carry this header. Browsers cannot add a custom
// header cross-origin without a CORS preflight, which only the configured
// frontend origins pass — so another site cannot drive the portal (CSRF).
const ADMIN_HEADER = "x-securevote-admin";

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split("$");
  if (scheme !== "scrypt" || !salt || !expected || typeof password !== "string") {
    return false;
  }
  const key = await scrypt(password, Buffer.from(salt, "base64"), KEY_LENGTH);
  const expectedKey = Buffer.from(expected, "base64");
  return expectedKey.length === key.length && crypto.timingSafeEqual(key, expectedKey);
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function createAdminSessions({ ttlMs = 8 * 60 * 60 * 1000, secure = false, now = Date.now } = {}) {
  const sessions = new Map(); // token -> expiresAt

  function cookie(value, maxAgeSeconds) {
    return [
      `${COOKIE_NAME}=${value}`,
      `Path=${COOKIE_PATH}`,
      `Max-Age=${maxAgeSeconds}`,
      "HttpOnly",
      "SameSite=Strict",
      ...(secure ? ["Secure"] : [])
    ].join("; ");
  }

  function isValid(req) {
    const token = readCookie(req, COOKIE_NAME);
    const expiresAt = token && sessions.get(token);
    if (!expiresAt) return false;
    if (expiresAt <= now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  function start(res) {
    for (const [token, expiresAt] of sessions) if (expiresAt <= now()) sessions.delete(token);

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, now() + ttlMs);
    res.setHeader("Set-Cookie", cookie(token, Math.floor(ttlMs / 1000)));
  }

  function end(req, res) {
    const token = readCookie(req, COOKIE_NAME);
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", cookie("", 0));
  }

  // Middleware for every admin route except login / session.
  function requireAdmin(req, res, next) {
    if (!isValid(req)) {
      return next(new ApiError(401, "ADMIN_AUTH_REQUIRED", "Sign in to the admin portal"));
    }
    next();
  }

  return { isValid, start, end, requireAdmin };
}

function requireAdminHeader(req, res, next) {
  if (req.method === "POST" && req.get(ADMIN_HEADER) !== "1") {
    return next(new ApiError(403, "FORBIDDEN", "Missing admin request header"));
  }
  next();
}

module.exports = {
  ADMIN_HEADER,
  hashPassword,
  verifyPassword,
  createAdminSessions,
  requireAdminHeader
};
