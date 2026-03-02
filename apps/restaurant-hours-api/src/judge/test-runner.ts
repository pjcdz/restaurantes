import type { CatalogSnapshot } from "../services/conversation-assistant.js";
import type {
  TestCase,
  TestResult,
  TestReport,
  TokenUsage,
  TimingMetrics,
  CategoryStats,
  TestCategory,
  PASS_THRESHOLD
} from "./judge-types.js";
import { generateTestBattery } from "./test-battery.js";
import { createJudgeAgent } from "./judge-agent.js";
import { generateReport } from "./report-generator.js";

/**
 * HTTP client for the system under test
 */
async function callMessageApi(
  baseUrl: string,
  chatId: string,
  message: string
): Promise<{ reply: string; tokens: TokenUsage; timing: TimingMetrics }> {
  const startTime = Date.now();

  const response = await fetch(`${baseUrl}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message })
  });

  const endTime = Date.now();

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    reply: data.reply ?? "",
    tokens: {
      prompt: 0, // API doesn't return token counts
      completion: 0,
      total: 0
    },
    timing: {
      startTime,
      endTime,
      latencyMs: endTime - startTime
    }
  };
}

/**
 * Fetch catalog from admin endpoint
 */
async function fetchCatalog(baseUrl: string): Promise<CatalogSnapshot> {
  const response = await fetch(`${baseUrl}/admin/data`);

  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status}`);
  }

  return response.json();
}

/**
 * Generate a unique chat ID for each test
 */
function generateChatId(testId: string): string {
  return `judge-test-${testId}-${Date.now()}`;
}

/**
 * Run a single test case
 */
