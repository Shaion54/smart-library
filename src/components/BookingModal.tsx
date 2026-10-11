"use client";

import React, { useState, useMemo } from "react";
import { formatToLocalTime } from "@/lib/seat-utils";
import { getSyncedNow } from "@/lib/time-sync";
import { Clock, CheckCircle2, X, AlertCircle, Sparkles } from "lucide-react";

interface BookingModalProps {
  isOpen: boolean;
  seatId: string | null;
  seatNumber?: number;
  isLoading?: boolean;
  onConfirm: (seatId: string, durationMinutes: number) => Promise<void> | void;
  onClose: () => void;
}

const PRESET_DURATIONS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
];

export default function BookingModal({
  isOpen,
  seatId,
  seatNumber,
  isLoading = false,
  onConfirm,
  onClose,
}: BookingModalProps) {
  const [duration, setDuration] = useState<number>(30);
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>("30");

  // Calculate live expected start and end time (synced with cloud server time)
  const now = getSyncedNow();
  const endTime = useMemo(() => {
    return new Date(now.getTime() + duration * 60 * 1000);
  }, [duration]);

  if (!isOpen || !seatId) return null;

  const handlePresetSelect = (mins: number) => {
    setDuration(mins);
    setIsCustom(false);
    setCustomInput(mins.toString());
  };

  const handleCustomChange = (valStr: string) => {
    setCustomInput(valStr);
    const parsed = parseInt(valStr, 10);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 180) {
      setDuration(parsed);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (duration >= 5 && duration <= 180) {
      onConfirm(seatId, duration);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border border-zinc-200 rounded-2xl p-6 sm:p-7 shadow-xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">
                Reserve Desk {seatId}
              </h3>
              <p className="text-xs text-zinc-500">
                Study Station {seatNumber ? `#${seatNumber}` : seatId} &bull; Quiet Reading Zone
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Duration Selection */}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-800">
                Select Session Duration:
              </label>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {duration} minutes
              </span>
            </div>

            {/* Quick preset chips */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {PRESET_DURATIONS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handlePresetSelect(preset.value)}
                  className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all text-center ${
                    !isCustom && duration === preset.value
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Minutes Input Option */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3 text-xs">
              <label className="text-zinc-600 font-medium whitespace-nowrap">
                Custom Duration:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customInput}
                  onChange={(e) => {
                    setIsCustom(true);
                    handleCustomChange(e.target.value);
                  }}
                  className="w-20 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-center font-bold text-zinc-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
                <span className="text-zinc-500">mins (5 - 180)</span>
              </div>
            </div>
          </div>

          {/* Real-time Session Schedule Preview */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2 text-xs text-zinc-700">
            <div className="flex justify-between items-center text-zinc-600">
              <span>Start Time:</span>
              <span className="font-semibold text-zinc-900">
                {formatToLocalTime(now.toISOString())} (Immediate)
              </span>
            </div>

            <div className="flex justify-between items-center text-zinc-600">
              <span>Scheduled Release:</span>
              <span className="font-bold text-blue-600">
                {formatToLocalTime(endTime.toISOString())}
              </span>
            </div>

            <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-200/60 leading-relaxed">
              Please take your desk within 10 minutes. The automated presence detector will verify your check-in.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || duration < 5 || duration > 180}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isLoading ? "Confirming..." : `Confirm ${duration}m Booking`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
