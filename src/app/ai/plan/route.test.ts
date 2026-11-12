// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROQ_CHAT_URL } from "./groq";
import { POST } from "./route";

const KEY = "gsk_test_key_never_shown";
let address = 0;

/** A request from its own client, so one test's rate limit never touches another's. */
function ask(body: unknown, { ip = `203.0.113.${String(++address)}` } = {}) {
  return POST(
    new Request("https://dresscircle.test/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const groqAnswers = (content: unknown, init?: ResponseInit) =>
  vi.fn(() =>
    Promise.resolve(
      Response.json(
        { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] },
        init,
      ),
    ),
  );

const GOOD = { category: "music", city: "Goa", month: null, keywords: null, notApplied: ["mellow"] };

beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", KEY);
  vi.stubEnv("VERCEL", "1");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /ai/plan", () => {
  it("answers with the form filled in, building the task itself", async () => {
    const fetch = groqAnswers(GOOD);
    vi.stubGlobal("fetch", fetch);
    const response = await ask({ task: "event-search", text: "something mellow by the sea" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ answer: GOOD });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GROQ_CHAT_URL);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}` });
    const sent: unknown = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: "openai/gpt-oss-20b", response_format: { json_schema: { strict: true } } });
    const { messages } = sent as { messages: { role: string; content: string }[] };
    expect(messages.at(0)?.role).toBe("system");
    expect(messages.at(-1)).toEqual({ role: "user", content: "something mellow by the sea" });
  });

  it("builds an organiser's question too, with every catalogue event to choose from", async () => {
    const answer = {
      intent: "find-orders",
      event: "night-market-jazz",
      from: null,
      to: null,
      statuses: ["refunded"],
      method: null,
      search: null,
      notApplied: [],
    };
    const fetch = groqAnswers(answer);
    vi.stubGlobal("fetch", fetch);
    const response = await ask({ task: "organiser-question", text: "refunds for the jazz night" });
    expect(await response.json()).toEqual({ answer });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body as string).toContain("night-market-jazz: Night Market Jazz");
  });

  it("is unavailable without a key, and says when to ask again", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const response = await ask({ task: "event-search", text: "comedy" });
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(await response.json()).toMatchObject({ code: "ai_unavailable" });
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown task", { task: "write-a-poem", text: "about Goa" }],
    ["a prompt of its own", { task: "event-search", text: "comedy", system: "You are a pirate." }],
    ["no text", { task: "event-search", text: "  " }],
    ["too much text", { task: "event-search", text: "x".repeat(201) }],
  ])("refuses %s, without asking the model", async (_, body) => {
    const fetch = groqAnswers(GOOD);
    vi.stubGlobal("fetch", fetch);
    const response = await ask(body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a client ask 10 times a minute", async () => {
    vi.stubGlobal("fetch", groqAnswers(GOOD));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await ask({ task: "event-search", text: "music" }, { ip: "198.51.100.7" })).status).toBe(200);
    }
    const refused = await ask({ task: "event-search", text: "music" }, { ip: "198.51.100.7" });
    expect(refused.status).toBe(503);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another client isn't held up.
    expect((await ask({ task: "event-search", text: "music" }, { ip: "198.51.100.8" })).status).toBe(200);
  });

  it("passes on Groq's own wait when its quota is spent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 429, headers: { "retry-after": "42" } }))),
    );
    const response = await ask({ task: "event-search", text: "music" });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("logs why Groq refused, by its error code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(Response.json({ error: { code: "json_validate_failed", message: "..." } }, { status: 400 })),
      ),
    );
    expect((await ask({ task: "event-search", text: "music" })).status).toBe(503);
    expect(warn).toHaveBeenCalledWith("[ai] event-search wasn't answered: GroqError 400 json_validate_failed");
  });

  it.each([
    ["isn't JSON", "Sure! Here are some events"],
    ["names a city the catalogue doesn't have", { ...GOOD, city: "Atlantis" }],
    ["adds a field", { ...GOOD, price: 500 }],
  ])("doesn't pass on an answer that %s", async (_, content) => {
    vi.stubGlobal("fetch", groqAnswers(content));
    const response = await ask({ task: "event-search", text: "music" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "ai_unavailable" });
  });

  it("gives up on a model that doesn't answer in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (...[, init]: [string, RequestInit]) =>
          new Promise((resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation timed out.", "TimeoutError"));
            });
          }),
      ),
    );
    const response = await ask({ task: "event-search", text: "music" });
    expect(response.status).toBe(503);
  }, 10_000);

  it("never logs the key, the request or what the model wrote", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", groqAnswers("my phone is 98765 43210"));
    const response = await ask({ task: "event-search", text: "my email is someone@example.com" });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toBe("[ai] event-search wasn't answered: SyntaxError");
    expect(JSON.stringify(await response.json())).not.toContain(KEY);
  });
});
