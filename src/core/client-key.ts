/**
 * Who the client is, for a rate limit: its IP, from a header a proxy the server trusts
 * sets. Shared by the server backend and the AI route, which both count a client's
 * requests.
 */

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The header that holds the client's IP. On Vercel it's `x-forwarded-for`, which Vercel
 * sets and overwrites, so a client can't choose it; elsewhere, `TRUSTED_CLIENT_IP_HEADER`
 * names it. Without one, the server can't tell clients apart.
 */
export function clientIpHeaderFrom(env: Environment): string | null {
  const named = env["TRUSTED_CLIENT_IP_HEADER"];
  if (named !== undefined && named !== "") return named.toLowerCase();
  return env["VERCEL"] === "1" ? "x-forwarded-for" : null;
}

/**
 * The rate limit's key for a request: the client's IP from the header a trusted proxy
 * sets (the first address, the client's own, if a list), or null if there's no such
 * header, and so no telling clients apart.
 */
export function clientKeyOf(request: Request, header: string | null): string | null {
  if (header === null) return null;
  const address = request.headers.get(header)?.split(",")[0]?.trim();
  return address ? `ip:${address}` : null;
}
