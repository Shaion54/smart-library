import { Device, Reservation, Seat, SeatDisplayStatus, SeatWithStatus } from "@/types/database";
import { getSyncedNowMs } from "@/lib/time-sync";

// Fast 8 seconds threshold so web dashboard flips to offline/online promptly
export const DEVICE_OFFLINE_TIMEOUT_SECONDS = 8;

/**
 * Checks if the central device heartbeat is stale
 */
export function isDeviceOnline(device: Device | null | undefined, timeoutSeconds = DEVICE_OFFLINE_TIMEOUT_SECONDS): boolean {
  if (!device) return false;
  if (device.is_online === false) return false;
  if (!device.last_seen) return Boolean(device.is_online);

  const lastSeenMs = new Date(device.last_seen).getTime();
  if (isNaN(lastSeenMs)) return Boolean(device.is_online);

  const nowMs = getSyncedNowMs();
  const diffSeconds = (nowMs - lastSeenMs) / 1000;

  // Stale heartbeat check:
  // Heartbeat is considered stale only if more than timeoutSeconds have elapsed since lastSeenMs.
  if (diffSeconds > timeoutSeconds) {
    return false;
  }
  return true;
}

/**
 * Computes the unified display status of a seat while preserving physical vs reservation nuance
 */
export function getSeatDisplayStatus(
  seat: Seat,
  activeReservation: Reservation | null | undefined,
  deviceOnline: boolean
): SeatDisplayStatus {
  if (!deviceOnline) {
    return "Offline";
  }
  if (seat.is_maintenance) {
    return "Maintenance";
  }
  if (seat.is_occupied) {
    return "Occupied";
  }
  if (activeReservation && activeReservation.status === "active") {
    const endMs = new Date(activeReservation.end_time).getTime();
    if (endMs > getSyncedNowMs()) {
      return "Reserved";
    }
  }
  return "Available";
}

/**
 * Formats a UTC timestamp string to local human-readable time
 */
export function formatToLocalTime(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return "N/A";
  try {
    const d = new Date(utcDateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return utcDateStr;
  }
}

/**
 * Formats a UTC timestamp string to local date and time
 */
export function formatToLocalDateTime(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return "N/A";
  try {
    const d = new Date(utcDateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return utcDateStr;
  }
}

/**
 * Calculates remaining time in hours, minutes, and seconds
 * Defensively handles database-to-client clock skew so a 15-minute booking never shows hundreds of hours
 */
export function getRemainingTime(
  endTimeStr: string | null | undefined,
  startTimeStr?: string | null | undefined
): {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  formatted: string;
} {
  if (!endTimeStr) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, formatted: "00h 00m 00s" };
  }

  const endMs = new Date(endTimeStr).getTime();
  const nowMs = getSyncedNowMs();
  const diffMs = endMs - nowMs;

  if (isNaN(diffMs) || diffMs <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true, formatted: "00h 00m 00s" };
  }

  let totalSeconds = Math.floor(diffMs / 1000);

  // Clock Skew Protection:
  // If database server clock is in the future (e.g. 10 days ahead), diffMs will be huge (>24 hours).
  // When startTimeStr is present, we know the planned session length (e.g. 15m, 30m, 1h).
  if (startTimeStr) {
    const startMs = new Date(startTimeStr).getTime();
    const plannedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    if (plannedSec > 0 && plannedSec <= 6 * 3600 && totalSeconds > plannedSec) {
      totalSeconds = plannedSec;
    }
  } else if (totalSeconds > 6 * 3600) {
    // If no start_time and remaining is over 6 hours, cap to 00h 15m 00s fallback
    totalSeconds = 15 * 60;
  }

  const hours = Math.min(23, Math.floor(totalSeconds / 3600));
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = hours.toString().padStart(2, "0");
  const mStr = minutes.toString().padStart(2, "0");
  const sStr = seconds.toString().padStart(2, "0");

  return {
    hours,
    minutes,
    seconds,
    isExpired: totalSeconds <= 0,
    formatted: `${hStr}h ${mStr}m ${sStr}s`,
  };
}

/**
 * Formats remaining time nicely as Hour, Minute, and Second (e.g. 00h 14m 35s)
 */
export function formatRemainingHMS(
  endTimeStr: string | null | undefined,
  startTimeStr?: string | null | undefined
): string {
  return getRemainingTime(endTimeStr, startTimeStr).formatted;
}

/**
 * Formats start and end times in local format (e.g. 10:30 AM - 12:30 PM)
 */
export function formatStartEndTime(
  startUtc: string | null | undefined,
  endUtc: string | null | undefined
): string {
  if (!startUtc && !endUtc) return "Not scheduled";
  const start = startUtc ? formatToLocalTime(startUtc) : "--:--";
  const end = endUtc ? formatToLocalTime(endUtc) : "--:--";
  return `${start} - ${end}`;
}
