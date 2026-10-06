import { NextRequest } from "next/server";

// Simple in-memory rate limiter per IP / token
const requestTimestamps: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds window
const MAX_REQUESTS_PER_WINDOW = 25; // max 25 requests per 10 seconds

export function validateDeviceRequest(req: NextRequest): { valid: boolean; error?: string; status: number } {
  const configuredToken = process.env.DEVICE_API_TOKEN;

  if (!configuredToken) {
    console.error("DEVICE_API_TOKEN is not configured on the server");
    return { valid: false, error: "Device authentication is unconfigured", status: 500 };
  }

  // Check Authorization header or x-device-token
  const authHeader = req.headers.get("authorization");
  const deviceTokenHeader = req.headers.get("x-device-token");

  let suppliedToken = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    suppliedToken = authHeader.substring(7).trim();
  } else if (deviceTokenHeader) {
    suppliedToken = deviceTokenHeader.trim();
  }

  if (!suppliedToken || suppliedToken !== configuredToken) {
    return { valid: false, error: "Unauthorized: Invalid or missing device token", status: 401 };
  }

  // Rate limiting check
  const clientIp = req.headers.get("x-forwarded-for") || "device-client";
  const now = Date.now();
  const timestamps = requestTimestamps.get(clientIp) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return { valid: false, error: "Too Many Requests: Rate limit exceeded", status: 429 };
  }

  validTimestamps.push(now);
  requestTimestamps.set(clientIp, validTimestamps);

  return { valid: true, status: 200 };
}