async function runTest(
  testCase: TestCase,
  baseUrl: string,
  catalog: CatalogSnapshot
): Promise<TestResult> {
  const judgeAgent = createJudgeAgent();
  const chatId = generateChatId(testCase.id);
  const actualResponses: Array<string> = [];
  let totalSutTokens: TokenUsage = { prompt: 0, completion: 0, total: 0 };
  let totalSutTiming: TimingMetrics = {
    startTime: Date.now(),
    endTime: Date.now(),
    latencyMs: 0
  };

  try {
    // Send each message in the test sequence
    for (const message of testCase.messages) {
      const result = await callMessageApi(baseUrl, chatId, message);
      actualResponses.push(result.reply);

      // Accumulate tokens and timing
      totalSutTokens.prompt += result.tokens.prompt;
      totalSutTokens.completion += result.tokens.completion;
      totalSutTokens.total += result.tokens.total;
      totalSutTiming.latencyMs += result.timing.latencyMs;
    }

    totalSutTiming.endTime = Date.now();

    // Get the last response for evaluation
    const lastResponse = actualResponses[actualResponses.length - 1] ?? "";
    const fullConversation = testCase.messages
      .map((m, i) => `Usuario: ${m}\nBot: ${actualResponses[i] ?? ""}`)
      .join("\n\n");

    // Evaluate with judge
    const judgeResult = await judgeAgent.evaluate({
      question: fullConversation,
      response: lastResponse,
      catalog
    });

    const passed = judgeResult.evaluation.overallScore >= 75;

    return {
      testCase,
      passed,
      actualResponses,
      judgeEvaluation: judgeResult.evaluation,
      sutTokens: totalSutTokens,
      judgeTokens: judgeResult.tokens,
      sutTiming: totalSutTiming,
      judgeTiming: judgeResult.timing
    };
  } catch (error) {
    return {
      testCase,
      passed: false,
      actualResponses,
      judgeEvaluation: {
        overallScore: 0,
        reasoning: `Test execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        criteria: {
          relevance: 0,
          accuracy: 0,
          completeness: 0,
          tone: 0,
          actionability: 0
        }
      },
      sutTokens: totalSutTokens,
      judgeTokens: { prompt: 0, completion: 0, total: 0 },
      sutTiming: totalSutTiming,
      judgeTiming: {
        startTime: Date.now(),
        endTime: Date.now(),
        latencyMs: 0
      },
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Calculate category statistics
 */
function calculateCategoryStats(results: Array<TestResult>): Array<CategoryStats> {
  const categories = new Map<TestCategory, CategoryStats>();

  for (const result of results) {
    const category = result.testCase.category;
    const existing = categories.get(category) ?? {
      category,
      total: 0,
      passed: 0,
      avgScore: 0,
      avgLatencyMs: 0,
      totalTokens: { prompt: 0, completion: 0, total: 0 }
    };

    existing.total += 1;
    if (result.passed) {
      existing.passed += 1;
    }
    existing.avgScore += result.judgeEvaluation.overallScore;
    existing.avgLatencyMs += result.sutTiming.latencyMs + result.judgeTiming.latencyMs;
    existing.totalTokens.prompt += result.sutTokens.prompt + result.judgeTokens.prompt;
    existing.totalTokens.completion += result.sutTokens.completion + result.judgeTokens.completion;
    existing.totalTokens.total += result.sutTokens.total + result.judgeTokens.total;

    categories.set(category, existing);
  }

  // Calculate averages
  return Array.from(categories.values()).map((stats) => ({
    ...stats,
    avgScore: Math.round(stats.avgScore / stats.total),
    avgLatencyMs: Math.round(stats.avgLatencyMs / stats.total)
  }));
}

/**
 * Run all tests and generate report
 */
export async function runTests(baseUrl: string): Promise<TestReport> {
  console.log("🤖 AI-as-a-Judge Test Runner");
  console.log("=".repeat(50));
  console.log(`Target: ${baseUrl}`);
  console.log("");

  // Fetch catalog
  console.log("📂 Fetching catalog...");
  const catalog = await fetchCatalog(baseUrl);
  console.log(`   Found ${catalog.menu.length} products, ${catalog.faq.length} FAQ entries`);

  // Generate test battery
  console.log("🔧 Generating test battery...");
  const testCases = generateTestBattery(catalog);
  console.log(`   Generated ${testCases.length} test cases`);
  console.log("");

  // Run tests
  console.log("🚀 Running tests...\n");
  const results: Array<TestResult> = [];
  const reportStartTime = Date.now();

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;

    process.stdout.write(`${progress} Running ${testCase.id} (${testCase.category})... `);

    const result = await runTest(testCase, baseUrl, catalog);
    results.push(result);

    const status = result.passed ? "✅" : "❌";
    const score = result.judgeEvaluation.overallScore;
    console.log(`${status} Score: ${score}%`);
  }

  const reportEndTime = Date.now();

  // Calculate totals
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.length - passedTests;
  const passRate = Math.round((passedTests / results.length) * 100);
  const avgScore = Math.round(
    results.reduce((sum, r) => sum + r.judgeEvaluation.overallScore, 0) / results.length
  );

  const totalSutTokens: TokenUsage = {
    prompt: results.reduce((sum, r) => sum + r.sutTokens.prompt, 0),
    completion: results.reduce((sum, r) => sum + r.sutTokens.completion, 0),
    total: results.reduce((sum, r) => sum + r.sutTokens.total, 0)
  };

  const totalJudgeTokens: TokenUsage = {
    prompt: results.reduce((sum, r) => sum + r.judgeTokens.prompt, 0),
    completion: results.reduce((sum, r) => sum + r.judgeTokens.completion, 0),
    total: results.reduce((sum, r) => sum + r.judgeTokens.total, 0)
  };

  const report: TestReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passedTests,
    failedTests,
    passRate,
    avgScore,
    totalDurationMs: reportEndTime - reportStartTime,
    totalSutTokens,
    totalJudgeTokens,
    categoryStats: calculateCategoryStats(results),
    results
  };

  console.log("\n");
  generateReport(report);

  return report;
}
