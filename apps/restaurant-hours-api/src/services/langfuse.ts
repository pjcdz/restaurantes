import type { Tracer } from "@opentelemetry/api";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { getLangfuseSettings } from "../config.js";

type LangfuseTelemetryState = {
  provider: NodeTracerProvider;
  tracer: Tracer;
};

let cachedTelemetryState: LangfuseTelemetryState | null | undefined;

export function getLangfuseTracer(): Tracer | undefined {
  const telemetryState = getLangfuseTelemetryState();

  return telemetryState?.tracer;
}

export async function forceFlushLangfuseTelemetry(): Promise<void> {
  const telemetryState = getLangfuseTelemetryState();

  if (!telemetryState) {
    return;
  }

  try {
    await telemetryState.provider.forceFlush();
  } catch (error) {
    console.error("Langfuse telemetry flush failed.", error);
  }
}

export async function flushLangfuseAfter<T>(
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } finally {
    await forceFlushLangfuseTelemetry();
  }
}

function getLangfuseTelemetryState(): LangfuseTelemetryState | null {
  if (cachedTelemetryState !== undefined) {
    return cachedTelemetryState;
  }

  const settings = getLangfuseSettings();

  if (!settings) {
    cachedTelemetryState = null;
    return null;
  }

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: settings.publicKey,
        secretKey: settings.secretKey,
        baseUrl: settings.baseUrl,
        environment: settings.tracingEnvironment,
        release: settings.release
      })
    ]
  });

  cachedTelemetryState = {
    provider,
    tracer: provider.getTracer("restaurant-hours-api")
  };

  return cachedTelemetryState;
}
