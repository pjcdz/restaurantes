import type { TestReport, TestResult, CategoryStats, TokenUsage } from "./judge-types.js";

/**
 * Format token usage for display
 */
function formatTokens(tokens: TokenUsage): string {
  if (tokens.total === 0) {
    return "N/A";
  }
  return `${tokens.total.toLocaleString()} (${tokens.prompt.toLocaleString()} prompt + ${tokens.completion.toLocaleString()} completion)`;
}

/**
 * Format duration in seconds
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Get category display name
 */
function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    edge_case: "Edge Cases",
    faq: "FAQ",
    greeting: "Greetings",
    handoff: "Human Handoff",
    menu: "Menu",
    multi_order: "Multi-Item Orders",
    payment: "Payment",
    resilience: "Resilience",
    security: "Security",
    single_order: "Single Orders",
    workflow: "Workflows"
  };
  return names[category] ?? category;
}

/**
 * Get score color indicator
 */
function getScoreIndicator(score: number): string {
  if (score >= 90) return "🟢";
  if (score >= 75) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
}

/**
 * Generate and print the test report to console
 */
export function generateReport(report: TestReport): void {
  const line = "═".repeat(60);
  const separator = "─".repeat(60);

  console.log(line);
  console.log("📊 AI-as-a-Judge Test Report");
  console.log(line);
  console.log(`Run Date: ${report.timestamp}`);
  console.log(`Total Tests: ${report.totalTests}`);
  console.log("");

  // Summary section
  console.log("SUMMARY");
  console.log(separator);
  console.log(`Average Score: ${report.avgScore}%`);
  console.log(`Pass Rate: ${report.passRate}% (${report.passedTests}/${report.totalTests} tests scored ≥75%)`);
  console.log(`Total Duration: ${formatDuration(report.totalDurationMs)}`);
  console.log("");

  // Token usage
  console.log("TOKEN USAGE");
  console.log(separator);
  console.log(`System Under Test: ${formatTokens(report.totalSutTokens)}`);
  console.log(`Judge Agent:       ${formatTokens(report.totalJudgeTokens)}`);
  const totalTokens: TokenUsage = {
    prompt: report.totalSutTokens.prompt + report.totalJudgeTokens.prompt,
    completion: report.totalSutTokens.completion + report.totalJudgeTokens.completion,
    total: report.totalSutTokens.total + report.totalJudgeTokens.total
  };
  console.log(`Total:             ${formatTokens(totalTokens)}`);
  console.log("");

  // Category breakdown
  console.log("CATEGORY BREAKDOWN");
  console.log(separator);

  const sortedCategories = [...report.categoryStats].sort((a, b) =>
    a.category.localeCompare(b.category)
  );

  for (const stats of sortedCategories) {
    const passRate = Math.round((stats.passed / stats.total) * 100);
    const indicator = getScoreIndicator(stats.avgScore);
    console.log(
      `${indicator} ${getCategoryDisplayName(stats.category).padEnd(18)} ` +
      `${stats.passed}/${stats.total} passed (${passRate}%) | ` +
      `avg: ${stats.avgScore}% | ` +
      `latency: ${formatDuration(stats.avgLatencyMs)}`
    );
  }
  console.log("");

  // Failed tests section
  const failedTests = report.results.filter((r) => !r.passed);
  if (failedTests.length > 0) {
    console.log("FAILED TESTS");
    console.log(separator);

    for (const result of failedTests) {
      console.log(`[${result.testCase.id}] ${result.testCase.description}`);
      console.log(`  Score: ${result.judgeEvaluation.overallScore}%`);
      console.log(`  Reason: ${result.judgeEvaluation.reasoning}`);
      console.log("");
    }
  }

  // Detailed results section
  console.log("DETAILED RESULTS");
  console.log(separator);

  for (const result of report.results) {
    const indicator = result.passed ? "✅" : "❌";
    const scoreIndicator = getScoreIndicator(result.judgeEvaluation.overallScore);

    console.log(`${indicator} [${result.testCase.id}] ${result.testCase.description}`);
    console.log(`   Category: ${getCategoryDisplayName(result.testCase.category)}`);
    console.log(`   Score: ${scoreIndicator} ${result.judgeEvaluation.overallScore}%`);

    // Show criteria breakdown
    const criteria = result.judgeEvaluation.criteria;
    console.log(
      `   Criteria: R:${criteria.relevance} A:${criteria.accuracy} ` +
      `C:${criteria.completeness} T:${criteria.tone} Ac:${criteria.actionability}`
    );

    // Show first message and response
    const firstMessage = result.testCase.messages[0];
    const firstResponse = result.actualResponses[0] ?? "";
    const truncatedResponse = firstResponse.length > 100
      ? firstResponse.substring(0, 100) + "..."
      : firstResponse;

    console.log(`   Message: "${firstMessage}"`);
    console.log(`   Response: "${truncatedResponse}"`);

    // Show timing
    const totalLatency = result.sutTiming.latencyMs + result.judgeTiming.latencyMs;
    console.log(`   Latency: ${formatDuration(totalLatency)} (SUT: ${formatDuration(result.sutTiming.latencyMs)}, Judge: ${formatDuration(result.judgeTiming.latencyMs)})`);

    // Show reasoning
    console.log(`   Reasoning: ${result.judgeEvaluation.reasoning}`);
    console.log("");
  }

  // Final summary
  console.log(line);
  if (report.passRate >= 75) {
    console.log(`✅ OVERALL: PASSED (${report.passRate}% pass rate, avg score ${report.avgScore}%)`);
  } else {
    console.log(`❌ OVERALL: FAILED (${report.passRate}% pass rate, avg score ${report.avgScore}%)`);
  }
  console.log(line);
}

/**
 * Generate a compact summary for CI/CD
 */
export function generateCompactSummary(report: TestReport): string {
  const lines: Array<string> = [
    `AI-as-a-Judge Results: ${report.passedTests}/${report.totalTests} passed (${report.passRate}%)`,
    `Average Score: ${report.avgScore}%`,
    `Duration: ${formatDuration(report.totalDurationMs)}`,
    `Tokens: ${formatTokens({ prompt: report.totalSutTokens.prompt + report.totalJudgeTokens.prompt, completion: report.totalSutTokens.completion + report.totalJudgeTokens.completion, total: report.totalSutTokens.total + report.totalJudgeTokens.total })}`
  ];

  return lines.join(" | ");
}
