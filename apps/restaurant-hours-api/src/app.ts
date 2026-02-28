import express, { type ErrorRequestHandler } from "express";

import { createMessageRouter, type MessageRouteOptions } from "./routes/message.js";
import {
  createTelegramWebhookRouter,
  type TelegramWebhookRouteOptions
} from "./routes/telegram-webhook.js";

export type AppOptions = MessageRouteOptions & TelegramWebhookRouteOptions;

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.use(express.json());
  app.use("/message", createMessageRouter(options));
  app.use("/telegram/webhook", createTelegramWebhookRouter(options));

  const jsonErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400 &&
      "body" in error
    ) {
      return response.status(400).json({
        error: "Invalid JSON body."
      });
    }

    return next(error);
  };

  const fallbackErrorHandler: ErrorRequestHandler = (
    _error,
    _request,
    response,
    _next
  ) => {
    return response.status(500).json({
      error: "Internal server error."
    });
  };

  app.use(jsonErrorHandler);
  app.use(fallbackErrorHandler);

  return app;
}
