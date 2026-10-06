import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservationId = params.id;
    if (!reservationId) {
      return NextResponse.json({ success: false, error: "Reservation ID is required" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to cancel a reservation" },
        { status: 401 }
      );
    }

    // Fetch user profile to check if admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    // Fetch existing reservation
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select("id, seat_id, user_id, status")
      .eq("id", reservationId)
      .single();

    if (fetchError || !reservation) {
      return NextResponse.json({ success: false, error: "Reservation not found" }, { status: 404 });
    }

    // Security check: Student can cancel ONLY their own reservation
    if (!isAdmin && reservation.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You can only cancel your own reservation" },
        { status: 403 }
      );
    }

    if (reservation.status !== "active") {
      return NextResponse.json(
        { success: false, error: `Reservation is already ${reservation.status}` },
        { status: 400 }
      );
    }

    // Cancel reservation
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
      })
      .eq("id", reservationId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Reservation for seat ${reservation.seat_id} successfully cancelled`,
      reservation: updated,
    });
  } catch (error: unknown) {
    console.error("PATCH /api/reservations/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error cancelling reservation" },
      { status: 500 }
    );
  }
}
