import fs from "fs/promises";
import path from "path";

export interface NoiseSettings {
  threshold_db: number;
  mode: "strict" | "standard" | "relaxed";
  alert_sound_enabled: boolean;
  auto_reset_seconds: number;
  updated_at: string;
}

const DEFAULT_SETTINGS: NoiseSettings = {
  threshold_db: 65,
  mode: "standard",
  alert_sound_enabled: true,
  auto_reset_seconds: 30,
  updated_at: new Date().toISOString(),
};

const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "noise_settings.json");

// In-memory cache for fast sub-millisecond retrieval
let inMemoryCache: NoiseSettings | null = null;

export async function getNoiseSettings(): Promise<NoiseSettings> {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  try {
    const raw = await fs.readFile(SETTINGS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    inMemoryCache = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      threshold_db: Number(parsed.threshold_db) || DEFAULT_SETTINGS.threshold_db,
    };
    return inMemoryCache!;
  } catch {
    // If file doesn't exist or corrupted, save and return defaults
    inMemoryCache = { ...DEFAULT_SETTINGS };
    try {
      await fs.mkdir(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
      await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
    } catch (writeErr) {
      console.warn("Could not write default noise settings file:", writeErr);
    }
    return inMemoryCache!;
  }
}

export async function updateNoiseSettings(
  partial: Partial<NoiseSettings>
): Promise<NoiseSettings> {
  const current = await getNoiseSettings();
  const updated: NoiseSettings = {
    ...current,
    ...partial,
    updated_at: new Date().toISOString(),
  };

  // Clamp threshold between 35 dB and 100 dB
  if (typeof updated.threshold_db === "number") {
    updated.threshold_db = Math.max(35, Math.min(100, Math.round(updated.threshold_db)));
  }

  inMemoryCache = updated;

  try {
    await fs.mkdir(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to persist noise settings to disk:", err);
  }

  return updated;
}
