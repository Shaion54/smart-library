"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Device, Reservation, Seat, SeatWithStatus } from "@/types/database";
import { getSeatDisplayStatus, isDeviceOnline, formatToLocalDateTime } from "@/lib/seat-utils";
import SeatCard from "@/components/SeatCard";
import LibraryFloorMap from "@/components/LibraryFloorMap";
import StudentReservationBanner from "@/components/StudentReservationBanner";
import NoiseAlertBanner from "@/components/NoiseAlertBanner";
import ConfirmModal from "@/components/ConfirmModal";
import BookingModal from "@/components/BookingModal";
import StatusBadge from "@/components/StatusBadge";
import { SeatCardSkeleton, Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  Armchair,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  User,
  XCircle,
  Calendar,
  AlertCircle,
  MapPin,
  LayoutGrid,
} from "lucide-react";

export default function StudentDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [allActiveReservations, setAllActiveReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFullName, setUserFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters & Search & View Mode
  const [activeView, setActiveView] = useState<"map" | "grid">("map");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("" );

  // Modals state
  const [reserveModalSeat, setReserveModalSeat] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);

  const [cancelModalReservation, setCancelModalReservation] = useState<{ id: string; seatId: string } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || null);

      // Fetch user profile for full name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      setUserFullName(profile?.full_name || null);

      // 1. Fetch seats
      const { data: seatsData } = await supabase
        .from("seats")
        .select("*")
        .order("seat_number", { ascending: true });

      // 2. Fetch active reservations
      const { data: resData } = await supabase
        .from("reservations")
        .select("*")
        .eq("status", "active")
        .gt("end_time", new Date().toISOString());

      // 3. Fetch user's reservations (active + past)
      const { data: myResData } = await supabase
        .from("reservations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // 4. Fetch central ESP8266 device
      const { data: deviceData } = await supabase
        .from("devices")
        .select("*")
        .eq("id", "ESP8266_DEV01")
        .single();

      setSeats(seatsData || []);
      setAllActiveReservations(resData || []);
      setUserReservations(myResData || []);
      setDevice(deviceData || null);
    } catch (err: unknown) {
      console.error("Dashboard data load error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("student-dashboard-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => loadData())
      .subscribe();

    const interval = setInterval(loadData, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadData, supabase]);

  // Handle reserve seat execution with custom duration
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
        setReserveModalSeat(null);
        await loadData();
      }
    } catch {
      showToast("Network error creating reservation", "error");
    } finally {
      setIsReserving(false);
    }
  };

  // Handle cancel reservation execution
  const handleConfirmCancelReservation = async () => {
    if (!cancelModalReservation) return;
    setIsCancelling(true);

    try {
      const res = await fetch(`/api/reservations/${cancelModalReservation.id}`, {
        method: "PATCH",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to cancel reservation", "error");
      } else {
        showToast(`Reservation for seat ${cancelModalReservation.seatId} cancelled`, "success");
        setCancelModalReservation(null);
        await loadData();
      }
    } catch {
      showToast("Network error cancelling reservation", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const online = isDeviceOnline(device);

  const defaultSeatList: Seat[] = [
    { id: "S01", seat_number: 1, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S02", seat_number: 2, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S03", seat_number: 3, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S04", seat_number: 4, is_occupied: false, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
  ];

  const sourceSeats = seats.length > 0 ? seats : defaultSeatList;

  const seatsWithStatus: SeatWithStatus[] = useMemo(() => {
    return sourceSeats.map((s) => {
      const activeRes = allActiveReservations.find((r) => r.seat_id === s.id);
      return {
        ...s,
        activeReservation: activeRes || null,
        deviceOnline: online,
        displayStatus: getSeatDisplayStatus(s, activeRes, online),
      };
    });
  }, [sourceSeats, allActiveReservations, online]);

  // Current active reservation for student banner
  const myActiveReservation = useMemo(() => {
    return userReservations.find(
      (r) => r.status === "active" && new Date(r.end_time).getTime() > Date.now()
    );
  }, [userReservations]);

  // Counts
  const availableCount = seatsWithStatus.filter((s) => s.displayStatus === "Available").length;
  const occupiedCount = seatsWithStatus.filter((s) => s.displayStatus === "Occupied").length;
  const reservedCount = seatsWithStatus.filter((s) => s.displayStatus === "Reserved").length;

  // Filtered Seats
  const filteredSeats = useMemo(() => {
    return seatsWithStatus.filter((s) => {
      const matchesSearch = s.id.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (statusFilter === "all") return matchesSearch;
      return matchesSearch && s.displayStatus.toLowerCase() === statusFilter.toLowerCase();
    });
  }, [seatsWithStatus, searchQuery, statusFilter]);

  const firstName = userFullName ? userFullName.split(" ")[0] : userEmail ? userEmail.split("@")[0] : "Student";

  return (
    <div className="space-y-8">
      {/* Top Greeting & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Check real-time study station availability and manage your desk reservations.
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            loadData();
          }}
          disabled={loading}
          className="self-start sm:self-auto px-3 py-1.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Active Reservation Banner (If currently booked) */}
      {myActiveReservation && (
        <StudentReservationBanner
          reservation={myActiveReservation}
          onCancelClick={(id, seatId) => setCancelModalReservation({ id, seatId })}
          isLoading={isCancelling}
        />
      )}

      {/* Noise Warning Alert Banner */}
      <NoiseAlertBanner
        isNoiseWarningActive={Boolean(device?.noise_warning_active)}
        updatedAt={device?.noise_warning_updated_at}
        deviceOnline={online}
      />

      {/* Compact Statistics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-zinc-500 font-medium block">Total Seats</span>
          <span className="text-xl font-bold text-zinc-900 mt-1 block">4</span>
          <span className="text-[11px] text-zinc-400">Library Station Units</span>
        </div>

        <div className="bg-white border border-green-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-green-700 font-medium block">Available</span>
          <span className="text-xl font-bold text-green-700 mt-1 block">{availableCount}</span>
          <span className="text-[11px] text-green-600">Open to book</span>
        </div>

        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-red-700 font-medium block">Occupied</span>
          <span className="text-xl font-bold text-red-700 mt-1 block">{occupiedCount}</span>
          <span className="text-[11px] text-red-600">Person at desk</span>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-blue-700 font-medium block">Reserved</span>
          <span className="text-xl font-bold text-blue-700 mt-1 block">{reservedCount}</span>
          <span className="text-[11px] text-blue-600">Active student slots</span>
        </div>
      </div>

      {/* Search and Filter Area */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200 overflow-x-auto text-xs">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === "all"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            All Desks (4)
          </button>
          <button
            onClick={() => setStatusFilter("available")}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === "available"
                ? "bg-white text-green-700 shadow-sm"
                : "text-zinc-600 hover:text-green-700"
            }`}
          >
            Available ({availableCount})
          </button>
          <button
            onClick={() => setStatusFilter("occupied")}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === "occupied"
                ? "bg-white text-red-700 shadow-sm"
                : "text-zinc-600 hover:text-red-700"
            }`}
          >
            Occupied ({occupiedCount})
          </button>
          <button
            onClick={() => setStatusFilter("reserved")}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
              statusFilter === "reserved"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-zinc-600 hover:text-blue-700"
            }`}
          >
            Reserved ({reservedCount})
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search desk (e.g. S01)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
          />
        </div>
      </div>

      {/* Seat Selection & Floor Map Area */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-zinc-200 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Study Desk Selection</h2>
            <p className="text-xs text-zinc-500">
              Select an available desk from the floor map or cards to book for 30 minutes.
            </p>
          </div>

          {/* View Mode Toggle */}
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
              Grid Cards View
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SeatCardSkeleton />
            <SeatCardSkeleton />
            <SeatCardSkeleton />
            <SeatCardSkeleton />
          </div>
        ) : activeView === "map" ? (
          <LibraryFloorMap
            seats={filteredSeats}
            isDeviceOnline={isDeviceOnline(device)}
            noiseAlertActive={Boolean(device?.noise_warning_active)}
            onSelectSeat={(id) => setReserveModalSeat(id)}
            currentUserId={userId}
          />
        ) : filteredSeats.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-xs text-zinc-500">
            No study desks match the selected filter or search query.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredSeats.map((seat) => (
              <SeatCard
                key={seat.id}
                seat={seat}
                currentUserId={userId}
                onReserveClick={(id) => setReserveModalSeat(id)}
                onCancelClick={(resId, seatId) => setCancelModalReservation({ id: resId, seatId })}
                isLoading={isReserving || isCancelling}
              />
            ))}
          </div>
        )}
      </section>

      {/* My Reservations Section */}
      <section id="my-reservations" className="space-y-3 pt-6 border-t border-zinc-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">My Reservations</h2>
            <p className="text-xs text-zinc-500">
              Audit record of your current and previous desk bookings.
            </p>
          </div>
          <span className="text-xs text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-full font-medium">
            {userReservations.length} records
          </span>
        </div>

        {userReservations.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-2">
            <Calendar className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-xs font-medium text-zinc-800">No Reservations Yet</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Select an available study desk above and click &quot;Reserve Seat&quot; to book your quiet study slot.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-700">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold text-[11px] uppercase">
                  <tr>
                    <th className="py-3 px-4">Desk</th>
                    <th className="py-3 px-4">Start Time</th>
                    <th className="py-3 px-4">End Time</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {userReservations.map((res) => {
                    const isEligibleForCancel =
                      res.status === "active" && new Date(res.end_time).getTime() > Date.now();

                    return (
                      <tr key={res.id} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="py-3 px-4 font-semibold text-zinc-900">
                          Seat {res.seat_id}
                        </td>
                        <td className="py-3 px-4">{formatToLocalDateTime(res.start_time)}</td>
                        <td className="py-3 px-4">{formatToLocalDateTime(res.end_time)}</td>
                        <td className="py-3 px-4">
                          <StatusBadge status={res.status} size="sm" />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isEligibleForCancel ? (
                            <button
                              onClick={() =>
                                setCancelModalReservation({ id: res.id, seatId: res.seat_id })
                              }
                              className="px-2.5 py-1 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                            >
                              Cancel Booking
                            </button>
                          ) : (
                            <span className="text-zinc-400 text-xs">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Customizable Booking Modal */}
      <BookingModal
        isOpen={Boolean(reserveModalSeat)}
        seatId={reserveModalSeat}
        seatNumber={seats.find((s) => s.id === reserveModalSeat)?.seat_number}
        isLoading={isReserving}
        onConfirm={handleConfirmReservation}
        onClose={() => setReserveModalSeat(null)}
      />

      {/* Confirmation Modal for Cancellation */}
      <ConfirmModal
        isOpen={Boolean(cancelModalReservation)}
        title={`Cancel Reservation for Seat ${cancelModalReservation?.seatId}`}
        description="Are you sure you want to cancel this booking? The seat will immediately become available for other students."
        confirmLabel="Yes, Cancel Booking"
        cancelLabel="Keep Booking"
        variant="danger"
        isLoading={isCancelling}
        onConfirm={handleConfirmCancelReservation}
        onClose={() => setCancelModalReservation(null)}
      />
    </div>
  );
}
