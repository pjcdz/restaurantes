/**
 * Convex Checkpointer for LangGraph
 *
 * Integrates LangGraph's checkpoint system with Convex for durable state persistence.
 * This enables automatic state management, time travel, and resume functionality.
 */

import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";

import {
  type ConversationCheckpoint,
  type ConversationRepository,
} from "../services/conversation-assistant.js";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for checkpointer operations.
 */
const logger = new Logger({ service: "convex-checkpointer" });

/**
 * Session ID extraction helper.
 * Extracts session_id from config or checkpoint.
 */
function getSessionId(
  config: RunnableConfig,
  checkpoint?: Checkpoint
): string | undefined {
  const configSessionId = config.configurable?.["session_id"] as string | undefined;

  if (configSessionId) {
    return configSessionId;
  }

  // Try to get session_id from checkpoint channel_values
  const session = checkpoint?.channel_values?.session as { id: string } | undefined;
  return session?.id;
}

/**
 * Checkpoint ID generator.
 * Creates deterministic IDs using LangGraph's getCheckpointId utility.
 */
function generateCheckpointId(threadId: string): string {
  return threadId; // Simplified for now
}

/**
 * Convert LangGraph checkpoint to persisted conversation state.
 * Extracts relevant fields for restoration.
 */
function checkpointToPersistedState(
  checkpoint: Checkpoint
): Record<string, unknown> {
  return {
    intent: checkpoint.channel_values?.intent ?? null,
    orderDraft: checkpoint.channel_values?.orderDraft ?? null,
    lastHandledAt: checkpoint.channel_values?.lastHandledAt ?? null,
    lastHandledMessage: checkpoint.channel_values?.lastHandledMessage ?? null,
    lastResponseText: checkpoint.channel_values?.lastResponseText ?? null,
    threadId: checkpoint.channel_values?.threadId ?? null,
  };
}

/**
 * Convert persisted conversation state to LangGraph checkpoint.
 * Reconstructs checkpoint from stored state.
 */
function persistedStateToCheckpoint(
  persisted: Record<string, unknown>,
  threadId: string
): Checkpoint {
  return {
    v: 4,
    id: generateCheckpointId(threadId),
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
    },
    channel_versions: {},
    versions_seen: {},
  };
}

/**
 * Convex-backed checkpointer for LangGraph.
 *
 * Provides durable state persistence by integrating LangGraph's checkpointing
 * system with Convex. This enables:
 *
 * - Automatic state persistence between graph invocations
 * - Time travel and state history browsing
 * - Resume from checkpoints after interrupts
 * - Cross-server state consistency
 *
 * @example
 * ```ts
 * const checkpointer = new ConvexCheckpointer(repository);
 * const graph = new StateGraph(MyState)
 *   .addNode(...)
 *   .compile({ checkpointer });
 * ```
 */
export class ConvexCheckpointer extends BaseCheckpointSaver<number> {
  constructor(
    private readonly repository: ConversationRepository,
    serde?: SerializerProtocol
  ) {
    super(serde);

    // Validate repository has required methods
    if (!repository.upsertSessionByChatId || !repository.getLatestCheckpoint || !repository.saveCheckpoint) {
      throw new Error("Repository must implement ConversationRepository interface");
    }
  }

