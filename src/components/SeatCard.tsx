"use client";

import { useEffect, useState } from "react";
import { SeatWithStatus } from "@/types/database";
import { formatToLocalTime } from "@/lib/seat-utils";
import StatusBadge from "@/components/StatusBadge";
import { Armchair, Clock, User, Wrench, WifiOff, CheckCircle2, AlertTriangle } from "lucide-react";

interface SeatCardProps {
  seat: SeatWithStatus;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onReserveClick?: (seatId: string) => void;
  onCancelClick?: (reservationId: string, seatId: string) => void;
  onToggleMaintenanceClick?: (seatId: string, currentMaintenance: boolean) => void;
  isLoading?: boolean;
}

export default function SeatCard({
  seat,
  currentUserId,
  isAdmin = false,
  onReserveClick,
  onCancelClick,
  onToggleMaintenanceClick,
  isLoading = false,
}: SeatCardProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!seat.activeReservation) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [seat.activeReservation]);

  const isReservedByMe = Boolean(
    currentUserId && seat.activeReservation?.user_id === currentUserId
  );

  const isWalkInOccupancy = Boolean(seat.deviceOnline && seat.is_occupied && !seat.activeReservation);

  // Compute countdown
  let countdownText = "";
  if (seat.activeReservation) {
    const remainingSec = Math.max(
      0,
      Math.floor((new Date(seat.activeReservation.end_time).getTime() - now) / 1000)
    );
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    countdownText = `${mins}m ${secs.toString().padStart(2, "0")}s left`;
  }

  return (
    <div
      className={`bg-white border rounded-xl p-5 flex flex-col justify-between transition-all shadow-sm ${
        isWalkInOccupancy
          ? "border-amber-300 ring-1 ring-amber-200"
          : isReservedByMe
          ? "border-blue-300 ring-1 ring-blue-200"
          : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                !seat.deviceOnline
                  ? "bg-zinc-50 border-zinc-200 text-zinc-400"
                  : seat.is_maintenance
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : seat.is_occupied
                  ? isWalkInOccupancy
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                  : seat.activeReservation
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              {seat.is_maintenance ? (
                <Wrench className="w-5 h-5" />
              ) : !seat.deviceOnline ? (
                <WifiOff className="w-5 h-5" />
              ) : seat.is_occupied ? (
                <User className="w-5 h-5" />
              ) : seat.activeReservation ? (
                <Clock className="w-5 h-5" />
              ) : (
                <Armchair className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900">{seat.id}</h3>
                {isReservedByMe && (
                  <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    Your Booking
                  </span>
                )}
                {isWalkInOccupancy && (
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Walk-in
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">Study Desk #{seat.seat_number}</p>
            </div>
          </div>

          <StatusBadge status={seat.displayStatus} />
        </div>

        {/* Detailed Presence & Reservation Breakdown */}
        <div className="space-y-2 py-3 border-t border-b border-zinc-100 text-xs">
          {/* Physical desk presence */}
          <div className="flex items-center justify-between text-zinc-600">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  !seat.deviceOnline
                    ? "bg-zinc-400"
                    : seat.is_occupied
                    ? isWalkInOccupancy
                      ? "bg-amber-500 animate-pulse"
                      : "bg-rose-500 animate-pulse"
                    : "bg-emerald-500"
                }`}
              />
              Desk Presence:
            </span>
            <span className="font-medium text-zinc-900">
              {!seat.deviceOnline ? (
                <span className="text-zinc-400">Offline</span>
              ) : seat.is_occupied ? (
                <span className={isWalkInOccupancy ? "text-amber-700 font-semibold" : "text-rose-600 font-semibold"}>
                  {isWalkInOccupancy ? "Occupied (Unreserved)" : "In Use"}
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">Vacant</span>
              )}
            </span>
          </div>

          {/* Reservation info */}
          <div className="flex items-center justify-between text-zinc-600">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              Reservation:
            </span>
            <span className="font-medium text-zinc-900">
              {seat.activeReservation ? (
                <span className="text-blue-600 font-medium">
                  {countdownText} ({formatToLocalTime(seat.activeReservation.end_time)})
                </span>
              ) : (
                <span className="text-zinc-400">No Active Booking</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 mt-1">
        {/* If Reserved by current student */}
        {isReservedByMe && onCancelClick && seat.activeReservation && (
          <button
            onClick={() => onCancelClick(seat.activeReservation!.id, seat.id)}
            disabled={isLoading}
            className="w-full py-2 px-3 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel My Reservation
          </button>
        )}

        {/* If Available and student can reserve */}
        {!isReservedByMe && seat.displayStatus === "Available" && onReserveClick && (
          <button
            onClick={() => onReserveClick(seat.id)}
            disabled={isLoading}
            className="w-full py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            Reserve Desk
          </button>
        )}

        {/* If Occupied */}
        {!isReservedByMe && seat.displayStatus === "Occupied" && (
          <button
            disabled
            className="w-full py-2 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed text-center"
          >
            Currently Occupied
          </button>
        )}

        {/* If Reserved by another student */}
        {!isReservedByMe && seat.displayStatus === "Reserved" && (
          <button
            disabled
            className="w-full py-2 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed text-center"
          >
            Reserved until {formatToLocalTime(seat.activeReservation?.end_time)}
          </button>
        )}

        {/* If Maintenance */}
        {seat.displayStatus === "Maintenance" && !isAdmin && (
          <button
            disabled
            className="w-full py-2 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed text-center"
          >
            Unavailable (Maintenance)
          </button>
        )}

        {/* If Offline */}
        {seat.displayStatus === "Offline" && !isAdmin && (
          <button
            disabled
            className="w-full py-2 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg cursor-not-allowed text-center"
          >
            Status Unavailable
          </button>
        )}

        {/* Admin Maintenance Control */}
        {isAdmin && onToggleMaintenanceClick && (
          <button
            onClick={() => onToggleMaintenanceClick(seat.id, seat.is_maintenance)}
            disabled={isLoading}
            className={`w-full py-2 px-3 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
              seat.is_maintenance
                ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
                : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            {seat.is_maintenance ? "Restore to Service" : "Set Maintenance"}
          </button>
        )}
      </div>
    </div>
  );
}
