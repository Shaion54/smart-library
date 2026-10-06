import { Device, Reservation, Seat, SeatDisplayStatus, SeatWithStatus } from "@/types/database";

// Default 60 seconds threshold before device is considered offline
export const DEVICE_OFFLINE_TIMEOUT_SECONDS = 60;

/**
 * Checks if the central device heartbeat is stale
 */
export function isDeviceOnline(device: Device | null | undefined, timeoutSeconds = DEVICE_OFFLINE_TIMEOUT_SECONDS): boolean {
  if (!device || !device.last_seen) return false;
  const lastSeenMs = new Date(device.last_seen).getTime();
  const nowMs = Date.now();
  const diffSeconds = (nowMs - lastSeenMs) / 1000;
  return diffSeconds <= timeoutSeconds && device.is_online;
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
    if (endMs > Date.now()) {
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
 * Calculates remaining time in minutes and seconds
 */
export function getRemainingTime(endTimeStr: string): { minutes: number; seconds: number; isExpired: boolean } {
  const diffMs = new Date(endTimeStr).getTime() - Date.now();
  if (diffMs <= 0) {
    return { minutes: 0, seconds: 0, isExpired: true };
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minutes, seconds, isExpired: false };
}
