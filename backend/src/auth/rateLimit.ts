import type { RequestHandler } from "express";

interface Bucket {
  count: number;
  resetsAt: number;
}

export function createAuthRateLimit(maxAttempts: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 1_000) {
      for (const [bucketKey, bucketValue] of buckets) {
        if (bucketValue.resetsAt <= now) buckets.delete(bucketKey);
      }
    }
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = buckets.get(key);
    const bucket =
      !current || current.resetsAt <= now
        ? { count: 0, resetsAt: now + windowMs }
        : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader("X-RateLimit-Limit", String(maxAttempts));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxAttempts - bucket.count)));
    if (bucket.count > maxAttempts) {
      const retryAfter = Math.ceil((bucket.resetsAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many authentication attempts",
        status: 429,
        retryAfter,
      });
      return;
    }
    next();
  };
}
