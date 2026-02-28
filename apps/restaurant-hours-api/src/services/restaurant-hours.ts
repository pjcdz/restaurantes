import {
  CLOSED_MESSAGE,
  CLOSING_HOUR,
  OPEN_MESSAGE,
  OPENING_HOUR,
  RESTAURANT_TIMEZONE
} from "../config.js";

export type RestaurantAvailability = {
  open: boolean;
  status: "open" | "closed";
  message: string;
};

function getMinutesInRestaurantTimezone(referenceDate: Date): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: RESTAURANT_TIMEZONE
  });

  const parts = formatter.formatToParts(referenceDate);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

export function getRestaurantAvailability(
  referenceDate: Date = new Date()
): RestaurantAvailability {
  const currentMinutes = getMinutesInRestaurantTimezone(referenceDate);
  const openingMinutes = OPENING_HOUR * 60;
  const closingMinutes = CLOSING_HOUR * 60;
  const open = currentMinutes >= openingMinutes && currentMinutes < closingMinutes;

  return {
    open,
    status: open ? "open" : "closed",
    message: open ? OPEN_MESSAGE : CLOSED_MESSAGE
  };
}
