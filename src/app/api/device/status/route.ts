import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDeviceRequest } from "../auth";
import { getNoiseSettings } from "@/lib/noise-settings";
import { getSyncedIso } from "@/lib/time-sync";

export const dynamic = "force-dynamic";

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
  noise_detected: z.boolean().optional(),
  sound_level_db: z.number().optional(),
});

export async function POST(req: NextRequest) {
  // 1. Authenticate device token and rate limit
  const auth = validateDeviceRequest(req);
  if (!auth.valid) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  // 2. Parse and validate payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation error", details: parsed.error.issues },
      { status: 422 }
    );
  }

  const { device_id, seats, firmware_version, ip_address, noise_detected } = parsed.data;

  try {
    const supabase = createAdminClient();

    // 3. Update device heartbeat and status, and retrieve current noise warning state
    const nowIso = getSyncedIso();
    const { data: updatedDevice } = await supabase
      .from("devices")
      .upsert(
        {
          id: device_id,
          device_name: "Library Central Telemetry Hub",
          last_seen: nowIso,
          is_online: true,
          ...(firmware_version ? { firmware_version } : {}),
          ...(ip_address ? { ip_address } : {}),
          ...(noise_detected !== undefined
            ? {
                noise_warning_active: noise_detected,
                noise_warning_updated_at: nowIso,
              }
            : {}),
        },
        { onConflict: "id" }
      )
      .select("noise_warning_active")
      .single();

    // 4. Update physical seat occupancy only for seats that actually toggled state
    const { data: allCurrentSeats } = await supabase
      .from("seats")
      .select("id, is_occupied");

    const seatMap = new Map((allCurrentSeats || []).map((s) => [s.id, s.is_occupied]));
    const updatesToRun = seats.filter((s) => seatMap.get(s.id) !== s.is_occupied);

    if (updatesToRun.length > 0) {
      await Promise.all(
        updatesToRun.map((seatUpdate) =>
          supabase
            .from("seats")
            .update({
              is_occupied: seatUpdate.is_occupied,
              last_occupied_change: nowIso,
              updated_at: nowIso,
            })
            .eq("id", seatUpdate.id)
        )
      );
    }

    // 5. Trigger database-side stale reservation cleanup asynchronously
    Promise.resolve(supabase.rpc("expire_stale_reservations")).catch(() => {});

    const settings = await getNoiseSettings();

    return NextResponse.json({
      success: true,
      message: "Device heartbeat and seat statuses updated",
      timestamp: nowIso,
      noise_warning_active: Boolean(updatedDevice?.noise_warning_active),
      noise_threshold_db: settings.threshold_db,
    });
  } catch (error: unknown) {
    console.error("Device status update error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating device status" },
      { status: 500 }
    );
  }
}
