"use client";

import { Volume2, VolumeX, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
import { formatToLocalTime } from "@/lib/seat-utils";

interface NoiseAlertBannerProps {
  isNoiseWarningActive: boolean;
  updatedAt?: string | null;
  deviceOnline?: boolean;
  thresholdDb?: number;
  onResetAlert?: () => void;
  isResetting?: boolean;
}

export default function NoiseAlertBanner({
  isNoiseWarningActive,
  updatedAt,
  deviceOnline = true,
  thresholdDb = 65,
  onResetAlert,
  isResetting = false,
}: NoiseAlertBannerProps) {
  // If the device is offline or there is no noise warning, do NOT show a banner
  if (!deviceOnline || !isNoiseWarningActive) {
    return null;
  }

  // Check if warning is stale (> 5 minutes old)
  if (updatedAt) {
    const elapsed = Date.now() - new Date(updatedAt).getTime();
    if (!isNaN(elapsed) && elapsed > 5 * 60 * 1000) {
      return null;
    }
  }

  // Only render when an actual active noise threshold warning is triggered
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-pulse">
      <div className="flex items-start sm:items-center gap-3">
        <div className="p-2 rounded-lg bg-rose-100 text-rose-700 shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-rose-900">
              Quiet Zone Notice: Sound Level Elevated
            </p>
            {thresholdDb && (
              <span className="bg-rose-200/80 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                LIMIT: {thresholdDb} dB
              </span>
            )}
          </div>
          <p className="text-rose-700 mt-0.5">
            Elevated sound detected in the study hall. Please maintain quiet library environment.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:self-center shrink-0">
        <div className="text-rose-800 text-[11px] sm:text-right">
          Triggered: <strong>{formatToLocalTime(updatedAt)}</strong>
        </div>
        {onResetAlert && (
          <button
            type="button"
            onClick={onResetAlert}
            disabled={isResetting}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-xs flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
          >
            {isResetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
