/**
 * Fixed-window rate limiter.
 *
 * Default: in-memory, per-process. That's fine for a single-instance,
 * single-shop deployment (the common case for this app), but resets on
 * restart and doesn't share state across multiple instances.
 *
 * If UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, swap this
 * for `@upstash/ratelimit` + `@upstash/redis` so limits hold across
 * restarts and horizontally-scaled instances.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Prevent unbounded memory growth from a flood of distinct keys (e.g. an
// attacker cycling usernames). Oldest entries are evicted first.
const MAX_TRACKED_KEYS = 10_000;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  existing.count += 1;
  return true;
}
