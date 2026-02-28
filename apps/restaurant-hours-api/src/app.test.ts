import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";

describe("POST /message", () => {
  it("returns the availability payload", async () => {
    const app = createApp({
      now: () => new Date("2026-02-28T15:00:00.000Z")
    });

    const response = await request(app).post("/message").send({ message: "hola" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      open: true,
      status: "open",
      message: "El restaurante esta abierto."
    });
  });

  it("rejects non-object JSON payloads", async () => {
    const app = createApp();

    const response = await request(app).post("/message").send([]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body must be a JSON object."
    });
  });
});
