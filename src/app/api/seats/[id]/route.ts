import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const updateSeatSchema = z.object({
  is_maintenance: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const seatId = params.id;
    if (!["S01", "S02", "S03", "S04"].includes(seatId)) {
      return NextResponse.json({ success: false, error: "Invalid seat ID" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    // Role check: Only admin can toggle maintenance
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin privileges required" },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = updateSeatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const { is_maintenance } = parsed.data;

    // If placing into maintenance, also cancel any active reservation on this seat
    if (is_maintenance) {
      await supabase
        .from("reservations")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("seat_id", seatId)
        .eq("status", "active");
    }

    const { data: updatedSeat, error: updateError } = await supabase
      .from("seats")
      .update({
        is_maintenance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seatId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Seat ${seatId} maintenance mode ${is_maintenance ? "enabled" : "disabled"}`,
      seat: updatedSeat,
    });
  } catch (error: unknown) {
    console.error("PATCH /api/seats/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating seat" },
      { status: 500 }
    );
  }
}
