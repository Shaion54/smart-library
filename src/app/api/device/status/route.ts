import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDeviceRequest } from "../auth";

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

  const { device_id, seats, firmware_version, ip_address } = parsed.data;

  try {
    const supabase = createAdminClient();

    // 3. Update device heartbeat and status
    const nowIso = new Date().toISOString();
    await supabase.from("devices").upsert(
      {
        id: device_id,
        device_name: "Library Central Telemetry Hub",
        last_seen: nowIso,
        is_online: true,
        ...(firmware_version ? { firmware_version } : {}),
        ...(ip_address ? { ip_address } : {}),
      },
      { onConflict: "id" }
    );

    // 4. Update physical seat occupancy without affecting maintenance or reservations
    for (const seatUpdate of seats) {
      // Get current seat occupancy to update last_occupied_change if it toggled
      const { data: currentSeat } = await supabase
        .from("seats")
        .select("is_occupied")
        .eq("id", seatUpdate.id)
        .single();

      const changed = currentSeat && currentSeat.is_occupied !== seatUpdate.is_occupied;

      await supabase
        .from("seats")
        .update({
          is_occupied: seatUpdate.is_occupied,
          ...(changed ? { last_occupied_change: nowIso } : {}),
          updated_at: nowIso,
        })
        .eq("id", seatUpdate.id);
    }

    // 5. Trigger database-side stale reservation cleanup
    try {
      await supabase.rpc("expire_stale_reservations");
    } catch (err) {
      console.warn("Auto-expiry RPC call failed:", err);
    }

    return NextResponse.json({
      success: true,
      message: "Device heartbeat and seat statuses updated",
      timestamp: nowIso,
    });
  } catch (error: unknown) {
    console.error("Device status update error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating device status" },
      { status: 500 }
    );
  }
}
