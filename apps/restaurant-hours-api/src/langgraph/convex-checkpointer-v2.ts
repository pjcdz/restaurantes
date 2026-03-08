/**
 * Convex Checkpointer V2 - SRS v4
 *
 * Mejoras al checkpointer original para persistencia mejorada:
 * - Mejor manejo de versiones
 * - Soporte para metadata
 * - Namespace support para subgrafos
 * - Timestamps ISO 8601
 */

import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  SerializerProtocol
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

import {
  type ConversationCheckpoint,
  type ConversationRepository
} from "../services/conversation-assistant.js";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for checkpointer v2 operations.
 */
const logger = new Logger({ service: "convex-checkpointer-v2" });

/**
 * Checkpoint ID generator V2 - Creates more deterministic IDs.
 * Uses format: {threadId}:{timestamp}:{sequence}
 */
function generateCheckpointIdV2(threadId: string, sequence: number): string {
  const timestamp = Date.now().toString(36);
  return `${threadId}:${timestamp}:${sequence}`;
}

/**
 * Session ID extraction helper - Same as V1.
 */
function getSessionId(
  config: RunnableConfig,
  checkpoint?: Checkpoint
): string | undefined {
  const configSessionId = config.configurable?.["session_id"] as string | undefined;

  if (configSessionId) {
    return configSessionId;
  }

  const session = checkpoint?.channel_values?.session as { id: string } | undefined;
  return session?.id;
}

/**
 * Convert LangGraph checkpoint to persisted conversation state V2.
 * Extracts relevant fields for restoration with enhanced metadata.
 */
function checkpointToPersistedStateV2(
  checkpoint: Checkpoint,
  metadata?: CheckpointMetadata
): Record<string, unknown> {
  return {
    intent: checkpoint.channel_values?.intent ?? null,
    orderDraft: checkpoint.channel_values?.orderDraft ?? null,
    lastHandledAt: checkpoint.channel_values?.lastHandledAt ?? null,
    lastHandledMessage: checkpoint.channel_values?.lastHandledMessage ?? null,
    lastResponseText: checkpoint.channel_values?.lastResponseText ?? null,
    threadId: checkpoint.channel_values?.threadId ?? null,
    chatId: checkpoint.channel_values?.chatId ?? null,
    // SRS v4: Agregar metadata adicional para trazabilidad mejorada
    version: checkpoint.v?.toString() ?? "4",
    checkpointId: checkpoint.id ?? "",
    source: metadata?.source ?? "unknown",
    step: metadata?.step ?? 0
  };
}

/**
 * Convert persisted conversation state to LangGraph checkpoint V2.
 * Reconstructs checkpoint from stored state with full metadata support.
 */
function persistedStateToCheckpointV2(
  persisted: Record<string, unknown>,
  threadId: string
): Checkpoint {
  // SRS v4: Usar version 4 de checkpoint
  const persistedCheckpointId =
    typeof persisted.checkpointId === "string" ? persisted.checkpointId : undefined;
  const checkpointId = persistedCheckpointId ?? generateCheckpointIdV2(threadId, 0);

  return {
    v: 4,
    id: checkpointId,
    ts: new Date().toISOString(),
    channel_values: {
      intent: persisted.intent ?? null,
      orderDraft: persisted.orderDraft ?? null,
      lastHandledMessage: persisted.lastHandledMessage ?? null,
      lastHandledAt: persisted.lastHandledAt ?? null,
      lastResponseText: persisted.lastResponseText ?? null,
      threadId,
      chatId: persisted.chatId ?? null,
      catalog: null,
      messageText: "",
      requestedActions: [],
      wantsMenu: false,
      extractedOrderLines: [],
      validatedOrderLines: [],
      invalidOrderLines: [],
      isDuplicate: false,
      isHandedOff: false,
      duplicateResponseText: "",
      draftReply: "",
      responseText: "",
      traceContext: null,
      // SRS v4: Campos adicionales para soporte extendido
      paymentIntent: null,
      paymentAmount: null,
      paymentConfirmed: false
    },
    channel_versions: {},
    versions_seen: {}
  };
}

/**
 * SRS v4: Tipo extendido de checkpoint con metadatos
 */
type PersistedConversationStateV2 = {
  intent: any;
  orderDraft: any;
  threadId: string | null;
  lastHandledAt: number | null;
  lastHandledMessage: string | null;
  lastResponseText: string | null;
  chatId: string | null;
  // SRS v4: Metadatos adicionales
  version?: string;
  checkpointId?: string;
  source?: string;
  step?: number;
  namespace?: string;
};

