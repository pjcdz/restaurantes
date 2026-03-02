#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local if it exists
config({ path: resolve(process.cwd(), ".env.local") });

import { runTests } from "../judge/test-runner.js";

/**
 * Entry point for AI-as-a-Judge test runner
 * 
 * Usage: npm run test:judge [baseUrl]
 * 
 * If baseUrl is not provided, defaults to http://localhost:3000
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const baseUrl = args[0] ?? process.env.API_URL ?? "http://localhost:3000";

  try {
    const report = await runTests(baseUrl);

    // Exit with appropriate code (0 for pass, 1 for fail)
    // Note: We always exit 0 since this is just reporting, not blocking CI
    process.exit(0);
  } catch (error) {
    console.error("❌ Test runner failed:");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

main();
