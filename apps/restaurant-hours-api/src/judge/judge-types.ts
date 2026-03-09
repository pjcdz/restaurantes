import type { CatalogSnapshot } from "../services/conversation-assistant.js";

/**
 * Test case categories for organizing test results
 */
export type TestCategory =
  | "edge_case"
  | "faq"
  | "greeting"
  | "handoff"
  | "menu"
  | "multi_order"
  | "payment"
  | "resilience"
  | "security"
  | "single_order"
  | "workflow";

/**
 * A single test case to be evaluated
 */
export type TestCase = {
  id: string;
  category: TestCategory;
  description: string;
  messages: Array<string>;
  expectedBehavior: string;
};

/**
 * Token usage tracking
 */
export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

/**
 * Timing metrics
 */
export type TimingMetrics = {
  startTime: number;
  endTime: number;
  latencyMs: number;
};

/**
 * Criteria scores from the judge - 0-100 scale
 */
export type JudgeCriteriaScores = {
  accuracy: number;
  actionability: number;
  completeness: number;
  relevance: number;
  tone: number;
};

/**
 * Raw evaluation result from the judge LLM
 */
export type JudgeEvaluation = {
  overallScore: number;
  reasoning: string;
  criteria: JudgeCriteriaScores;
};

/**
 * Result of a single test execution
 */
export type TestResult = {
  testCase: TestCase;
  passed: boolean;
  actualResponses: Array<string>;
  judgeEvaluation: JudgeEvaluation;
  sutTraceId?: string;
  sutObservationId?: string;
  judgeTraceId?: string;
  judgeObservationId?: string;
  sutTokens: TokenUsage;
  judgeTokens: TokenUsage;
  sutTiming: TimingMetrics;
  judgeTiming: TimingMetrics;
  error?: string;
};

/**
 * Aggregate statistics for a category
 */
export type CategoryStats = {
  category: TestCategory;
  total: number;
  passed: number;
  avgScore: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalTokens: TokenUsage;
};

/**
 * Full test run report
 */
export type TestReport = {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  avgScore: number;
  totalDurationMs: number;
  p95LatencyMs: number;
  totalSutTokens: TokenUsage;
  totalJudgeTokens: TokenUsage;
  categoryStats: Array<CategoryStats>;
  results: Array<TestResult>;
};

/**
 * Judge agent state for LangGraph
 */
export type JudgeState = {
  question: string;
  response: string;
  catalog: CatalogSnapshot;
  evaluation: JudgeEvaluation | null;
  tokens: TokenUsage;
  timing: TimingMetrics;
  error: string | null;
};

/**
 * System Under Test - the conversation assistant
 */
export type SystemUnderTest = {
  sendMessage(chatId: string, message: string): Promise<{ reply: string; tokens: TokenUsage; timing: TimingMetrics; traceId?: string; observationId?: string }>;
  getCatalog(): Promise<CatalogSnapshot>;
};

/**
 * Judge agent interface
 */
export type JudgeAgent = {
  evaluate(input: {
    question: string;
    response: string;
    catalog: CatalogSnapshot;
    category?: TestCategory;
  }): Promise<{ evaluation: JudgeEvaluation; tokens: TokenUsage; timing: TimingMetrics; traceId?: string; observationId?: string }>;
};

/**
 * Test battery generator function type
 */
export type TestBatteryGenerator = (catalog: CatalogSnapshot) => Array<TestCase>;

/**
 * Pass threshold - tests scoring below this fail
 */
export const PASS_THRESHOLD = 75;

/**
 * Minimum score
 */
export const MIN_SCORE = 0;

/**
 * Maximum score
 */
export const MAX_SCORE = 100;
