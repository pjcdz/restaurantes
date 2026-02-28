import { Router } from "express";

import { getRestaurantAvailability } from "../services/restaurant-hours.js";

export type MessageRouteOptions = {
  now?: () => Date;
};

export function createMessageRouter(options: MessageRouteOptions = {}) {
  const router = Router();
  const now = options.now ?? (() => new Date());

  router.post("/", (request, response) => {
    if (
      typeof request.body !== "object" ||
      request.body === null ||
      Array.isArray(request.body)
    ) {
      return response.status(400).json({
        error: "Request body must be a JSON object."
      });
    }

    return response.json(getRestaurantAvailability(now()));
  });

  return router;
}
