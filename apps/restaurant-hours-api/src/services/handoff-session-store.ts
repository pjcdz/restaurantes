export type FallbackHandedOffSession = {
  id: string;
  chatId: string;
  phoneNumber: string | null;
  createdAt: number;
  updatedAt: number;
};

type SessionStatus = "active" | "handed_off" | "paused";

type SessionRecord = {
  createdAt: number;
  updatedAt: number;
};

const handedOffSessions = new Map<string, SessionRecord>();

export function setFallbackSessionStatus(chatId: string, status: SessionStatus): void {
  if (status !== "handed_off") {
    handedOffSessions.delete(chatId);
    return;
  }

  const now = Date.now();
  const existing = handedOffSessions.get(chatId);

  handedOffSessions.set(chatId, {
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
}

export function listFallbackHandedOffSessions(): Array<FallbackHandedOffSession> {
  return Array.from(handedOffSessions.entries())
    .map(([chatId, record]) => ({
      id: `fallback:${chatId}`,
      chatId,
      phoneNumber: null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function isFallbackSessionHandedOff(chatId: string): boolean {
  return handedOffSessions.has(chatId);
}

export function resetFallbackHandedOffSessions(): void {
  handedOffSessions.clear();
}
