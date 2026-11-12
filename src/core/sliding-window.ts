/**
 * Rate limiting as a sliding-window log. It remembers when each recent request arrived
 * and lets another through only if fewer than `limit` arrived in the last `windowMs`:
 * exact, with none of the bursts a fixed window allows at its boundary, and small enough
 * for one client's handful of requests.
 *
 * Refused requests are logged too, so a client that keeps hammering keeps itself
 * waiting, while one that waits as long as `Retry-After` says gets straight in.
 *
 * Pure, so both sides can count: the backend's HTTP adapter (`backend/http/rate-limit.ts`,
 * with a Postgres log on a server) and the AI route, which has no database to keep one in.
 */

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export type RateDecision = { isAllowed: true } | { isAllowed: false; retryAfterMs: number };

/** Clients remembered at once, in memory: more than a sandbox's one tab will ever be. */
const MAX_CLIENTS = 1_000;

/** One sliding window per client, in this process's memory. */
export function createSlidingWindowStore(now: () => number) {
  const windows = new Map<string, ReturnType<typeof createSlidingWindow>>();
  return {
    take: (clientKey: string, limit: RateLimit): RateDecision => {
      let window = windows.get(clientKey);
      if (!window) {
        if (windows.size >= MAX_CLIENTS) windows.clear();
        window = createSlidingWindow(now);
        windows.set(clientKey, window);
      }
      return window.take(limit);
    },
  };
}

export function createSlidingWindow(now: () => number) {
  let arrivals: number[] = [];

  return {
    /** Count a request, and say whether it may go ahead — and if not, when one could. */
    take({ limit, windowMs }: RateLimit): RateDecision {
      const nowMs = now();
      arrivals = arrivals.filter((arrivedAtMs) => arrivedAtMs > nowMs - windowMs);
      const isAllowed = arrivals.length < limit;
      arrivals.push(nowMs);
      if (isAllowed) return { isAllowed };
      // The next request is allowed once enough arrivals have aged out that fewer
      // than `limit` remain: when the arrival `limit` places from the newest leaves.
      const freedAtMs = (arrivals[arrivals.length - limit] ?? nowMs) + windowMs;
      return { isAllowed, retryAfterMs: Math.max(0, freedAtMs - nowMs) };
    },
  };
}
