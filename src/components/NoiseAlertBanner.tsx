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
  if (!deviceOnline) {
    return (
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-zinc-600">
        <div className="flex items-center gap-2.5">
          <VolumeX className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>
            <strong>Acoustic Monitoring Offline:</strong> Central Environmental Monitoring Hub is currently disconnected.
          </span>
        </div>
        <span className="text-zinc-500 font-medium">Status Unavailable</span>
      </div>
    );
  }

  if (isNoiseWarningActive) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-pulse">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-100 text-rose-700 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-rose-900">
                Acoustic Threshold Exceeded &bull; Quiet Zone Warning
              </p>
              {thresholdDb && (
                <span className="bg-rose-200/80 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  LIMIT: {thresholdDb} dB
                </span>
              )}
            </div>
            <p className="text-rose-700 mt-0.5">
              Elevated sound level detected above configured quiet study threshold. Silence policy in effect.
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
              Acknowledge & Reset
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-zinc-600 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Volume2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Quiet Zone Normal:</strong> Ambient acoustic levels compliant with study threshold ({thresholdDb} dB limit).
        </span>
      </div>
      <span className="text-zinc-400 text-[11px]">
        Monitored {formatToLocalTime(updatedAt)}
      </span>
    </div>
  );
}
