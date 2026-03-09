import { describe, expect, it, vi } from "vitest";

import { generateCompactSummary, generateReport } from "./report-generator.js";
import type { TestReport } from "./judge-types.js";

function buildReport(): TestReport {
  return {
    timestamp: "2026-03-09T00:00:00.000Z",
    totalTests: 2,
    passedTests: 2,
    failedTests: 0,
    passRate: 100,
    avgScore: 92,
    totalDurationMs: 3200,
    p95LatencyMs: 1800,
    totalSutTokens: { prompt: 120, completion: 30, total: 150 },
    totalJudgeTokens: { prompt: 220, completion: 40, total: 260 },
    categoryStats: [
      {
        category: "faq",
        total: 2,
        passed: 2,
        avgScore: 92,
        avgLatencyMs: 1200,
        p95LatencyMs: 1800,
        totalTokens: { prompt: 340, completion: 70, total: 410 }
      }
    ],
    results: [
      {
        testCase: {
          id: "F1",
          category: "faq",
          description: "FAQ question",
          messages: ["Cual es el horario?"],
          expectedBehavior: "Provide hours"
        },
        passed: true,
        actualResponses: ["Abrimos de 11 a 23."],
        judgeEvaluation: {
          overallScore: 92,
          reasoning: "Accurate",
          criteria: {
            relevance: 95,
            accuracy: 95,
            completeness: 90,
            tone: 90,
            actionability: 90
          }
        },
        sutTokens: { prompt: 60, completion: 15, total: 75 },
        judgeTokens: { prompt: 110, completion: 20, total: 130 },
        sutTiming: { startTime: 1, endTime: 501, latencyMs: 500 },
        judgeTiming: { startTime: 502, endTime: 1202, latencyMs: 700 }
      },
      {
        testCase: {
          id: "F2",
          category: "faq",
          description: "FAQ payment",
          messages: ["Como puedo pagar?"],
          expectedBehavior: "Provide payment methods"
        },
        passed: true,
        actualResponses: ["Aceptamos solo efectivo."],
        judgeEvaluation: {
          overallScore: 92,
          reasoning: "Accurate",
          criteria: {
            relevance: 95,
            accuracy: 95,
            completeness: 90,
            tone: 90,
            actionability: 90
          }
        },
        sutTokens: { prompt: 60, completion: 15, total: 75 },
        judgeTokens: { prompt: 110, completion: 20, total: 130 },
        sutTiming: { startTime: 1, endTime: 801, latencyMs: 800 },
        judgeTiming: { startTime: 802, endTime: 1802, latencyMs: 1000 }
      }
    ]
  };
}

describe("report-generator", () => {
  it("prints p95 latency in the detailed report", () => {
    const report = buildReport();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let output = "";

    try {
      generateReport(report);
      output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    } finally {
      logSpy.mockRestore();
    }

    expect(output).toContain("P95 Latency: 1.8s");
    expect(output).toContain("p95: 1.8s");
    expect(output).toContain("System Under Test: 150");
  });

  it("includes p95 latency in the compact summary", () => {
    const summary = generateCompactSummary(buildReport());

    expect(summary).toContain("P95: 1.8s");
    expect(summary).toContain("Tokens: 410");
  });

  it("renders zero SUT tokens as visible metrics instead of N/A", () => {
    const report = {
      ...buildReport(),
      totalSutTokens: { prompt: 0, completion: 0, total: 0 }
    };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let output = "";

    try {
      generateReport(report);
      output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    } finally {
      logSpy.mockRestore();
    }

    expect(output).toContain("System Under Test: 0 (0 prompt + 0 completion)");
  });
});
