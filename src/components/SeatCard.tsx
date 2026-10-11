"use client";

import { useEffect, useState } from "react";
import { SeatWithStatus } from "@/types/database";
import { formatToLocalTime, getRemainingTime } from "@/lib/seat-utils";
import StatusBadge from "@/components/StatusBadge";
import { Armchair, Clock, User, Wrench, WifiOff, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

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

  // Compute countdown in Hours, Minutes, and Seconds
  let countdownText = "";
  let hours = 0;
  let mins = 0;
  let secs = 0;
  if (seat.activeReservation) {
    const remaining = getRemainingTime(
      seat.activeReservation.end_time,
      seat.activeReservation.start_time
    );
    hours = remaining.hours;
    mins = remaining.minutes;
    secs = remaining.seconds;
    countdownText = remaining.formatted;
  }

  return (
    <div
      className={`bg-white border rounded-2xl p-5 flex flex-col justify-between transition-all shadow-sm hover:shadow-md ${
        isWalkInOccupancy
          ? "border-amber-300 ring-1 ring-amber-200"
          : isReservedByMe
          ? "border-indigo-300 ring-1 ring-indigo-200"
          : "border-zinc-200 hover:border-indigo-200"
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors shadow-xs ${
                !seat.deviceOnline
                  ? "bg-zinc-50 border-zinc-200 text-zinc-400"
                  : seat.is_maintenance
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : seat.is_occupied
                  ? isWalkInOccupancy
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-rose-50 border-rose-200 text-rose-700"
                  : seat.activeReservation
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
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
                <h3 className="text-base font-bold text-zinc-900">{seat.id}</h3>
                {isReservedByMe && (
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    Your Booking
                  </span>
                )}
                {isWalkInOccupancy && (
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Unreserved Occupant
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">Study Desk #{seat.seat_number}</p>
            </div>
          </div>

          <StatusBadge status={seat.displayStatus} />
        </div>

        {/* Detailed Presence & Reservation Breakdown */}
        <div className="space-y-2.5 py-3 border-t border-b border-zinc-100 text-xs">
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
              Physical Status:
            </span>
            <span className="font-medium text-zinc-900">
              {!seat.deviceOnline ? (
                <span className="text-zinc-400">Offline</span>
              ) : seat.is_occupied ? (
                <span className={isWalkInOccupancy ? "text-amber-700 font-semibold" : "text-rose-600 font-semibold"}>
                  {isWalkInOccupancy ? "Present (No Reservation)" : "Occupied"}
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">Vacant Desk</span>
              )}
            </span>
          </div>

          {/* Reservation Schedule Details: Start Time, End Time & Remaining */}
          {seat.activeReservation ? (
            <div className="bg-zinc-50 rounded-lg p-2.5 space-y-1.5 border border-zinc-100">
              <div className="flex items-center justify-between text-[11px] text-zinc-600">
                <span className="text-zinc-500">Start Time:</span>
                <span className="font-semibold text-zinc-800">
                  {formatToLocalTime(seat.activeReservation.start_time)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-600">
                <span className="text-zinc-500">End Time:</span>
                <span className="font-semibold text-zinc-800">
                  {formatToLocalTime(seat.activeReservation.end_time)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 text-[11px]">
                <span className="text-indigo-600 font-medium flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Remaining:
                </span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100">
                  {countdownText}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                Schedule:
              </span>
              <span className="text-zinc-400">No Active Booking</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3.5 mt-1">
        {/* If Reserved by current student */}
        {isReservedByMe && onCancelClick && seat.activeReservation && (
          <button
            onClick={() => onCancelClick(seat.activeReservation!.id, seat.id)}
            disabled={isLoading}
            className="w-full py-2.5 px-3 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel My Reservation
          </button>
        )}

        {/* If Available and student can reserve (or login to reserve) */}
        {!isReservedByMe && seat.displayStatus === "Available" && onReserveClick && (
          <button
            onClick={() => onReserveClick(seat.id)}
            disabled={isLoading}
            className="w-full py-2.5 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            {!currentUserId && <Lock className="w-3.5 h-3.5" />}
            {currentUserId ? "Reserve Desk" : "Sign In to Reserve"}
          </button>
        )}

        {/* User Requirement: Even if someone is sitting without booking (Walk-in), allow booking! */}
        {!isReservedByMe && isWalkInOccupancy && onReserveClick && (
          <button
            onClick={() => onReserveClick(seat.id)}
            disabled={isLoading}
            className="w-full py-2.5 px-3 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
            title={currentUserId ? "Claim this unreserved walk-in seat" : "Sign in to claim this unreserved walk-in seat"}
          >
            {!currentUserId && <Lock className="w-3.5 h-3.5" />}
            {currentUserId ? "Book Desk (Unreserved Walk-in)" : "Sign In to Claim Desk"}
          </button>
        )}

        {/* If Occupied with active booking and not by me */}
        {!isReservedByMe && seat.activeReservation && (
          <button
            disabled
            className="w-full py-2.5 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-xl cursor-not-allowed text-center"
          >
            Booked until {formatToLocalTime(seat.activeReservation.end_time)}
          </button>
        )}

        {/* If Maintenance */}
        {seat.displayStatus === "Maintenance" && !isAdmin && (
          <button
            disabled
            className="w-full py-2.5 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-xl cursor-not-allowed text-center"
          >
            Unavailable (Maintenance)
          </button>
        )}

        {/* If Offline */}
        {seat.displayStatus === "Offline" && !isAdmin && (
          <button
            disabled
            className="w-full py-2.5 px-3 text-xs font-medium text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-xl cursor-not-allowed text-center"
          >
            Status Offline
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
