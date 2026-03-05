import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { getTelegramBotToken } from "./config";
import { resolvePort } from "./server";

describe("resolvePort", () => {
  it("returns the provided port when it is valid", () => {
    expect(resolvePort("4321")).toBe(4321);
  });

  it("falls back to 3000 when the port is missing", () => {
    expect(resolvePort(undefined)).toBe(3000);
  });
});

describe("server startup", () => {
  it("loads TELEGRAM_BOT_TOKEN from .env.local", async () => {
    const originalCwd = process.cwd();
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const tempDir = mkdtempSync(join(tmpdir(), "restaurant-hours-api-"));

    try {
      writeFileSync(
        join(tempDir, ".env.local"),
        "TELEGRAM_BOT_TOKEN=test-from-dotenv-local\n",
        "utf8"
      );
      delete process.env.TELEGRAM_BOT_TOKEN;
      process.chdir(tempDir);

      await import(
        `${pathToFileURL(resolve(originalCwd, "src/server.ts")).href}?test=${Date.now()}`
      );

      expect(getTelegramBotToken()).toBe("test-from-dotenv-local");
    } finally {
      process.chdir(originalCwd);

      if (originalToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not overwrite TELEGRAM_BOT_TOKEN when already set in process.env", async () => {
    const originalCwd = process.cwd();
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    const tempDir = mkdtempSync(join(tmpdir(), "restaurant-hours-api-"));

    try {
      writeFileSync(
        join(tempDir, ".env.local"),
        "TELEGRAM_BOT_TOKEN=test-from-dotenv-local\n",
        "utf8"
      );
      process.env.TELEGRAM_BOT_TOKEN = "already-set-in-process";
      process.chdir(tempDir);

      await import(
        `${pathToFileURL(resolve(originalCwd, "src/server.ts")).href}?test=${Date.now()}`
      );

      expect(getTelegramBotToken()).toBe("already-set-in-process");
    } finally {
      process.chdir(originalCwd);

      if (originalToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
