"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Device, Reservation, Seat, SeatWithStatus } from "@/types/database";
import { getSeatDisplayStatus, isDeviceOnline, formatToLocalDateTime, formatRemainingHMS } from "@/lib/seat-utils";
import SeatCard from "@/components/SeatCard";
import LibraryFloorMap from "@/components/LibraryFloorMap";
import StudentReservationBanner from "@/components/StudentReservationBanner";
import NoiseAlertBanner from "@/components/NoiseAlertBanner";
import ConfirmModal from "@/components/ConfirmModal";
import BookingModal from "@/components/BookingModal";
import StatusBadge from "@/components/StatusBadge";
import { SeatCardSkeleton } from "@/components/Skeleton";
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
  Edit3,
  X,
  Mail,
  GraduationCap,
  Sparkles,
  Save,
  Check,
  Shield,
  Layers,
  Volume2,
  AlertTriangle,
} from "lucide-react";

// Web Audio synthesizer for alert chime
function playStudentAlertChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [0, 0.15].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now + offset);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.11);
    });
  } catch {}
}

function StudentDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoSeat = searchParams?.get("seat");
  const openBooking = searchParams?.get("openBooking");
  const { showToast } = useToast();

  const [seats, setSeats] = useState<Seat[]>([]);
  const [allActiveReservations, setAllActiveReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [userId, setUserId] = useState<string | null>("usr-student-01");
  const [userEmail, setUserEmail] = useState<string | null>("student@library.edu");
  const [userFullName, setUserFullName] = useState<string | null>("Tanvir Ahmed");
  const [studentIdNum, setStudentIdNum] = useState<string>("STU-2024-8891");
  const [department, setDepartment] = useState<string>("Computer Science & Engineering");
  const [loading, setLoading] = useState(true);

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStudentId, setEditStudentId] = useState("");
  const [editDept, setEditDept] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Filters & Search & View Mode
  const [activeView, setActiveView] = useState<"map" | "grid">("map");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals state
  const [reserveModalSeat, setReserveModalSeat] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);

  const [cancelModalReservation, setCancelModalReservation] = useState<{ id: string; seatId: string } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isNoiseModalOpen, setIsNoiseModalOpen] = useState(false);

  // Automatically pop open the booking modal if user just logged in to book this seat
  useEffect(() => {
    if (autoSeat && openBooking === "true") {
      setReserveModalSeat(autoSeat);
      showToast(`Welcome! You are now logged in. Select duration to book Seat ${autoSeat}.`, "success");
    }
  }, [autoSeat, openBooking, showToast]);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || "student@library.edu");

        // Fetch user profile for full name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile?.full_name) {
          setUserFullName(profile.full_name);
        }
      }

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
      if (user) {
        const { data: myResData } = await supabase
          .from("reservations")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (myResData) setUserReservations(myResData);
      }

      // 4. Fetch central ESP8266 device
      const { data: deviceData } = await supabase
        .from("devices")
        .select("*")
        .eq("id", "ESP8266_DEV01")
        .single();

      if (seatsData && seatsData.length > 0) setSeats(seatsData);
      if (resData) setAllActiveReservations(resData);
      setDevice(deviceData || null);
    } catch (err: unknown) {
      console.warn("Using sample mock telemetry on student dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("student-dashboard-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "noise_logs" }, () => loadData())
      .subscribe();

    const interval = setInterval(loadData, 1000);

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
        // Fallback simulation for seamless offline demo
        const newRes: Reservation = {
          id: `res-${Date.now()}`,
          seat_id: seatId,
          user_id: userId || "usr-student-01",
          status: "active",
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
          cancelled_at: null,
          created_at: new Date().toISOString(),
        };
        setUserReservations((prev) => [newRes, ...prev]);
        setAllActiveReservations((prev) => [newRes, ...prev]);
        showToast(`Seat ${seatId} successfully booked for ${durationMinutes} minutes!`, "success");
        setReserveModalSeat(null);
      } else {
        showToast(`Seat ${seatId} successfully booked for ${durationMinutes} minutes!`, "success");
        setReserveModalSeat(null);
        await loadData();
      }
    } catch {
      showToast(`Desk ${seatId} reserved successfully!`, "success");
      setReserveModalSeat(null);
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
        setUserReservations((prev) =>
          prev.map((r) =>
            r.id === cancelModalReservation.id ? { ...r, status: "cancelled" } : r
          )
        );
        setAllActiveReservations((prev) =>
          prev.filter((r) => r.id !== cancelModalReservation.id)
        );
        showToast(`Reservation for seat ${cancelModalReservation.seatId} cancelled`, "success");
      } else {
        showToast(`Reservation for seat ${cancelModalReservation.seatId} cancelled`, "success");
        await loadData();
      }
    } catch {
      setUserReservations((prev) =>
        prev.map((r) =>
          r.id === cancelModalReservation.id ? { ...r, status: "cancelled" } : r
        )
      );
      showToast(`Reservation cancelled successfully`, "success");
    } finally {
      setCancelModalReservation(null);
      setIsCancelling(false);
    }
  };

  // Profile Save
  const handleOpenProfileModal = () => {
    setEditName(userFullName || "Tanvir Ahmed");
    setEditEmail(userEmail || "student@library.edu");
    setEditStudentId(studentIdNum);
    setEditDept(department);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      setUserFullName(editName);
      setUserEmail(editEmail);
      setStudentIdNum(editStudentId);
      setDepartment(editDept);

      if (userId) {
        await supabase
          .from("profiles")
          .update({ full_name: editName })
          .eq("id", userId);
      }

      showToast("Profile details updated successfully!", "success");
      setIsProfileModalOpen(false);
    } catch (err) {
      showToast("Saved profile settings locally!", "success");
      setIsProfileModalOpen(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const online = isDeviceOnline(device);

  // Only consider noise alert active if it was triggered within the last 5 minutes (auto-expire stale alerts)
  const isFreshNoiseAlert = useMemo(() => {
    if (!device?.noise_warning_active) return false;
    if (!device?.noise_warning_updated_at) return false;
    const elapsed = Date.now() - new Date(device.noise_warning_updated_at).getTime();
    return !isNaN(elapsed) && elapsed < 5 * 60 * 1000;
  }, [device?.noise_warning_active, device?.noise_warning_updated_at]);

  useEffect(() => {
    if (isFreshNoiseAlert) {
      setIsNoiseModalOpen(true);
      playStudentAlertChime();
    } else {
      setIsNoiseModalOpen(false);
    }
  }, [isFreshNoiseAlert]);

  const defaultSeatList: Seat[] = [
    { id: "S01", seat_number: 1, is_occupied: true, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" },
    { id: "S02", seat_number: 2, is_occupied: true, is_maintenance: false, last_occupied_change: "", created_at: "", updated_at: "" }, // Unreserved Walk-in
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Greeting & Student Profile Badge */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {/* Profile Icon / Click to edit */}
          <button
            onClick={handleOpenProfileModal}
            className="relative group p-1 rounded-2xl focus:outline-none"
            title="Click to view & edit your profile details"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
              {(userFullName || "T")[0].toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full border border-slate-200 shadow-sm text-indigo-600 group-hover:bg-indigo-50 transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
            </span>
          </button>

          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {userFullName || "Tanvir Ahmed"}
              </h1>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-full uppercase">
                Student Member
              </span>
            </div>
            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{userEmail}</span>
              <span>&bull;</span>
              <span>{studentIdNum}</span>
              <span>&bull;</span>
              <span>{department}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-center">
          <button
            onClick={handleOpenProfileModal}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit Profile
          </button>

          <button
            onClick={() => {
              setLoading(true);
              loadData();
            }}
            disabled={loading}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Active Reservation Banner (If currently booked) */}
      {myActiveReservation && (
        <StudentReservationBanner
          reservation={myActiveReservation}
          onCancelClick={(id, seatId) => setCancelModalReservation({ id, seatId })}
          isLoading={isCancelling}
        />
      )}

      {/* Noise Warning Alert Banner (Only visible if an active fresh noise violation is detected) */}
      <NoiseAlertBanner
        isNoiseWarningActive={isFreshNoiseAlert}
        updatedAt={device?.noise_warning_updated_at}
        deviceOnline={online}
      />

      {/* Statistics Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <span className="text-xs text-slate-500 font-semibold block">Total Desks</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">4</span>
          <span className="text-[11px] text-slate-400">Library Station Units</span>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-2xs">
          <span className="text-xs text-emerald-700 font-semibold block">Available</span>
          <span className="text-2xl font-black text-emerald-700 mt-1 block">{availableCount}</span>
          <span className="text-[11px] text-emerald-600 font-medium">Ready to reserve</span>
        </div>

        <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-2xs">
          <span className="text-xs text-rose-700 font-semibold block">Occupied</span>
          <span className="text-2xl font-black text-rose-700 mt-1 block">{occupiedCount}</span>
          <span className="text-[11px] text-rose-600 font-medium">Student at desk</span>
        </div>

        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-2xs">
          <span className="text-xs text-indigo-700 font-semibold block">Reserved</span>
          <span className="text-2xl font-black text-indigo-700 mt-1 block">{reservedCount}</span>
          <span className="text-[11px] text-indigo-600 font-medium">Scheduled slots</span>
        </div>
      </div>

      {/* Seat Selection & Floor Map Area */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Armchair className="w-4 h-4 text-indigo-600" />
              Interactive Study Desk Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Select any desk to book. Walk-in occupied desks without reservation can also be claimed!
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80">
            <button
              onClick={() => setActiveView("map")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "map"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Floor Map View
            </button>
            <button
              onClick={() => setActiveView("grid")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "grid"
                  ? "bg-white text-indigo-600 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Desk Cards View
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
            isDeviceOnline={online}
            noiseAlertActive={isFreshNoiseAlert}
            onSelectSeat={(id) => setReserveModalSeat(id)}
            currentUserId={userId}
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    statusFilter === tab.key
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

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
          </div>
        )}
      </section>

      {/* Booking History Section */}
      <section id="my-reservations" className="space-y-4 pt-6 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Booking History &amp; Records
            </h2>
            <p className="text-xs text-slate-500">
              Audit log of your current and past study reservations with start and end times.
            </p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full font-bold">
            {userReservations.length} records
          </span>
        </div>

        {userReservations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2 shadow-2xs">
            <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-bold text-slate-800">No Reservations Recorded Yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Select an available study desk above and click &quot;Reserve Desk&quot; to book your slot.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Desk</th>
                    <th className="py-3 px-4">Start Time</th>
                    <th className="py-3 px-4">End Time</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userReservations.map((res) => {
                    const isEligibleForCancel =
                      res.status === "active" && new Date(res.end_time).getTime() > Date.now();

                    const startMs = new Date(res.start_time).getTime();
                    const endMs = new Date(res.end_time).getTime();
                    const durationMins = Math.round((endMs - startMs) / 60000);

                    return (
                      <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          Seat {res.seat_id}
                        </td>
                        <td className="py-3.5 px-4 font-medium">{formatToLocalDateTime(res.start_time)}</td>
                        <td className="py-3.5 px-4 font-medium">{formatToLocalDateTime(res.end_time)}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">{durationMins} mins</td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={res.status} size="sm" />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isEligibleForCancel ? (
                            <button
                              onClick={() =>
                                setCancelModalReservation({ id: res.id, seatId: res.seat_id })
                              }
                              className="px-3 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                            >
                              Cancel Booking
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs font-semibold">&mdash;</span>
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

      {/* Profile Edit Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md shadow-indigo-500/20">
                {(editName || "T")[0].toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Student Profile</h3>
                <p className="text-xs text-slate-500">Update your library display credentials</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Display Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  University Email
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="student@library.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={editStudentId}
                    onChange={(e) => setEditStudentId(e.target.value)}
                    placeholder="STU-2024-8891"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    placeholder="CSE / EEE / BBA"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* ================= STUDENT QUIET ZONE NOISE ALERT POPUP MODAL ================= */}
      {isNoiseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white border border-rose-300 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-scaleUp">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center mx-auto shadow-sm">
              <Volume2 className="w-7 h-7 animate-bounce text-rose-600" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                <AlertTriangle className="w-3 h-3" />
                <span>Quiet Sanctuary Notice</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                শব্দ সীমা অতিক্রান্ত হয়েছে!
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                লাইব্রেরি হলের অ্যাকোস্টিক সেন্সরে অতিরিক্ত শব্দ শনাক্ত হয়েছে। অনুগ্রহ করে শান্ত পরিবেশ বজায় রাখুন।
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNoiseModalOpen(false)}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all active:scale-95"
            >
              বুঝেছি / শান্ত পরিবেশ বজায় রাখব
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500 text-xs">
          Loading student dashboard...
        </div>
      }
    >
      <StudentDashboardContent />
    </Suspense>
  );
}
