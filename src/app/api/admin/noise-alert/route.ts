import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNoiseSettings } from "@/lib/noise-settings";

export const dynamic = "force-dynamic";

const alertActionSchema = z.object({
  action: z.enum(["trigger", "clear"]),
  sound_level_db: z.number().optional(),
  details: z.string().max(255).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabaseUserClient = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser();

    if (user) {
      const { data: profile } = await supabaseUserClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile && profile.role !== "admin") {
        return NextResponse.json(
          { success: false, error: "Forbidden: Admin privileges required" },
          { status: 403 }
        );
      }
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = alertActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const { action, sound_level_db, details } = parsed.data;
    const settings = await getNoiseSettings();
    const adminSupabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const deviceId = "ESP8266_DEV01";

    if (action === "trigger") {
      const recordedDb = sound_level_db || Math.max(settings.threshold_db + 8, 75);
      const eventDetails =
        details ||
        `Acoustic spike detected: ${recordedDb} dB (Threshold limit: ${settings.threshold_db} dB)`;

      // Update device warning state
      await adminSupabase.from("devices").upsert(
        {
          id: deviceId,
          device_name: "Library Central Telemetry Hub",
          noise_warning_active: true,
          noise_warning_updated_at: nowIso,
          last_seen: nowIso,
          is_online: true,
        },
        { onConflict: "id" }
      );

      // Insert log entry
      await adminSupabase.from("noise_logs").insert({
        device_id: deviceId,
        noise_detected: true,
        recorded_at: nowIso,
        details: eventDetails,
      });

      return NextResponse.json({
        success: true,
        message: "Acoustic warning triggered and flagged across system",
        noise_warning_active: true,
        threshold_db: settings.threshold_db,
        sound_level_db: recordedDb,
        timestamp: nowIso,
      });
    } else {
      // Clear / Reset alert
      const eventDetails = details || "Acoustic alert acknowledged and reset by administrator";

      await adminSupabase.from("devices").upsert(
        {
          id: deviceId,
          device_name: "Library Central Telemetry Hub",
          noise_warning_active: false,
          noise_warning_updated_at: nowIso,
          last_seen: nowIso,
          is_online: true,
        },
        { onConflict: "id" }
      );

      await adminSupabase.from("noise_logs").insert({
        device_id: deviceId,
        noise_detected: false,
        recorded_at: nowIso,
        details: eventDetails,
      });

      return NextResponse.json({
        success: true,
        message: "Acoustic status normalized and quiet zone warning dismissed",
        noise_warning_active: false,
        timestamp: nowIso,
      });
    }
  } catch (error: unknown) {
    console.error("Noise alert action error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error performing noise alert action" },
      { status: 500 }
    );
  }
}