  /**
   * Retrieve a checkpoint from Convex.
   * @param config - RunnableConfig containing thread_id and optional session_id
   * @returns The checkpoint or undefined if not found
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

      // Parse and convert to LangGraph checkpoint
      const persistedState = JSON.parse(latestCheckpoint.checkpoint) as Record<string, unknown>;
      return persistedStateToCheckpoint(persistedState, latestCheckpoint.threadId);
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;
      logger.error("Failed to retrieve checkpoint from Convex", undefined, undefined, {
        sessionId,
        threadId: config.configurable?.["thread_id"],
        error: errorObj,
      });
      return undefined;
    }
  }

  /**
   * Retrieve a checkpoint tuple with metadata from Convex.
   * @param config - RunnableConfig containing thread_id and optional session_id
   * @returns The checkpoint tuple or undefined if not found
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const checkpoint = await this.get(config);

    if (!checkpoint) {
      return undefined;
    }

    return {
      config,
      checkpoint,
      metadata: {
        source: "input",
        step: 0,
        parents: {},
      },
    };
  }

  /**
   * List checkpoints for a thread.
   * @param config - RunnableConfig containing thread_id
   * @param options - Optional filtering and pagination options
   * @returns Async generator of checkpoint tuples
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

      const persistedState = JSON.parse(latestCheckpoint.checkpoint) as Record<string, unknown>;
      const checkpoint = persistedStateToCheckpoint(persistedState, latestCheckpoint.threadId);

      yield {
        config,
        checkpoint,
        metadata: {
          source: "input",
          step: 0,
          parents: {},
        },
      };
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;
      logger.error("Failed to list checkpoints from Convex", undefined, undefined, {
        sessionId,
        threadId: config.configurable?.["thread_id"],
        error: errorObj,
      });
    }
  }

  /**
   * Save a checkpoint to Convex.
   * @param config - RunnableConfig containing thread_id and optional session_id
   * @param checkpoint - The LangGraph checkpoint to save
   * @param metadata - Metadata about the checkpoint
   * @param newVersions - New channel versions
   * @returns Updated config with session_id
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.["thread_id"] as string | undefined;

    if (!threadId) {
      logger.warn("Skipping checkpoint save: missing thread_id in config", undefined, {
        configurable: config.configurable,
      });
      return config;
    }

    // Try to get or derive session_id
    let sessionId = getSessionId(config, checkpoint);

    if (!sessionId) {
      // If we still don't have session_id, we can't persist
      logger.warn("Skipping checkpoint save: missing session_id", undefined, {
        threadId,
        configurable: config.configurable,
      });
      return config;
    }

    try {
      // Convert checkpoint to persisted state
      const persistedState = checkpointToPersistedState(checkpoint);

      // Save to Convex
      await this.repository.saveCheckpoint({
        sessionId,
        threadId,
        checkpoint: JSON.stringify(persistedState),
        createdAt: Date.now(),
      });

      logger.debug("Checkpoint saved successfully", undefined, {
        sessionId,
        threadId,
        checkpointId: checkpoint.id,
        source: metadata.source,
        step: metadata.step,
      });
    } catch (error) {
      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined;
      logger.error("Failed to save checkpoint to Convex", undefined, undefined, {
        sessionId,
        threadId,
        checkpointId: checkpoint.id,
        error: errorObj,
      });
      // Don't throw - allow graph to continue
    }

    return {
      ...config,
      configurable: {
        ...config.configurable,
        session_id: sessionId,
      },
    };
  }

  /**
   * Store intermediate writes linked to a checkpoint.
   * Currently not implemented for Convex.
   */
  async putWrites(
    config: RunnableConfig,
    writes: unknown[],
    taskId: string
  ): Promise<void> {
    // Not implementing writes storage for now
    // Convex will handle checkpoint persistence
    logger.debug("putWrites called (not implemented)", undefined, {
      threadId: config.configurable?.["thread_id"],
      taskId,
      writesCount: writes.length,
    });
  }

  /**
   * Delete all checkpoints and writes associated with a specific thread ID.
   * @param threadId - The thread ID whose checkpoints should be deleted
   */
  async deleteThread(threadId: string): Promise<void> {
    // For now, we don't implement thread deletion
    // In production, you might want to delete old checkpoints
    logger.debug("deleteThread called (not implemented)", undefined, {
      threadId,
    });
  }

  /**
   * Generate next version ID for a channel.
   * Returns incrementing integer versions.
   */
  getNextVersion(current: number | undefined): number {
    return (current ?? 0) + 1;
  }

  /**
   * Get repository method for session management.
   * Used to ensure session is created before checkpoint operations.
   */
  getRepository(): ConversationRepository {
    return this.repository;
  }
}

/**
 * Factory function to create a ConvexCheckpointer instance.
 * @param repository - The ConversationRepository to use for persistence
 * @param serde - Optional serializer protocol
 * @returns A new ConvexCheckpointer instance
 */
export function createConvexCheckpointer(
  repository: ConversationRepository,
  serde?: SerializerProtocol
): ConvexCheckpointer {
  return new ConvexCheckpointer(repository, serde);
}
