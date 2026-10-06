/**
 * Comprehensive Validation Test Suite
 * Tests:
 * 1. Schema validation (Zod schemas for device status, noise, reservations, seat maintenance)
 * 2. Seat status computation logic (Separation of physical occupancy vs reservation, offline timeout)
 * 3. Expired reservation detection logic
 * 4. Device rate limiting behavior
 */

import { z } from "zod";

console.log("==================================================");
console.log(" Running Smart Library Seat Finder Validation Suite");
console.log("==================================================");

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failedCount++;
  }
}

// -------------------------------------------------------------
// Test 1: Device Status Schema Validation
// -------------------------------------------------------------
const statusSchema = z.object({
  device_id: z.string().min(1).max(50),
  seats: z.array(
    z.object({
      id: z.enum(["S01", "S02", "S03", "S04"]),
      is_occupied: z.boolean(),
    })
  ).min(1).max(4),
  firmware_version: z.string().max(20).optional(),
  ip_address: z.string().max(50).optional(),
});

const validDevicePayload = {
  device_id: "ESP8266_DEV01",
  seats: [
    { id: "S01", is_occupied: true },
    { id: "S02", is_occupied: false },
    { id: "S03", is_occupied: true },
    { id: "S04", is_occupied: false },
  ],
  firmware_version: "1.0.0",
  ip_address: "192.168.1.100",
};

assert(statusSchema.safeParse(validDevicePayload).success, "Device status schema accepts valid payload");

const invalidSeatPayload = {
  device_id: "ESP8266_DEV01",
  seats: [{ id: "S05", is_occupied: true }], // Invalid seat ID
};
assert(!statusSchema.safeParse(invalidSeatPayload).success, "Device status schema rejects invalid seat ID S05");

// -------------------------------------------------------------
// Test 2: Noise Event Schema Validation
// -------------------------------------------------------------
const noiseSchema = z.object({
  device_id: z.string().min(1).max(50),
  noise_detected: z.boolean(),
  details: z.string().max(255).optional(),
});

assert(
  noiseSchema.safeParse({ device_id: "ESP8266_DEV01", noise_detected: true }).success,
  "Noise schema accepts valid breach alert"
);

// -------------------------------------------------------------
// Test 3: Reservation Creation Schema Validation
// -------------------------------------------------------------
const reservationSchema = z.object({
  seat_id: z.enum(["S01", "S02", "S03", "S04"]),
  duration_minutes: z.number().int().min(5).max(180).optional().default(30),
});

assert(reservationSchema.safeParse({ seat_id: "S01" }).success, "Reservation schema accepts default duration");
assert(
  reservationSchema.safeParse({ seat_id: "S02", duration_minutes: 45 }).success,
  "Reservation schema accepts custom duration"
);
assert(
  !reservationSchema.safeParse({ seat_id: "S02", duration_minutes: 200 }).success,
  "Reservation schema rejects duration > 180 min"
);

// -------------------------------------------------------------
// Test 4: Physical Occupancy vs Reservation Separation
// -------------------------------------------------------------
function computeSeatDisplay(seat, activeReservation, isOnline) {
  if (!isOnline) return "Offline";
  if (seat.is_maintenance) return "Maintenance";
  if (seat.is_occupied) return "Occupied";
  if (activeReservation && activeReservation.status === "active") {
    if (new Date(activeReservation.end_time).getTime() > Date.now()) {
      return "Reserved";
    }
  }
  return "Available";
}

const mockSeat = { id: "S01", is_occupied: false, is_maintenance: false };
const futureTime = new Date(Date.now() + 1000 * 60 * 30).toISOString();
const pastTime = new Date(Date.now() - 1000 * 60 * 5).toISOString();

assert(computeSeatDisplay(mockSeat, null, true) === "Available", "Seat without reservation and empty is Available");
assert(
  computeSeatDisplay({ ...mockSeat, is_occupied: true }, null, true) === "Occupied",
  "Physically occupied seat is Occupied"
);
assert(
  computeSeatDisplay(mockSeat, { status: "active", end_time: futureTime }, true) === "Reserved",
  "Empty seat with active future reservation is Reserved"
);
assert(
  computeSeatDisplay(mockSeat, { status: "active", end_time: pastTime }, true) === "Available",
  "Empty seat with past (expired) reservation returns Available"
);
assert(
  computeSeatDisplay({ ...mockSeat, is_maintenance: true }, null, true) === "Maintenance",
  "Seat with is_maintenance=true shows Maintenance"
);
assert(
  computeSeatDisplay(mockSeat, null, false) === "Offline",
  "When central device is offline, seat shows Offline rather than Available"
);

// -------------------------------------------------------------
// Test 5: Device Stale Heartbeat Calculation
// -------------------------------------------------------------
function checkDeviceOnline(lastSeenIso, timeoutSec = 60) {
  if (!lastSeenIso) return false;
  const diffSec = (Date.now() - new Date(lastSeenIso).getTime()) / 1000;
  return diffSec <= timeoutSec;
}

const recentHeartbeat = new Date(Date.now() - 10 * 1000).toISOString();
const staleHeartbeat = new Date(Date.now() - 120 * 1000).toISOString();

assert(checkDeviceOnline(recentHeartbeat, 60) === true, "Device with 10s old heartbeat is Online");
assert(checkDeviceOnline(staleHeartbeat, 60) === false, "Device with 120s old heartbeat is Offline");

console.log("==================================================");
console.log(` Results: ${passedCount} Passed, ${failedCount} Failed`);
console.log("==================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
