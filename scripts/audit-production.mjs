#!/usr/bin/env node
/**
 * What ships must have no known high-severity vulnerabilities: `npm audit` of the
 * production dependencies, failing on any high or critical advisory, except the few
 * listed below with why they don't apply here. Each says when it was added and when to
 * remove it. Run in CI: node scripts/audit-production.mjs
 */
import { spawnSync } from "node:child_process";

const ACCEPTED = new Map([
  [
    "GHSA-fc5q-39xc-vjpf",
    // Added 18 Nov 2026. A ReDoS in picomatch, widened on 17 Nov to every version, with
    // no fixed release. It reaches the production tree only as vite's, an optional peer
    // of msw, and nothing that runs (in the browser or on the server) loads vite or
    // compiles a glob from input. Remove once picomatch ships a fix.
    "picomatch via vite, an optional peer of msw; not loaded at runtime",
  ],
]);
const FAILING = new Set(["high", "critical"]);

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" });
if (!audit.stdout) {
  console.error(audit.stderr);
  process.exit(1);
}
const { vulnerabilities = {} } = JSON.parse(audit.stdout);

// Every advisory, once: a package vulnerable only through another names it, not the advisory.
const advisories = new Map();
for (const { via } of Object.values(vulnerabilities)) {
  for (const advisory of via) {
    if (typeof advisory === "object") advisories.set(advisory.url, advisory);
  }
}

const failing = [];
for (const advisory of advisories.values()) {
  if (!FAILING.has(advisory.severity)) continue;
  const id = advisory.url.split("/").at(-1);
  if (ACCEPTED.has(id)) console.log(`Accepted ${id} (${advisory.name}): ${ACCEPTED.get(id)}`);
  else failing.push(`${advisory.severity}: ${advisory.name} ${advisory.range}, ${advisory.title} (${advisory.url})`);
}

if (failing.length > 0) {
  console.error(`Production dependencies with known vulnerabilities:\n${failing.join("\n")}`);
  process.exit(1);
}
console.log("No high or critical advisories in the production dependencies, beyond those accepted above.");
