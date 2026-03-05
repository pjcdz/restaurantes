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
import { JwtAuthMiddleware } from "../middleware/jwt-auth.js";
import { uploadJudgeEvaluationToLangfuse } from "../services/langfuse-evals.js";

function toSafeTokenCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

/**
 * HTTP client for the system under test
 */
async function callMessageApi(
  baseUrl: string,
  chatId: string,
  message: string
): Promise<{ reply: string; tokens: TokenUsage; timing: TimingMetrics; traceId?: string; observationId?: string }> {
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
  const metrics = (typeof data === "object" && data !== null && "metrics" in data)
    ? (data as { metrics?: { tokens?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } }).metrics
    : undefined;

  return {
    reply: data.reply ?? "",
    tokens: {
      prompt: toSafeTokenCount(metrics?.tokens?.inputTokens),
      completion: toSafeTokenCount(metrics?.tokens?.outputTokens),
      total: toSafeTokenCount(metrics?.tokens?.totalTokens)
    },
    traceId: typeof data.traceId === "string" ? data.traceId : undefined,
    observationId: typeof data.observationId === "string" ? data.observationId : undefined,
    timing: {
      startTime,
      endTime,
      latencyMs: endTime - startTime
    }
  };
}

/**
 * Fetch catalog from admin endpoint with authentication
 */
async function fetchCatalog(baseUrl: string, authToken: string): Promise<CatalogSnapshot> {
  const response = await fetch(`${baseUrl}/admin/data`, {
    headers: {
      "Authorization": `Bearer ${authToken}`
    }
  });

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
 * Builds conversation context for judge without duplicating the final bot response.
 * The final assistant response is passed separately in `response`.
 */
function buildConversationContext(
  messages: Array<string>,
  responses: Array<string>
): string {
  const lines: Array<string> = [];

  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index] ?? "";
    const botResponse = responses[index] ?? "";
    const isLastTurn = index === messages.length - 1;

    lines.push(`Usuario: ${userMessage}`);

    if (!isLastTurn && botResponse.trim()) {
      lines.push(`Bot: ${botResponse}`);
    }
  }

  return lines.join("\n");
}

/**
 * Run a single test case
 */
async function runTest(
  testCase: TestCase,
  baseUrl: string,
  catalog: CatalogSnapshot,
  runName: string
): Promise<TestResult> {
  const judgeAgent = createJudgeAgent();
  const chatId = generateChatId(testCase.id);
  const actualResponses: Array<string> = [];
  let latestSutTraceId: string | undefined;
  let latestSutObservationId: string | undefined;
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
      latestSutTraceId = result.traceId ?? latestSutTraceId;
      latestSutObservationId = result.observationId ?? latestSutObservationId;

      // Accumulate tokens and timing
      totalSutTokens.prompt += result.tokens.prompt;
      totalSutTokens.completion += result.tokens.completion;
      totalSutTokens.total += result.tokens.total;
      totalSutTiming.latencyMs += result.timing.latencyMs;
    }

    totalSutTiming.endTime = Date.now();

    // Get the last response for evaluation
    const lastResponse = actualResponses[actualResponses.length - 1] ?? "";
    const conversationContext = buildConversationContext(
      testCase.messages,
      actualResponses
    );

    // Evaluate with judge
    const judgeResult = await judgeAgent.evaluate({
      question: conversationContext,
      response: lastResponse,
      catalog,
      category: testCase.category
    });

    const passed = judgeResult.evaluation.overallScore >= 75;

    const judgeTraceId = judgeResult.traceId;
    const judgeObservationId = judgeResult.observationId;

    await uploadJudgeEvaluationToLangfuse({
      testId: testCase.id,
      category: testCase.category,
      description: testCase.description,
      messages: testCase.messages,
      expectedBehavior: testCase.expectedBehavior,
      actualResponse: lastResponse,
      overallScore: judgeResult.evaluation.overallScore,
      criteria: judgeResult.evaluation.criteria,
      reasoning: judgeResult.evaluation.reasoning,
      passed,
      runName,
      sutTraceId: latestSutTraceId,
      judgeTraceId,
      sutObservationId: latestSutObservationId,
      judgeObservationId
    });

    return {
      testCase,
      passed,
      actualResponses,
      sutTraceId: latestSutTraceId,
      sutObservationId: latestSutObservationId,
      judgeTraceId,
      judgeObservationId,
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
      sutTraceId: latestSutTraceId,
      sutObservationId: latestSutObservationId,
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
 * Generate an admin JWT token for test runner authentication
 */
async function generateAdminToken(): Promise<string> {
  const jwtAuth = new JwtAuthMiddleware();
  const adminToken = await jwtAuth.generateToken("judge-test-runner", true, "1h");
  return adminToken;
}

/**
 * Run all tests and generate report
 */
export async function runTests(baseUrl: string): Promise<TestReport> {
  console.log("🔐 Generating admin token...");
  const adminToken = await generateAdminToken();
  
  console.log("📂 Fetching catalog...");
  const catalog = await fetchCatalog(baseUrl, adminToken);
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
  const runName = `judge-run-${new Date(reportStartTime).toISOString()}`;


  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;

    process.stdout.write(`${progress} Running ${testCase.id} (${testCase.category})... `);

    const result = await runTest(testCase, baseUrl, catalog, runName);
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

/**
 * Run tests filtered by category
 * @param baseUrl - The base URL of the API to test
 * @param category - The category to filter tests by
 * @returns Test report with filtered results
 */
export async function runTestsWithFilter(
  baseUrl: string,
  category: TestCategory
): Promise<TestReport> {
  console.log("🔐 Generating admin token...");
  const adminToken = await generateAdminToken();
  
  console.log("📂 Fetching catalog...");
  const catalog = await fetchCatalog(baseUrl, adminToken);
  console.log(`   Found ${catalog.menu.length} products, ${catalog.faq.length} FAQ entries`);

  // Generate test battery and filter by category
  console.log("🔧 Generating test battery...");
  const allTestCases = generateTestBattery(catalog);
  const testCases = allTestCases.filter((tc) => tc.category === category);
  console.log(`   Generated ${allTestCases.length} test cases, filtered to ${testCases.length} for category '${category}'`);
  
  if (testCases.length === 0) {
    console.warn(`⚠️ No tests found for category '${category}'`);
    return {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      passRate: 0,
      avgScore: 0,
      totalDurationMs: 0,
      totalSutTokens: { prompt: 0, completion: 0, total: 0 },
      totalJudgeTokens: { prompt: 0, completion: 0, total: 0 },
      categoryStats: [],
      results: []
    };
  }
  
  console.log("");

  // Run tests
  console.log(`🚀 Running ${testCases.length} tests for category '${category}'...\n`);
  const results: Array<TestResult> = [];
  const reportStartTime = Date.now();
  const runName = `judge-run-${new Date(reportStartTime).toISOString()}`;


  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;

    process.stdout.write(`${progress} Running ${testCase.id} (${testCase.category})... `);

    const result = await runTest(testCase, baseUrl, catalog, runName);
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
