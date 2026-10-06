"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Device, Reservation, Seat, SeatWithStatus } from "@/types/database";
import { getSeatDisplayStatus, isDeviceOnline } from "@/lib/seat-utils";
import SeatCard from "@/components/SeatCard";
import LibraryFloorMap from "@/components/LibraryFloorMap";
import NoiseAlertBanner from "@/components/NoiseAlertBanner";
import BookingModal from "@/components/BookingModal";
import { useToast } from "@/components/Toast";
import { SeatCardSkeleton } from "@/components/Skeleton";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  User,
  Clock,
  ShieldCheck,
  Wifi,
  MapPin,
  LayoutGrid,
  Filter,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);

  // View state: 'map' or 'grid'
  const [activeView, setActiveView] = useState<"map" | "grid">("map");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Reservation dialog state
  const [selectedSeatForReserve, setSelectedSeatForReserve] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);

  const supabase = createClient();

  async function fetchData() {
    try {
      const { data: seatsData } = await supabase
        .from("seats")
        .select("*")
        .order("seat_number", { ascending: true });

      const { data: resData } = await supabase
        .from("reservations")
        .select("*")
        .eq("status", "active")
        .gt("end_time", new Date().toISOString());

      const { data: deviceData } = await supabase
        .from("devices")
        .select("*")
        .eq("id", "ESP8266_DEV01")
        .single();

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authUser.id)
          .single();

        setUser({
          id: authUser.id,
          email: authUser.email || "",
          role: profile?.role || "student",
        });
      } else {
        setUser(null);
      }

      setSeats(seatsData || []);
      setReservations(resData || []);
      setDevice(deviceData || null);
    } catch (err) {
      console.error("Error loading library data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("public-overview-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => fetchData())
      .subscribe();

    const interval = setInterval(fetchData, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const online = isDeviceOnline(device);

  const defaultSeatList: Seat[] = [
    { id: "S01", seat_number: 1, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S02", seat_number: 2, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S03", seat_number: 3, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S04", seat_number: 4, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
  ];

  const sourceSeats = seats.length > 0 ? seats : defaultSeatList;

  const seatsWithStatus: SeatWithStatus[] = sourceSeats.map((s) => {
    const activeRes = reservations.find((r) => r.seat_id === s.id);
    return {
      ...s,
      activeReservation: activeRes || null,
      deviceOnline: online,
      displayStatus: getSeatDisplayStatus(s, activeRes, online),
    };
  });

  const availableCount = seatsWithStatus.filter((s) => s.displayStatus === "Available").length;
  const occupiedCount = seatsWithStatus.filter((s) => s.displayStatus === "Occupied").length;
  const reservedCount = seatsWithStatus.filter((s) => s.displayStatus === "Reserved").length;

  const handleReserveInit = (seatId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setSelectedSeatForReserve(seatId);
  };

  const handleConfirmReservation = async (seatId: string, durationMinutes: number) => {
    setIsReserving(true);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_id: seatId, duration_minutes: durationMinutes }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to reserve seat", "error");
      } else {
        showToast(`Seat ${seatId} successfully booked for ${durationMinutes} minutes!`, "success");
        await fetchData();
        setSelectedSeatForReserve(null);
      }
    } catch {
      showToast("Network error while creating reservation", "error");
    } finally {
      setIsReserving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-10 shadow-sm space-y-6">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Autonomous Workspace Intelligence</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-900 tracking-tight">
            Smart Library Workspace &amp; Seat Management
          </h1>

          <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
            Real-time desk occupancy, customizable study reservations, and continuous acoustic monitoring. 
            View live desk availability on the interactive floor map and secure your quiet workspace instantly.
          </p>
        </div>

        {/* Compact Statistics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
            <span className="text-xs text-zinc-500 font-medium block">Total Stations</span>
            <span className="text-xl font-bold text-zinc-900 mt-0.5 block">4</span>
            <span className="text-[11px] text-zinc-500">Desks S01 to S04</span>
          </div>

          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5">
            <span className="text-xs text-emerald-700 font-medium block">Available</span>
            <span className="text-xl font-bold text-emerald-700 mt-0.5 block">{availableCount}</span>
            <span className="text-[11px] text-emerald-600">Open for immediate booking</span>
          </div>

          <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-3.5">
            <span className="text-xs text-rose-700 font-medium block">Occupied</span>
            <span className="text-xl font-bold text-rose-700 mt-0.5 block">{occupiedCount}</span>
            <span className="text-[11px] text-rose-600">Presence active</span>
          </div>

          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3.5">
            <span className="text-xs text-blue-700 font-medium block">Reserved</span>
            <span className="text-xl font-bold text-blue-700 mt-0.5 block">{reservedCount}</span>
            <span className="text-[11px] text-blue-600">Active study bookings</span>
          </div>
        </div>

        {/* Action Links */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-100">
          {user ? (
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              Go to Student Dashboard
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5"
            >
              Sign In to Reserve
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}

          <Link
            href="/admin"
            className="px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-xl text-xs font-medium transition-colors"
          >
            Admin Portal
          </Link>
        </div>
      </section>

      {/* Quiet Zone Noise Status Banner */}
      <NoiseAlertBanner
        isNoiseWarningActive={Boolean(device?.noise_warning_active)}
        updatedAt={device?.noise_warning_updated_at}
        deviceOnline={online}
      />

      {/* Seat Selection & Floor Map Area */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-zinc-200">
          <div>
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Live Study Desks & Map
            </h2>
            <p className="text-xs text-zinc-500">
              Real-time desk occupancy and active booking allocations across reading zones.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher: Map vs Grid */}
            <div className="bg-zinc-100 p-1 rounded-xl flex items-center gap-1 border border-zinc-200">
              <button
                onClick={() => setActiveView("map")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === "map"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Floor Map View
              </button>
              <button
                onClick={() => setActiveView("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === "grid"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Desk Cards View
              </button>
            </div>

            {/* Central telemetry heartbeat pill */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-500 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl">
              <span
                className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`}
              />
              <span className="font-medium">{online ? "System Connected" : "System Offline"}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Display based on activeView */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SeatCardSkeleton />
            <SeatCardSkeleton />
            <SeatCardSkeleton />
            <SeatCardSkeleton />
          </div>
        ) : activeView === "map" ? (
          <LibraryFloorMap
            seats={seatsWithStatus}
            isDeviceOnline={online}
            noiseAlertActive={Boolean(device?.noise_warning_active)}
            onSelectSeat={handleReserveInit}
            currentUserId={user?.id}
          />
        ) : (
          <div className="space-y-4">
            {/* Filter buttons for grid view */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "all", label: `All Desks (${seatsWithStatus.length})` },
                { key: "Available", label: `Available (${availableCount})` },
                { key: "Occupied", label: `Occupied (${occupiedCount})` },
                { key: "Reserved", label: `Reserved (${reservedCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    statusFilter === tab.key
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {seatsWithStatus
                .filter((seat) => (statusFilter === "all" ? true : seat.displayStatus === statusFilter))
                .map((seat) => (
                  <SeatCard
                    key={seat.id}
                    seat={seat}
                    currentUserId={user?.id}
                    isAdmin={user?.role === "admin"}
                    onReserveClick={handleReserveInit}
                  />
                ))}
            </div>
          </div>
        )}
      </section>

      {/* Customizable Booking Modal */}
      <BookingModal
        isOpen={Boolean(selectedSeatForReserve)}
        seatId={selectedSeatForReserve}
        seatNumber={seats.find((s) => s.id === selectedSeatForReserve)?.seat_number}
        isLoading={isReserving}
        onConfirm={handleConfirmReservation}
        onClose={() => setSelectedSeatForReserve(null)}
      />
    </div>
  );
}