/**
 * SRS v4: Tipo extendido de input para guardar checkpoint
 */
type SaveCheckpointInputV2 = Omit<ConversationCheckpoint, "id"> & {
  ts: string;
  versions: string;
  versionsSeen: string;
  metadata?: string;
  namespace?: string;
};

/**
 * SRS v4: Tipo extendido de checkpoint recuperado
 */
type RetrievedCheckpointV2 = Omit<ConversationCheckpoint, "id"> & {
  ts: string;
  versions: string;
  versionsSeen: string;
  metadata?: string;
  namespace?: string;
};

function parsePersistedCheckpoint(
  checkpointRecord: ConversationCheckpoint
): PersistedConversationStateV2 {
  try {
    const parsed = checkpointRecord.checkpoint
      ? JSON.parse(checkpointRecord.checkpoint) as Record<string, unknown>
      : {};
    return parsed as PersistedConversationStateV2;
  } catch (error) {
    logger.error("Failed to parse checkpoint JSON from Convex V2", undefined, undefined, {
      threadId: checkpointRecord.threadId,
      sessionId: checkpointRecord.sessionId,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError", message: String(error) }
    });

    return {
      intent: null,
      orderDraft: null,
      threadId: checkpointRecord.threadId,
      lastHandledAt: null,
      lastHandledMessage: null,
      lastResponseText: null,
      chatId: null,
      version: "4",
      checkpointId: undefined,
      source: "input",
      step: 0,
      namespace: checkpointRecord.namespace ?? ""
    };
  }
}

function normalizeCheckpointSource(
  source: unknown
): CheckpointMetadata["source"] {
  return source === "fork" || source === "input" || source === "loop" || source === "update"
    ? source
    : "input";
}

/**
 * SRS v4: Generate checkpoint ID from version string
 */
function parseCheckpointId(id: string): { threadId: string; timestamp: number; sequence: number } | null {
  const parts = id.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [threadId, timestampStr, sequenceStr] = parts;

  const timestamp = parseInt(timestampStr, 36);
  const sequence = parseInt(sequenceStr, 10);

  if (isNaN(timestamp) || isNaN(sequence)) {
    return null;
  }

  return { threadId, timestamp, sequence };
}

/**
 * SRS v4: Convex-backed checkpointer V2 for LangGraph.
 *
 * Mejoras sobre la versión original:
 * - Mejor manejo de versiones y timestamps
 * - Soporte para metadata extendida
 * - Namespace support para subgrafos
 * - Logging mejorado para depuración
 * - Manejo de errores más robusto
 */
export class ConvexCheckpointerV2 extends BaseCheckpointSaver<number> {
  constructor(
    private readonly repository: ConversationRepository,
    serde?: SerializerProtocol
  ) {
    super(serde);

    if (!repository.upsertSessionByChatId || !repository.getLatestCheckpoint || !repository.saveCheckpoint) {
      throw new Error("Repository must implement ConversationRepository interface");
    }
  }

  /**
   * SRS v4: Retrieve checkpoint from Convex V2.
   */
  async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const sessionId = getSessionId(config);

    if (!sessionId) {
      return undefined;
    }

