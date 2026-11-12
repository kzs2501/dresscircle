/**
 * Rate limiting for the HTTP adapter: the sliding-window log in `core/sliding-window.ts`.
 *
 * Where the log lives is a `RateLimitStore`: in the adapter's memory for the sandbox,
 * whose one client is its browser tab, and in Postgres for a server
 * (`postgres/rate-limit.ts`), keyed by the client's IP. RFC 6585 leaves "who is the
 * client" to the server.
 */
import type { Awaitable } from "@/backend/port";
import type { RateDecision, RateLimit } from "@/core/sliding-window";

export { createSlidingWindow, createSlidingWindowStore } from "@/core/sliding-window";
export type { RateDecision, RateLimit } from "@/core/sliding-window";

/** Where each client's attempts are counted. */
export interface RateLimitStore {
  /** Count an attempt by this client, and say whether it may go ahead. */
  take: (clientKey: string, limit: RateLimit) => Awaitable<RateDecision>;
}
