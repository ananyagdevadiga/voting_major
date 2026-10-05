const { ApiError } = require("./constants");

// Fixed-window-per-IP limiter (registration and admin login endpoints).
function rateLimit({ windowMs, max }) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();

    if (hits.size > 10000) {
      for (const [ip, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(ip);
      }
    }

    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(req.ip, recent);
      return next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait and try again."));
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}

function revertReason(error) {
  return error?.reason || error?.revert?.args?.[0] || error?.shortMessage || "";
}

// Runs transactions one at a time so the backend's nonces never collide —
// votes (relayer) and admin phase changes (owner) may share an account.
function createTxQueue() {
  let queue = Promise.resolve();
  return function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
}

module.exports = { rateLimit, revertReason, createTxQueue };
