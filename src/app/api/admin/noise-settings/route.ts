import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getNoiseSettings, updateNoiseSettings } from "@/lib/noise-settings";

const settingsSchema = z.object({
  threshold_db: z.number().int().min(35).max(100),
  mode: z.enum(["strict", "standard", "relaxed"]).optional(),
  alert_sound_enabled: z.boolean().optional(),
  auto_reset_seconds: z.number().int().min(5).max(300).optional(),
});

export async function GET() {
  try {
    const settings = await getNoiseSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    console.error("Failed to read noise settings:", err);
    return NextResponse.json(
      { success: false, error: "Failed to read acoustic settings" },
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
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

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

    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const updated = await updateNoiseSettings(parsed.data);

    return NextResponse.json({
      success: true,
      message: `Acoustic alert threshold successfully updated to ${updated.threshold_db} dB`,
      settings: updated,
    });
  } catch (error: unknown) {
    console.error("Failed to update noise settings:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating settings" },
      { status: 500 }
    );
  }
}
