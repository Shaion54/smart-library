"use client";

import { useEffect, useState } from "react";
import { Reservation } from "@/types/database";
import { formatToLocalTime, getRemainingTime } from "@/lib/seat-utils";
import { Clock, XCircle, BookmarkCheck } from "lucide-react";

interface StudentReservationBannerProps {
  reservation: Reservation;
  onCancelClick: (id: string, seatId: string) => void;
  isLoading?: boolean;
}

export default function StudentReservationBanner({
  reservation,
  onCancelClick,
  isLoading = false,
}: StudentReservationBannerProps) {
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number; isExpired: boolean }>(() =>
    getRemainingTime(reservation.end_time)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = getRemainingTime(reservation.end_time);
      setTimeLeft(remaining);
      if (remaining.isExpired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [reservation.end_time]);

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Left Details */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
          <BookmarkCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900">
              Active Reservation: Seat {reservation.seat_id}
            </h4>
            <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              Booked
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Valid from <strong>{formatToLocalTime(reservation.start_time)}</strong> until{" "}
            <strong>{formatToLocalTime(reservation.end_time)}</strong>
          </p>
        </div>
      </div>

      {/* Right: Countdown & Cancel Action */}
      <div className="flex items-center gap-3 self-end md:self-center">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono text-zinc-800">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          <span>
            {timeLeft.isExpired
              ? "Expired"
              : `${String(timeLeft.minutes).padStart(2, "0")}:${String(timeLeft.seconds).padStart(2, "0")} remaining`}
          </span>
        </div>

        <button
          onClick={() => onCancelClick(reservation.id, reservation.seat_id)}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel Booking
        </button>
      </div>
    </div>
  );
}
