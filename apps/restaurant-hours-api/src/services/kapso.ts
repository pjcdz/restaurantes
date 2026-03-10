import { KAPSO_API_BASE_URL, getKapsoApiKey } from "../config.js";

export type KapsoFetch = typeof fetch;

export type KapsoSendMessageInput = {
  phoneNumber: string;
  text: string;
};

export type KapsoSender = (input: KapsoSendMessageInput) => Promise<void>;

/**
 * Sends a text message through Kapso.ai WhatsApp integration.
 * Based on pattern from telegram.ts
 *
 * @param input - The message input containing phone number and text
 * @param fetchImpl - The fetch implementation to use (defaults to global fetch)
 * @throws Error if the API request fails
 */
export async function sendKapsoTextMessage(
  input: { phoneNumber: string; text: string },
  fetchImpl: KapsoFetch = fetch
): Promise<void> {
  const response = await fetchImpl(
    `${KAPSO_API_BASE_URL}/v1/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${getKapsoApiKey()}`
      },
      body: JSON.stringify({
        to: input.phoneNumber,
        body: input.text
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Kapso sendMessage failed with status ${response.status}.`);
  }
}

/**
 * Activates handoff for a session in Kapso.ai inbox.
 * This transfers control from bot to human operator.
 *
 * @param input - The handoff input containing phone number and reason
 * @param fetchImpl - The fetch implementation to use (defaults to global fetch)
 * @throws Error if the API request fails
 */
export async function activateKapsoHandoff(
  input: { phoneNumber: string; reason: string },
  fetchImpl: KapsoFetch = fetch
): Promise<void> {
  const response = await fetchImpl(
    `${KAPSO_API_BASE_URL}/v1/handoff`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${getKapsoApiKey()}`
      },
      body: JSON.stringify({
        phoneNumber: input.phoneNumber,
        reason: input.reason
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Kapso handoff activation failed with status ${response.status}.`);
  }
}
