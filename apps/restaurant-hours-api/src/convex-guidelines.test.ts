import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FUNCTION_PATTERN =
  /export const\s+([A-Za-z0-9_]+)\s*=\s*(query|mutation|internalQuery|internalMutation|action|internalAction)\s*\(\s*\{/g;

type FunctionMatch = {
  name: string;
  kind: string;
  section: string;
};

function readConvexSourceFiles(): Array<{ filePath: string; source: string }> {
  const convexDir = resolve(process.cwd(), "convex");
  const fileNames = readdirSync(convexDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        !name.startsWith("_generated") &&
        !name.endsWith(".d.ts")
    );

  return fileNames.map((name) => {
    const filePath = join(convexDir, name);
    return {
      filePath,
      source: readFileSync(filePath, "utf8")
    };
  });
}

function extractFunctions(source: string): Array<FunctionMatch> {
  const rawMatches = Array.from(source.matchAll(FUNCTION_PATTERN));
  return rawMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end =
      index + 1 < rawMatches.length
        ? (rawMatches[index + 1].index ?? source.length)
        : source.length;

    return {
      name: match[1],
      kind: match[2],
      section: source.slice(start, end)
    };
  });
}

describe("Convex guideline compliance", () => {
  it("ensures every Convex function declares args and returns validators", () => {
    const files = readConvexSourceFiles();
    const violations: Array<string> = [];

    for (const file of files) {
      const functions = extractFunctions(file.source);

      for (const fn of functions) {
        const handlerIndex = fn.section.search(/\bhandler\s*:/);
        const declarationPrefix =
          handlerIndex >= 0 ? fn.section.slice(0, handlerIndex) : fn.section;
        const hasArgs = /\bargs\s*:/.test(declarationPrefix);
        const hasReturns = /\breturns\s*:/.test(declarationPrefix);

        if (!hasArgs || !hasReturns) {
          violations.push(
            `${file.filePath} -> ${fn.name} (${fn.kind}) missing ${[
              !hasArgs ? "args" : null,
              !hasReturns ? "returns" : null
            ]
              .filter((item): item is string => item !== null)
              .join(" and ")}`
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
