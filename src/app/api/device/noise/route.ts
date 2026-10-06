import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDeviceRequest } from "../auth";

import { getNoiseSettings } from "@/lib/noise-settings";

const noiseSchema = z.object({
  device_id: z.string().min(1).max(50),
  noise_detected: z.boolean(),
  sound_level_db: z.number().min(20).max(140).optional(),
  details: z.string().max(255).optional(),
});

export async function POST(req: NextRequest) {
  // 1. Authenticate device token and rate limit
  const auth = validateDeviceRequest(req);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  // 2. Parse and validate JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = noiseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.issues },
      { status: 422 }
    );
  }

  const { device_id, noise_detected, sound_level_db, details } = parsed.data;

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const settings = await getNoiseSettings();

    // Determine noise breach: either direct trigger or sound level >= configured threshold
    const isBreached = typeof sound_level_db === "number"
      ? sound_level_db >= settings.threshold_db
      : noise_detected;

    const eventDetails = details || (
      isBreached
        ? (typeof sound_level_db === "number"
            ? `Acoustic spike: ${sound_level_db} dB exceeded configured limit (${settings.threshold_db} dB)`
            : `Acoustic quiet zone threshold breached (> ${settings.threshold_db} dB limit)`)
        : (typeof sound_level_db === "number"
            ? `Acoustic level normal: ${sound_level_db} dB (within ${settings.threshold_db} dB limit)`
            : "Acoustic level normalized within quiet study limit")
    );

    // 3. Update device warning state and heartbeat
    await supabase.from("devices").upsert(
      {
        id: device_id,
        device_name: "Library Central Telemetry Hub",
        noise_warning_active: isBreached,
        noise_warning_updated_at: nowIso,
        last_seen: nowIso,
        is_online: true,
      },
      { onConflict: "id" }
    );

    // 4. Log noise event in noise_logs
    await supabase.from("noise_logs").insert({
      device_id,
      noise_detected: isBreached,
      recorded_at: nowIso,
      details: eventDetails,
    });

    return NextResponse.json({
      success: true,
      message: noise_detected ? "Noise warning recorded and dashboard flagged" : "Noise normalized",
      timestamp: nowIso,
    });
  } catch (error: unknown) {
    console.error("Noise endpoint error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error logging noise" },
      { status: 500 }
    );
  }
}
