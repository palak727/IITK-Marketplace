export const createRateLimiter = ({
  windowMs = 60 * 1000,
  maxRequests = 100,
  message = 'Too many requests. Please try again shortly.',
} = {}) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requests.get(key) || { count: 0, resetAt: now + windowMs };

    if (now >= entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    requests.set(key, entry);

    if (entry.count > maxRequests) {
      return res.status(429).json({ message });
    }

    if (requests.size > 10000) {
      for (const [ip, value] of requests) if (value.resetAt <= now) requests.delete(ip);
    }
    return next();
  };
};

export const rateLimitMiddleware = createRateLimiter();
