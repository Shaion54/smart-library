"use client";

import React, { useState, useEffect } from "react";
import { SeatWithStatus } from "@/types/database";
import { formatToLocalTime } from "@/lib/seat-utils";
import {
  Armchair,
  Clock,
  User,
  Wrench,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Info,
  BookOpen,
  Volume2,
} from "lucide-react";

interface LibraryFloorMapProps {
  seats: SeatWithStatus[];
  isDeviceOnline: boolean;
  noiseAlertActive?: boolean;
  onSelectSeat?: (seatId: string) => void;
  currentUserId?: string | null;
}

export default function LibraryFloorMap({
  seats,
  isDeviceOnline,
  noiseAlertActive = false,
  onSelectSeat,
  currentUserId,
}: LibraryFloorMapProps) {
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getSeatColor = (seat: SeatWithStatus) => {
    if (!seat.deviceOnline) return "border-zinc-300 bg-zinc-100 text-zinc-500";
    if (seat.is_maintenance) return "border-amber-400 bg-amber-50 text-amber-700";
    
    // Check unauthorized walk-in vs legitimate occupied
    if (seat.is_occupied) {
      if (!seat.activeReservation) {
        return "border-amber-500 bg-amber-50 text-amber-800 shadow-amber-200";
      }
      return "border-rose-500 bg-rose-50 text-rose-800 shadow-rose-200";
    }

    if (seat.activeReservation && seat.activeReservation.status === "active") {
      return "border-blue-500 bg-blue-50 text-blue-800 shadow-blue-200";
    }

    return "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-emerald-200";
  };

  const getSeatGlow = (seat: SeatWithStatus) => {
    if (!seat.deviceOnline || seat.is_maintenance) return "";
    if (seat.is_occupied) {
      return !seat.activeReservation
        ? "ring-4 ring-amber-400/40 animate-pulse"
        : "ring-4 ring-rose-400/40";
    }
    if (seat.activeReservation) return "ring-4 ring-blue-400/40";
    return "ring-4 ring-emerald-400/30 hover:ring-emerald-400/60";
  };

  const getSeatSubtitle = (seat: SeatWithStatus) => {
    if (!seat.deviceOnline) return "Offline";
    if (seat.is_maintenance) return "In Maintenance";
    if (seat.is_occupied) {
      return !seat.activeReservation ? "Walk-in (Unreserved)" : "Occupied (Booked)";
    }
    if (seat.activeReservation) {
      const remainingSec = Math.max(
        0,
        Math.floor((new Date(seat.activeReservation.end_time).getTime() - now) / 1000)
      );
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      return `Reserved (${mins}m ${secs}s left)`;
    }
    return "Available to Book";
  };

  const selectedSeat = seats.find((s) => s.id === selectedSeatId);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-7 shadow-sm space-y-6">
      {/* Header with Title and Room Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Library Interactive Floor Plan
            </h2>
            <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-medium">
              Study Room A
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Real-time physical desk presence & cloud reservation layout
          </p>
        </div>

        {/* Central Controller Status Badge */}
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-medium ${
              isDeviceOnline
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-zinc-100 text-zinc-600 border-zinc-200"
            }`}
          >
            {isDeviceOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span>Monitoring Hub: Active</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
                <span>Monitoring Hub: Offline</span>
              </>
            )}
          </div>

          {noiseAlertActive && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold animate-bounce">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Noise Alert!</span>
            </div>
          )}
        </div>
      </div>

      {/* Visual Architectural Map Container */}
      <div className="relative bg-gradient-to-b from-zinc-50/80 to-zinc-100/60 border border-zinc-200/80 rounded-2xl p-6 sm:p-8 overflow-hidden">
        {/* Subtle grid background pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Room Architectural Elements: Bookshelf Top Area */}
        <div className="flex items-center justify-between gap-4 mb-8 bg-zinc-200/60 border border-zinc-300/70 rounded-xl px-4 py-2 text-zinc-600 text-xs font-medium">
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-zinc-500" />
            North Reference Section &amp; Silent Study Zone
          </span>
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            Acoustic Quiet Zone &bull; Target &lt; 65 dB
          </span>
        </div>

        {/* Central Controller Hub Representation */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-zinc-300 shadow-sm px-4 py-1.5 rounded-full text-[11px] text-zinc-700 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                isDeviceOnline ? "bg-emerald-500 animate-ping" : "bg-zinc-400"
              }`}
            />
            <span>Central Environmental &amp; Presence Hub</span>
          </div>
        </div>

        {/* Tables & Desks Layout: 2 Main Tables with 2 Desks each */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 max-w-4xl mx-auto">
          {/* Table A (Seats S01 & S02) */}
          <div className="bg-white/80 backdrop-blur-sm border-2 border-dashed border-zinc-300 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 border-b border-zinc-200 pb-2">
              <span>Study Pod Table A</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Desks 1 & 2</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {seats
                .filter((s) => s.id === "S01" || s.id === "S02")
                .map((seat) => (
                  <DeskButton
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSeatId === seat.id}
                    colorClass={getSeatColor(seat)}
                    glowClass={getSeatGlow(seat)}
                    subtitle={getSeatSubtitle(seat)}
                    onClick={() => {
                      setSelectedSeatId(seat.id);
                      if (seat.displayStatus === "Available" && onSelectSeat) {
                        onSelectSeat(seat.id);
                      }
                    }}
                  />
                ))}
            </div>
          </div>

          {/* Table B (Seats S03 & S04) */}
          <div className="bg-white/80 backdrop-blur-sm border-2 border-dashed border-zinc-300 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 border-b border-zinc-200 pb-2">
              <span>Study Pod Table B</span>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Desks 3 & 4</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {seats
                .filter((s) => s.id === "S03" || s.id === "S04")
                .map((seat) => (
                  <DeskButton
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSeatId === seat.id}
                    colorClass={getSeatColor(seat)}
                    glowClass={getSeatGlow(seat)}
                    subtitle={getSeatSubtitle(seat)}
                    onClick={() => {
                      setSelectedSeatId(seat.id);
                      if (seat.displayStatus === "Available" && onSelectSeat) {
                        onSelectSeat(seat.id);
                      }
                    }}
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Room Exit / Door Representation at Bottom */}
        <div className="mt-8 pt-4 border-t border-zinc-200/80 flex items-center justify-between text-zinc-500 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-12 h-2.5 bg-zinc-300 rounded-sm border border-zinc-400" />
            <span className="text-[11px] font-medium">Main Glass Entrance Door</span>
          </div>
          <span className="text-[11px] text-zinc-400">South Walkway</span>
        </div>
      </div>

      {/* Selected Seat Quick Inspection Drawer */}
      {selectedSeat && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all animate-fadeIn">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-zinc-900">
                Desk {selectedSeat.id} (Seat #{selectedSeat.seat_number})
              </span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getSeatColor(
                  selectedSeat
                )}`}
              >
                {selectedSeat.displayStatus}
              </span>
            </div>
            <p className="text-xs text-zinc-600">
              Desk Presence:{" "}
              <strong className={selectedSeat.is_occupied ? "text-rose-600" : "text-emerald-600"}>
                {selectedSeat.is_occupied ? "In Use" : "Vacant"}
              </strong>{" "}
              • Booking:{" "}
              <strong>
                {selectedSeat.activeReservation
                  ? `Reserved until ${formatToLocalTime(selectedSeat.activeReservation.end_time)}`
                  : "None"}
              </strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedSeat.displayStatus === "Available" && onSelectSeat && (
              <button
                onClick={() => onSelectSeat(selectedSeat.id)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                Reserve Desk {selectedSeat.id}
              </button>
            )}
            <button
              onClick={() => setSelectedSeatId(null)}
              className="px-3 py-2 text-zinc-600 hover:text-zinc-900 text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Comprehensive Status Legend Bar */}
      <div className="pt-2 border-t border-zinc-100">
        <h4 className="text-xs font-semibold text-zinc-700 mb-2.5">
          Desk Status Legend
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80 text-emerald-800">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <span className="font-semibold block">Available</span>
              <span className="text-[10px] text-emerald-600 block">Open for booking</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50/60 border border-blue-200/80 text-blue-800">
            <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
            <div>
              <span className="font-semibold block">Reserved</span>
              <span className="text-[10px] text-blue-600 block">Awaiting student arrival</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50/60 border border-rose-200/80 text-rose-800">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <div>
              <span className="font-semibold block">Occupied</span>
              <span className="text-[10px] text-rose-600 block">Verified student present</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-800">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0 animate-pulse" />
            <div>
              <span className="font-semibold block">Walk-in</span>
              <span className="text-[10px] text-amber-600 block">Presence without booking</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-700">
            <span className="w-3 h-3 rounded-full bg-zinc-400 shrink-0" />
            <div>
              <span className="font-semibold block">Maintenance</span>
              <span className="text-[10px] text-zinc-500 block">Out of service</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeskButtonProps {
  seat: SeatWithStatus;
  isSelected: boolean;
  colorClass: string;
  glowClass: string;
  subtitle: string;
  onClick: () => void;
}

function DeskButton({
  seat,
  isSelected,
  colorClass,
  glowClass,
  subtitle,
  onClick,
}: DeskButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative p-4 rounded-xl border-2 transition-all flex flex-col items-center justify-between min-h-[140px] text-center shadow-sm cursor-pointer select-none ${colorClass} ${glowClass} ${
        isSelected ? "scale-[1.03] ring-2 ring-zinc-900" : "hover:scale-[1.01]"
      }`}
    >
      {/* Top Desk Number */}
      <div className="flex items-center justify-between w-full">
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/80 border border-zinc-200 shadow-2xs">
          {seat.id}
        </span>
        <span className="text-[10px] opacity-75">#{seat.seat_number}</span>
      </div>

      {/* Physical Chair & Presence Icon */}
      <div className="my-2 relative">
        <div className="w-12 h-12 rounded-full bg-white/90 shadow-sm flex items-center justify-center border border-zinc-200/60">
          {seat.is_maintenance ? (
            <Wrench className="w-6 h-6 text-amber-600" />
          ) : !seat.deviceOnline ? (
            <WifiOff className="w-6 h-6 text-zinc-400" />
          ) : seat.is_occupied ? (
            <User className="w-6 h-6 text-rose-600" />
          ) : seat.activeReservation ? (
            <Clock className="w-6 h-6 text-blue-600" />
          ) : (
            <Armchair className="w-6 h-6 text-emerald-600" />
          )}
        </div>

        {/* Live physical presence bubble */}
        {seat.deviceOnline && seat.is_occupied && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white animate-pulse" />
        )}
      </div>

      {/* Desk Title & Subtitle */}
      <div className="w-full">
        <span className="text-xs font-bold block truncate">{seat.displayStatus}</span>
        <span className="text-[10px] block opacity-80 leading-tight mt-0.5 truncate">
          {subtitle}
        </span>
      </div>
    </button>
  );
}
