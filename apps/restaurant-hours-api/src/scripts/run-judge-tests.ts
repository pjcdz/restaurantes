#!/usr/bin/env node

/**
 * IMPORTANT: dotenv must be loaded BEFORE any module that reads environment variables.
 * ES modules are statically analyzed and imports are hoisted, so we use dynamic imports
 * to ensure dotenv loads first.
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const { runTests, runTestsWithFilter } = await import("../judge/test-runner.js");
const { generateCompactSummary } = await import("../judge/report-generator.js");
const { forceFlushLangfuseTelemetry, tracingService } = await import("../services/langfuse.js");
const { flushLangfuseEvaluations } = await import("../services/langfuse-evals.js");
const { getLangfuseSettings, getLangfuseJudgeDatasetName } = await import("../config.js");

import type { TestCategory } from "../judge/judge-types.js";

interface CliOptions {
  baseUrl: string;
  category: TestCategory | null;
  verbose: boolean;
  jsonOutput: string | null;
  help: boolean;
}

function parseArgs(args: Array<string>): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.API_URL ?? "http://localhost:3000",
    category: null,
    verbose: false,
    jsonOutput: null,
    help: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--category" || arg === "-c") {
      const category = args[++i];
      if (category) {
        options.category = category as TestCategory;
      }
    } else if (arg === "--json" || arg === "-j") {
      options.jsonOutput = args[++i] ?? "judge-report.json";
    } else if (arg === "--url" || arg === "-u") {
      const url = args[++i];
      if (url) {
        options.baseUrl = url;
      }
    } else if (!arg.startsWith("-")) {
      options.baseUrl = arg;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
AI-as-a-Judge Test Runner

Usage: npm run test:judge [options] [baseUrl]

Options:
  -h, --help              Show this help message
  -v, --verbose           Enable verbose output with detailed test results
  -c, --category <name>   Run only tests from a specific category
                          Categories: greeting, faq, menu, single_order,
                                      multi_order, workflow, edge_case,
                                      payment, handoff, security, resilience
  -j, --json [file]       Output results as JSON to file (default: judge-report.json)
  -u, --url <url>         Base URL of the API to test (default: http://localhost:3000)

Examples:
  npm run test:judge
  npm run test:judge https://api.example.com
  npm run test:judge --category payment
  npm run test:judge --verbose
  npm run test:judge --json report.json
  npm run test:judge -c greeting -v -j results.json

Exit Codes:
  0 - All tests passed (pass rate >= 75%)
  1 - Test execution error or no tests ran
  2 - Some tests failed (pass rate < 75%)
`);
}

function printLangfuseNavigationHints(): void {
  const settings = getLangfuseSettings();
  if (!settings) {
    return;
  }

  const datasetName = getLangfuseJudgeDatasetName();
  console.log("\nLangfuse navigation:");
  console.log("- Tracing: filter by observation name 'llm.google.judge-evaluate'.");
  console.log("- Scores: filter by score names starting with 'judge.'.");
  console.log(`- Datasets: open dataset '${datasetName}' and compare run items.`);
  console.log("- LLM-as-a-Judge tab lists Evaluators created in Langfuse UI.");
  console.log("  This runner sends scores + datasets via API and does not auto-create UI evaluators.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const isTracingEnabled = tracingService.isEnabled();
  console.log(`DIAGNOSTIC: Langfuse tracing enabled: ${isTracingEnabled}`);
  if (!isTracingEnabled) {
    console.log("DIAGNOSTIC: Tracing is disabled. Check LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.");
  }

  console.log("AI-as-a-Judge Test Runner");
  console.log("=".repeat(50));
  console.log(`Target: ${options.baseUrl}`);

  if (options.category) {
    console.log(`Category Filter: ${options.category}`);
  }

  if (options.verbose) {
    console.log("Verbose Mode: enabled");
  }

  if (options.jsonOutput) {
    console.log(`JSON Output: ${options.jsonOutput}`);
  }

  console.log("");

  try {
    const report = options.category
      ? await runTestsWithFilter(options.baseUrl, options.category)
      : await runTests(options.baseUrl);

    if (options.jsonOutput) {
      const jsonReport = JSON.stringify(report, null, 2);
      writeFileSync(options.jsonOutput, jsonReport, "utf-8");
      console.log(`\nJSON report saved to: ${options.jsonOutput}`);
    }

    console.log("\n" + generateCompactSummary(report));
    printLangfuseNavigationHints();

    console.log("\nDIAGNOSTIC: Attempting to flush Langfuse traces...");
    const flushStartTime = Date.now();

    await forceFlushLangfuseTelemetry();
    await flushLangfuseEvaluations();

    const flushDuration = Date.now() - flushStartTime;
    console.log(`DIAGNOSTIC: Flush completed in ${flushDuration}ms`);

    if (report.totalTests === 0) {
      console.error("\nNo tests were executed");
      process.exit(1);
    } else if (report.passRate >= 75) {
      console.log("\nTest run completed successfully");
      process.exit(0);
    } else {
      console.error("\nTest run failed - pass rate below threshold");
      process.exit(2);
    }
  } catch (error) {
    console.error("Test runner failed:");
    console.error(error instanceof Error ? error.message : "Unknown error");

    if (options.verbose && error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    console.log("\nDIAGNOSTIC: Attempting to flush Langfuse traces (on error)...");
    await forceFlushLangfuseTelemetry();
    await flushLangfuseEvaluations();
    console.log("DIAGNOSTIC: Flush completed");

    process.exit(1);
  }
}

main();