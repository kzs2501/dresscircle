// @vitest-environment node
/**
 * Every relative link in the README and the docs reaches a file that exists, and every
 * anchor a heading that exists, as GitHub makes them. The README's code tour is links to
 * source files, so a file that moves or is renamed fails here, before a reader finds it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DOCUMENTS = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ...readdirSync("docs", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.join("docs", file)),
];

const withoutCodeBlocks = (markdown: string) => markdown.replace(/```[\s\S]*?```/g, "");

/** GitHub's heading anchors: lower case, punctuation dropped, each space a hyphen, repeats numbered. */
function anchorsOf(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const [, heading = ""] of withoutCodeBlocks(markdown).matchAll(/^#{1,6} (.+)$/gm)) {
    const base = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/ /g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return anchors;
}

/**
 * Whether a path exists, spelled exactly so. GitHub's links are case-sensitive, and a
 * Mac's disk isn't, so `existsSync` alone would pass a link that's broken on GitHub.
 */
function existsExactly(file: string): boolean {
  // A folder's link may end in a slash: that last, empty segment is no part of the name.
  const segments = path.normalize(file).split(path.sep).filter(Boolean);
  return segments.every((segment, i) => {
    const parent = segments.slice(0, i).join(path.sep) || ".";
    return segment === "." || (existsSync(parent) && readdirSync(parent).includes(segment));
  });
}

/** The targets of a document's links and images, leaving out web and email addresses. */
function relativeLinksIn(markdown: string): string[] {
  return [...withoutCodeBlocks(markdown).matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, target = ""]) => target)
    .filter((target) => !/^(https?:|mailto:)/.test(target));
}

describe("links in the README and the docs", () => {
  it("finds the documents and their links", () => {
    expect(DOCUMENTS.length).toBeGreaterThan(25);
    expect(relativeLinksIn(readFileSync("README.md", "utf8")).length).toBeGreaterThan(40);
  });

  it.each(DOCUMENTS)("%s links only to files and headings that exist", (document) => {
    const broken = relativeLinksIn(readFileSync(document, "utf8")).filter((link) => {
      const [target = "", anchor] = decodeURIComponent(link).split("#");
      const file = target === "" ? document : path.join(path.dirname(document), target);
      if (!existsExactly(file)) return true;
      return anchor !== undefined && file.endsWith(".md") && !anchorsOf(readFileSync(file, "utf8")).has(anchor);
    });
    expect(broken).toEqual([]);
  });
});
