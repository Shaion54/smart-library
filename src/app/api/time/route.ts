import { NextResponse } from "next/server";
import { getSyncedNowMs, getSyncedIso, syncClockWithCloud } from "@/lib/time-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  await syncClockWithCloud();

  return NextResponse.json({
    success: true,
    serverTime: getSyncedIso(),
    serverTimeMs: getSyncedNowMs(),
  });
}
