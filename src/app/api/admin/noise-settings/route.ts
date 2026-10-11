import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getNoiseSettings, updateNoiseSettings } from "@/lib/noise-settings";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  threshold_db: z.number().int().min(20).max(100),
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

    // If user session is present, verify admin privileges
    if (user) {
      const { data: profile } = await supabase
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
