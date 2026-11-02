// @vitest-environment node
/**
 * One Node.js major everywhere: this laptop and CI read .nvmrc, Vercel reads `engines`,
 * and `@types/node` describes the runtime. They drifted once (tests on 22, production on
 * 26, because Vercel reads `>=22` as the newest), so a mismatch fails here.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nvmrc = readFileSync(".nvmrc", "utf8").trim();
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  engines: { node: string };
  devDependencies: Record<string, string>;
};

describe("the Node.js version", () => {
  it("is a single major, written the same for this laptop and CI as for Vercel", () => {
    expect(nvmrc).toMatch(/^\d+$/);
    expect(manifest.engines.node).toBe(`${nvmrc}.x`);
  });

  it("has types for that major", () => {
    expect(/\d+/.exec(manifest.devDependencies["@types/node"] ?? "")?.[0]).toBe(nvmrc);
  });
});
