/**
 * The in-browser sandbox: one simulated server per browser tab, persisted to
 * sessionStorage so a refresh resumes exactly where the visitor was.
 *
 * MSW runs request handlers in the page, not in the service worker, so the
 * server's memory is the page's memory. Without persistence a reload would wipe
 * every hold and order — and lose any webhook still waiting to be delivered. With
 * it, the outbox survives the reload and the runtime picks up where it left off.
 */
import { createBackend, type Backend } from "@/backend/backend";
import { createInitialState, deserializeState, SANDBOX_STORAGE_KEY, serializeState } from "@/backend/domain/state";
import { signDemoTicket } from "@/core/demo-ticket-key";
import { STORAGE_KEYS } from "@/core/persisted-names";

let sandboxInstance: Backend | null = null;

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

/** 256 random bits, base64url: far beyond guessing (OWASP asks for at least 64 bits of entropy). */
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function load() {
  try {
    return deserializeState(sessionStorage.getItem(SANDBOX_STORAGE_KEY));
  } catch {
    return null; // storage blocked: the sandbox just won't survive a reload
  }
}

function save(sandbox: Backend) {
  try {
    sessionStorage.setItem(SANDBOX_STORAGE_KEY, serializeState(sandbox.getState()));
  } catch {
    // Quota or privacy mode — nothing useful to do.
  }
}

/** End-to-end tests keep the simulated buyers out, so stock moves only when a test moves it. */
function isCrowdQuiet() {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.quietCrowd) === "1";
  } catch {
    return false;
  }
}

/**
 * Keeps time-based behaviour running: delivers webhooks when they're due, lets the crowd
 * buy tickets while that preset is on, and the simulated buyers now and then.
 */
function startRuntime(sandbox: Backend) {
  let webhookTimer: ReturnType<typeof setTimeout> | undefined;
  let crowdTimer: ReturnType<typeof setInterval> | undefined;
  let crowdIntervalMs = 0;
  let ambientTimer: ReturnType<typeof setInterval> | undefined;
  let ambientIntervalMs = 0;
  const isQuiet = isCrowdQuiet();

  const schedule = () => {
    clearTimeout(webhookTimer);
    const dueAtMs = sandbox.nextDeliveryAtMs();
    if (dueAtMs !== null) {
      webhookTimer = setTimeout(() => sandbox.deliverDue(), Math.max(0, dueAtMs - Date.now()));
    }

    // Restart the crowd when it's switched on or off, or its pace changes with the preset.
    const { isCrowdEnabled, crowdIntervalMs: pace } = sandbox.chaos();
    const wanted = isCrowdEnabled ? pace : 0;
    if (wanted !== crowdIntervalMs) {
      clearInterval(crowdTimer);
      crowdTimer = wanted ? setInterval(() => sandbox.runCrowdTick(), wanted) : undefined;
      crowdIntervalMs = wanted;
    }

    const ambient = isQuiet ? 0 : (sandbox.chaos().ambientCrowdIntervalMs ?? 0);
    if (ambient !== ambientIntervalMs) {
      clearInterval(ambientTimer);
      ambientTimer = ambient ? setInterval(() => sandbox.runAmbientTick(), ambient) : undefined;
      ambientIntervalMs = ambient;
    }
  };

  sandbox.subscribe(() => {
    save(sandbox);
    schedule();
  });
  if (!isQuiet) sandbox.backfillAmbientCrowd();
  schedule(); // resume: deliver anything that came due while the page was closed
}

/** The tab's sandbox, created (and restored) on first use. Browser only. */
export function getSandbox(): Backend {
  if (!sandboxInstance) {
    sandboxInstance = createBackend(
      { now: Date.now, newId, newToken, random: Math.random, signTicket: signDemoTicket },
      load() ?? createInitialState("happy", Date.now()),
    );
    startRuntime(sandboxInstance);
  }
  return sandboxInstance;
}
