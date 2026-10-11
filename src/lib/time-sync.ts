/**
 * Cloud Atomic Clock Synchronization
 * Compensates for local operating system clock skew (e.g. 1-hour daylight/timezone drift,
 * or inaccurate system clock) so that reservations, timestamps, and countdowns always
 * perfectly align with the Supabase Cloud database clock and real Bangladesh time.
 */

let clockOffsetMs = 0;
let lastSyncTimeMs = 0;
let isSyncing = false;

// Pre-initialize offset estimate based on known cloud database time (~10 days + 1 hour if Windows clock is skewed)
export function getClockOffsetMs(): number {
  return clockOffsetMs;
}

export function setClockOffsetMs(offset: number) {
  clockOffsetMs = offset;
  lastSyncTimeMs = Date.now();
}

/**
 * Returns the true synchronized timestamp in milliseconds
 */
export function getSyncedNowMs(): number {
  return Date.now() + clockOffsetMs;
}

/**
 * Returns the true synchronized Date object
 */
export function getSyncedNow(): Date {
  return new Date(getSyncedNowMs());
}

/**
 * Returns the true synchronized ISO string
 */
export function getSyncedIso(): string {
  return getSyncedNow().toISOString();
}

/**
 * Synchronizes clock with Supabase Cloud atomic time
 */
export async function syncClockWithCloud(): Promise<number> {
  if (isSyncing) return clockOffsetMs;
  isSyncing = true;

  try {
    const isBrowser = typeof window !== "undefined";
    const targetUrl = isBrowser
      ? "/api/time"
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL || "https://weirxkybmeofpllybiop.supabase.co"}/rest/v1/`;

    const headers: Record<string, string> = {};
    if (!isBrowser && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      headers["apikey"] = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }

    const t0 = Date.now();
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const t1 = Date.now();
    const roundTrip = Math.round((t1 - t0) / 2);

    let cloudTimeMs = 0;
    if (isBrowser) {
      const data = await res.json();
      if (data?.serverTimeMs) {
        cloudTimeMs = data.serverTimeMs + roundTrip;
      }
    } else {
      const dateHeader = res.headers.get("date");
      if (dateHeader) {
        cloudTimeMs = new Date(dateHeader).getTime() + roundTrip;
      }
    }

    if (cloudTimeMs > 0) {
      clockOffsetMs = cloudTimeMs - Date.now();
      lastSyncTimeMs = Date.now();
      console.log(`[TimeSync] Clock synchronized with Cloud. Offset: ${clockOffsetMs}ms (${Math.round(clockOffsetMs / (1000 * 3600))} hours)`);
    }
  } catch (err) {
    console.warn("[TimeSync] Clock sync warning:", err);
  } finally {
    isSyncing = false;
  }

  return clockOffsetMs;
}

// Initial sync triggered once on load
if (typeof window !== "undefined") {
  syncClockWithCloud();
  // Resync every 5 minutes
  setInterval(syncClockWithCloud, 5 * 60 * 1000);
} else {
  // Server-side sync
  syncClockWithCloud();
}
