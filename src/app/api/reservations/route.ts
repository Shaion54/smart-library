import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createReservationSchema = z.object({
  seat_id: z.enum(["S01", "S02", "S03", "S04"]),
  duration_minutes: z.number().int().min(5).max(180).optional().default(30),
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Expire stale reservations on request
    try {
      await supabase.rpc("expire_stale_reservations");
    } catch {
      // Ignore if RPC fails on read
    }

    // Check if requester is admin
    let isAdmin = false;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = profile?.role === "admin";
    }

    const { searchParams } = new URL(req.url);
    const filterStatus = searchParams.get("status");

    if (isAdmin) {
      // Admin gets full reservations list with student profiles
      let query = supabase
        .from("reservations")
        .select("*, profiles(email, full_name, role), seats(*)")
        .order("created_at", { ascending: false });

      if (filterStatus) {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, reservations: data || [], isAdmin: true });
    }

    if (user) {
      // Logged in student gets their own reservations
      let query = supabase
        .from("reservations")
        .select("*, seats(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (filterStatus) {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, reservations: data || [], isAdmin: false });
    }

    // Anonymous visitor gets only active reservations with seat IDs (anonymized)
    const { data, error } = await supabase
      .from("reservations")
      .select("id, seat_id, status, start_time, end_time")
      .eq("status", "active")
      .gt("end_time", new Date().toISOString());

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, reservations: data || [], isPublic: true });
  } catch (error: unknown) {
    console.error("GET /api/reservations error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching reservations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required to reserve a seat" },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const { seat_id, duration_minutes } = parsed.data;

    // Call atomic concurrency-safe PostgreSQL function
    const { data: result, error: rpcError } = await supabase.rpc("create_reservation", {
      p_seat_id: seat_id,
      p_user_id: user.id,
      p_duration_minutes: duration_minutes,
    });

    if (rpcError) {
      return NextResponse.json(
        { success: false, error: rpcError.message },
        { status: 500 }
      );
    }

    if (!result || !result.success) {
      return NextResponse.json(
        { success: false, error: result?.error || "Unable to reserve seat" },
        { status: 409 } // Conflict
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Seat ${seat_id} successfully reserved for ${duration_minutes} minutes`,
        reservation: result,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error creating reservation" },
      { status: 500 }
    );
  }
}
