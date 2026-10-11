import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sound_level_db, details } = body; // action: "alert" | "clear" | "test"
    const isAlert = action === "alert" || action === "test";
    const nowIso = new Date().toISOString();
    const supabase = createAdminClient();

    // 1. Update Supabase devices table
    const { data: device } = await supabase
      .from("devices")
      .upsert(
        {
          id: "ESP8266_DEV01",
          device_name: "Library Central Telemetry Hub",
          noise_warning_active: isAlert,
          noise_warning_updated_at: nowIso,
          last_seen: nowIso,
          is_online: true,
        },
        { onConflict: "id" }
      )
      .select("ip_address")
      .single();

    // 2. Insert into noise_logs
    await supabase.from("noise_logs").insert({
      device_id: "ESP8266_DEV01",
      noise_detected: isAlert,
      recorded_at: nowIso,
      details:
        details ||
        (isAlert
          ? `Noise alert triggered: ${sound_level_db || 78} dB`
          : "Noise alert cleared; quiet sanctuary restored"),
    });

    // 3. If device IP is known, send direct LAN request to ESP8266 local webserver
    const ip = device?.ip_address;
    let lanTriggered = false;
    if (ip && ip.startsWith("192.168.")) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const lanUrl = `http://${ip}/alert?state=${isAlert ? "on" : "off"}`;
        await fetch(lanUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        lanTriggered = true;
      } catch {
        // LAN direct request is non-blocking; regular heartbeat polling syncs state within 1s
      }
    }

    return NextResponse.json({
      success: true,
      alert_active: isAlert,
      lan_direct_sent: lanTriggered,
      device_ip: ip || null,
      timestamp: nowIso,
    });
  } catch (err: unknown) {
    console.error("Trigger hardware error:", err);
    return NextResponse.json({ success: false, error: "Failed to trigger hardware" }, { status: 500 });
  }
}