    try {
      const latestCheckpoint = await this.repository.getLatestCheckpoint(sessionId);

      if (!latestCheckpoint) {
        return undefined;
      }

      const checkpointData = parsePersistedCheckpoint(latestCheckpoint);

      return persistedStateToCheckpointV2(
        checkpointData,
        latestCheckpoint.threadId ??
          (config.configurable?.["thread_id"] as string | undefined) ??
          ""
      );
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;

      logger.error("Failed to retrieve checkpoint from Convex V2", undefined, undefined, {
        sessionId,
        threadId: config.configurable?.["thread_id"],
        error: errorObj
      });

      return undefined;
    }
  }

  /**
   * SRS v4: Retrieve checkpoint tuple with metadata V2.
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const checkpoint = await this.get(config);

    if (!checkpoint) {
      return undefined;
    }

    const retrievedCheckpoint = await this.repository.getLatestCheckpoint(
      getSessionId(config) ?? ""
    );

    const checkpointData = retrievedCheckpoint
      ? parsePersistedCheckpoint(retrievedCheckpoint)
      : undefined;

    return {
      config,
      checkpoint,
      metadata: {
        source: normalizeCheckpointSource(checkpointData?.source),
        step: checkpointData?.step ?? 0,
        parents: {}
      }
    };
  }

  /**
   * SRS v4: List checkpoints for a thread V2.
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple, void, unknown> {
    const sessionId = getSessionId(config);

    if (!sessionId) {
      return;
    }

    try {
      const latestCheckpoint = await this.repository.getLatestCheckpoint(sessionId);

      if (!latestCheckpoint) {
        return;
      }

      const checkpointData = parsePersistedCheckpoint(latestCheckpoint);

      const checkpoint = persistedStateToCheckpointV2(
        checkpointData,
        latestCheckpoint.threadId ??
          (config.configurable?.["thread_id"] as string | undefined) ??
          ""
      );

      yield {
        config,
        checkpoint,
        metadata: {
          source: normalizeCheckpointSource(checkpointData?.source),
          step: checkpointData?.step ?? 0,
          parents: {}
        }
      };
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;

      logger.error("Failed to list checkpoints from Convex V2", undefined, undefined, {
        sessionId,
        threadId: config.configurable?.["thread_id"],
        error: errorObj
      });
    }
  }

  /**
   * SRS v4: Save checkpoint to Convex V2.
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.["thread_id"] as string | undefined;

    if (!threadId) {
      logger.warn("Skipping checkpoint save V2: missing thread_id in config", undefined, {
        configurable: config.configurable
      });
      return config;
    }

    const sessionId = getSessionId(config, checkpoint);

    if (!sessionId) {
      logger.warn("Skipping checkpoint save V2: missing session_id", undefined, {
        threadId,
        checkpointId: checkpoint.id
      });
      return config;
    }

    try {
      const persistedState = checkpointToPersistedStateV2(checkpoint, metadata);

      const saveInput: SaveCheckpointInputV2 = {
        sessionId,
        threadId,
        checkpoint: JSON.stringify(persistedState),
        createdAt: Date.now(),
        // SRS v4: Campos adicionales para mejor trazabilidad
        ts: checkpoint.ts,
        versions: JSON.stringify(newVersions),
        versionsSeen: JSON.stringify({}),
        metadata: JSON.stringify({
          ...metadata,
          version: persistedState.version,
          timestamp: new Date().toISOString(),
          source: metadata?.source || "input",
          step: metadata?.step || 0,
          threadId,
          namespace: config.configurable?.["namespace"] as string || ""
        }),
        namespace: config.configurable?.["namespace"] as string || ""
      };

      await this.repository.saveCheckpoint(saveInput);

      logger.debug("Checkpoint saved successfully V2", undefined, {
        sessionId,
        threadId,
        checkpointId: checkpoint.id,
        source: metadata?.source,
        step: metadata?.step
      });
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;

      logger.error("Failed to save checkpoint to Convex V2", undefined, undefined, {
        sessionId,
        threadId,
        checkpointId: checkpoint.id,
        error: errorObj
      });

      // No arrojar - permitir que el grafo continúe
    }

    return {
      ...config,
      configurable: {
        ...config.configurable,
        session_id: sessionId
      }
    };
  }

  /**
   * SRS v4: Store intermediate writes linked to a checkpoint.
   * Mejorado con mejor manejo de errores.
   */
  async putWrites(
    config: RunnableConfig,
    writes: unknown[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.["thread_id"] as string | undefined;

    if (!threadId) {
      logger.debug("putWrites called V2 without thread_id", undefined, {
        taskId,
        writesCount: writes.length
      });
      return;
    }

    logger.debug("putWrites called V2 (not implemented - stores in checkpoint)", undefined, {
      threadId,
      taskId,
      writesCount: writes.length
    });

    // No implementando writes por ahora - se almacenan en el checkpoint principal
  }

  /**
   * SRS v4: Delete all checkpoints and writes associated with a specific thread ID.
   */
  async deleteThread(threadId: string): Promise<void> {
    logger.debug("deleteThread called V2", undefined, {
      threadId
    });

    // No implementando por ahora - podría requerir mutación adicional en Convex
  }

  /**
   * SRS v4: Generate next version ID for a channel.
   */
  getNextVersion(current: number | undefined): number {
    return (current ?? 0) + 1;
  }

  /**
   * SRS v4: Get repository method for session management.
   */
  getRepository(): ConversationRepository {
    return this.repository;
  }
}

/**
 * SRS v4: Factory function to create a ConvexCheckpointerV2 instance.
 */
export function createConvexCheckpointerV2(
  repository: ConversationRepository,
  serde?: SerializerProtocol
): ConvexCheckpointerV2 {
  return new ConvexCheckpointerV2(repository, serde);
}
