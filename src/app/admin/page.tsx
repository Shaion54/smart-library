"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Device, NoiseLog, Reservation, Seat, SeatWithStatus } from "@/types/database";
import {
  getSeatDisplayStatus,
  isDeviceOnline,
  formatToLocalDateTime,
  formatToLocalTime,
} from "@/lib/seat-utils";
import SeatCard from "@/components/SeatCard";
import LibraryFloorMap from "@/components/LibraryFloorMap";
import StatusBadge from "@/components/StatusBadge";
import NoiseAlertBanner from "@/components/NoiseAlertBanner";
import ConfirmModal from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Armchair,
  Clock,
  Volume2,
  VolumeX,
  Cpu,
  RefreshCw,
  Search,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  Calendar,
  AlertCircle,
  Activity,
  Sparkles,
  PieChart,
  Users,
  Sliders,
  Bell,
  RotateCcw,
  Radio,
  Loader2,
} from "lucide-react";

type AdminTab = "overview" | "seats" | "reservations" | "noise" | "device";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const [seats, setSeats] = useState<Seat[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [noiseLogs, setNoiseLogs] = useState<NoiseLog[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filters in Seat and Reservation tabs
  const [seatSearch, setSeatSearch] = useState("");
  const [reservationSearch, setReservationSearch] = useState("");
  const [reservationStatusFilter, setReservationStatusFilter] = useState("all");

  // Modals state
  const [maintenanceModal, setMaintenanceModal] = useState<{ seatId: string; currentState: boolean } | null>(null);
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState(false);

  const [cancelModalReservation, setCancelModalReservation] = useState<{ id: string; seatId: string } | null>(null);
  const [isCancellingReservation, setIsCancellingReservation] = useState(false);

  // Acoustic Decibel Threshold & Alert Simulator States
  const [soundThreshold, setSoundThreshold] = useState<number>(65);
  const [soundMode, setSoundMode] = useState<"strict" | "standard" | "relaxed">("standard");
  const [soundAlertAudioEnabled, setSoundAlertAudioEnabled] = useState<boolean>(true);
  const [isSavingThreshold, setIsSavingThreshold] = useState<boolean>(false);
  const [isTriggeringAlert, setIsTriggeringAlert] = useState<boolean>(false);
  const [isClearingAlert, setIsClearingAlert] = useState<boolean>(false);
  const [testSoundLevel, setTestSoundLevel] = useState<number>(75);

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

      setUserEmail(user.email || null);

      // Verify admin role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "admin") {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      // 1. Fetch seats
      const { data: seatsData } = await supabase
        .from("seats")
        .select("*")
        .order("seat_number", { ascending: true });

      // 2. Fetch reservations
      const { data: resData } = await supabase
        .from("reservations")
        .select("*, profiles(email, full_name, role)")
        .order("created_at", { ascending: false })
        .limit(40);

      // 3. Fetch device
      const { data: deviceData } = await supabase
        .from("devices")
        .select("*")
        .eq("id", "ESP8266_DEV01")
        .single();

      // 4. Fetch noise logs
      const { data: noiseData } = await supabase
        .from("noise_logs")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(20);

      setSeats(seatsData || []);
      setReservations(resData || []);
      setNoiseLogs(noiseData || []);
      setDevice(deviceData || null);

      // 5. Fetch Acoustic Decibel Settings
      try {
        const settingsRes = await fetch("/api/admin/noise-settings");
        if (settingsRes.ok) {
          const { settings } = await settingsRes.json();
          if (settings) {
            setSoundThreshold(Number(settings.threshold_db) || 65);
            setSoundMode(settings.mode || "standard");
            setSoundAlertAudioEnabled(settings.alert_sound_enabled ?? true);
          }
        }
      } catch (settingsErr) {
        console.warn("Could not load noise settings:", settingsErr);
      }
    } catch (err: unknown) {
      console.error("Admin dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("admin-dashboard-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "noise_logs" }, () => loadData())
      .subscribe();

    const interval = setInterval(loadData, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadData, supabase]);

  // Execute Maintenance toggle
  const handleConfirmMaintenance = async () => {
    if (!maintenanceModal) return;
    setIsUpdatingMaintenance(true);

    try {
      const res = await fetch(`/api/seats/${maintenanceModal.seatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_maintenance: !maintenanceModal.currentState }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to update maintenance", "error");
      } else {
        showToast(
          `Seat ${maintenanceModal.seatId} maintenance ${
            !maintenanceModal.currentState ? "enabled" : "disabled"
          }`,
          "success"
        );
        setMaintenanceModal(null);
        await loadData();
      }
    } catch {
      showToast("Network error updating maintenance state", "error");
    } finally {
      setIsUpdatingMaintenance(false);
    }
  };

  // Execute Reservation cancel
  const handleConfirmCancelReservation = async () => {
    if (!cancelModalReservation) return;
    setIsCancellingReservation(true);

    try {
      const res = await fetch(`/api/reservations/${cancelModalReservation.id}`, {
        method: "PATCH",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to cancel reservation", "error");
      } else {
        showToast("Reservation cancelled by Administrator", "success");
        setCancelModalReservation(null);
        await loadData();
      }
    } catch {
      showToast("Network error cancelling reservation", "error");
    } finally {
      setIsCancellingReservation(false);
    }
  };

  // Synthesize audible alert chime in browser using Web Audio API
  const playAlertChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(640, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio autoplay policy fallback
    }
  }, []);

  // Save Decibel Threshold Setting
  const handleSaveThreshold = async (
    newThreshold?: number,
    newMode?: "strict" | "standard" | "relaxed"
  ) => {
    const thresholdToSave = newThreshold ?? soundThreshold;
    const modeToSave = newMode ?? soundMode;
    setIsSavingThreshold(true);
    try {
      const res = await fetch("/api/admin/noise-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold_db: thresholdToSave,
          mode: modeToSave,
          alert_sound_enabled: soundAlertAudioEnabled,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSoundThreshold(thresholdToSave);
        if (newMode) setSoundMode(newMode);
        showToast(`Sound threshold updated to ${thresholdToSave} dB`, "success");
      } else {
        showToast(data.error || "Failed to update threshold", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setIsSavingThreshold(false);
    }
  };

  // Simulate or Trigger Acoustic Spike Alert
  const handleTriggerAlert = async (dbLevel?: number) => {
    const level = dbLevel ?? testSoundLevel;
    setIsTriggeringAlert(true);
    try {
      if (soundAlertAudioEnabled) {
        playAlertChime();
      }
      const res = await fetch("/api/admin/noise-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trigger",
          sound_level_db: level,
          details: `Acoustic spike: ${level} dB crossed configured quiet limit (${soundThreshold} dB)`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Alert triggered! Sound level (${level} dB) exceeded threshold (${soundThreshold} dB).`,
          "warning"
        );
        await loadData();
      } else {
        showToast(data.error || "Failed to trigger alert", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setIsTriggeringAlert(false);
    }
  };

  // Acknowledge and Clear Alert
  const handleClearAlert = async () => {
    setIsClearingAlert(true);
    try {
      const res = await fetch("/api/admin/noise-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear",
          details: "Acoustic alert acknowledged and quiet zone normalized by administrator",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Quiet zone alert acknowledged and normalized", "success");
        await loadData();
      } else {
        showToast(data.error || "Failed to clear alert", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setIsClearingAlert(false);
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
  const activeReservations = reservations.filter((r) => r.status === "active");

  const seatsWithStatus: SeatWithStatus[] = useMemo(() => {
    return sourceSeats.map((s) => {
      const activeRes = activeReservations.find((r) => r.seat_id === s.id);
      return {
        ...s,
        activeReservation: activeRes || null,
        deviceOnline: online,
        displayStatus: getSeatDisplayStatus(s, activeRes, online),
      };
    });
  }, [sourceSeats, activeReservations, online]);

  const availableCount = seatsWithStatus.filter((s) => s.displayStatus === "Available").length;
  const occupiedCount = seatsWithStatus.filter((s) => s.displayStatus === "Occupied").length;
  const reservedCount = seatsWithStatus.filter((s) => s.displayStatus === "Reserved").length;
  const maintenanceCount = seatsWithStatus.filter((s) => s.is_maintenance).length;

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      const email = r.profiles?.email || "";
      const matchesSearch =
        email.toLowerCase().includes(reservationSearch.toLowerCase().trim()) ||
        r.seat_id.toLowerCase().includes(reservationSearch.toLowerCase().trim());

      if (reservationStatusFilter === "all") return matchesSearch;
      return matchesSearch && r.status === reservationStatusFilter;
    });
  }, [reservations, reservationSearch, reservationStatusFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        <p className="text-zinc-500 text-xs">Authenticating administrator privileges...</p>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 bg-white border border-zinc-200 rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900">Administrator Access Required</h2>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Your account (<strong>{userEmail}</strong>) does not have administrator privileges.
          Roles cannot be self-assigned and must be updated in the Supabase <code>profiles</code> table.
        </p>
      </div>
    );
  }

  const sidebarItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Executive Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "seats", label: "Workstations & Desks", icon: <Armchair className="w-4 h-4" /> },
    { id: "reservations", label: "Reservations Audit", icon: <Clock className="w-4 h-4" /> },
    { id: "noise", label: "Acoustic Environment", icon: <Volume2 className="w-4 h-4" /> },
    { id: "device", label: "System Infrastructure", icon: <Cpu className="w-4 h-4" /> },
  ];

  const walkInCount = seatsWithStatus.filter(
    (s) => s.deviceOnline && s.is_occupied && !s.activeReservation
  ).length;
  const occupancyPercent = Math.round((occupiedCount / 4) * 100);

  const secondsSinceHeartbeat = device?.last_seen
    ? Math.round((Date.now() - new Date(device.last_seen).getTime()) / 1000)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Administrative Operations Portal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 tracking-tight mt-1">
            Library Space &amp; Facility Management
          </h1>
          <p className="text-xs text-zinc-500">
            Authenticated as <strong>{userEmail}</strong> &bull; Complete administrative oversight of physical desks, reservations, and acoustic analytics.
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            loadData();
          }}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${loading ? "animate-spin" : ""}`} />
          Sync Live Data
        </button>
      </div>

      {/* Main Layout: Sidebar & Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <aside className="md:col-span-1 space-y-1.5 bg-white border border-zinc-200 rounded-2xl p-2.5 h-fit shadow-xs">
          <div className="px-3 py-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            Management Modules
          </div>
          {sidebarItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-xl transition-all text-left ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-xs font-semibold"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 font-medium"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Content Pane */}
        <main className="md:col-span-3 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Executive KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-zinc-500 font-medium block">Total Desks</span>
                  <span className="text-2xl font-extrabold text-zinc-900 mt-1 block">4</span>
                  <span className="text-[11px] text-zinc-400">All Workstations</span>
                </div>

                <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-700 font-medium">Occupancy</span>
                    <span className="text-xs font-bold text-blue-600">{occupancyPercent}%</span>
                  </div>
                  <span className="text-2xl font-extrabold text-blue-700 mt-1 block">
                    {occupiedCount}/4
                  </span>
                  <div className="w-full bg-blue-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all"
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-emerald-700 font-medium block">Available</span>
                  <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
                    {availableCount}
                  </span>
                  <span className="text-[11px] text-emerald-600">Ready to book</span>
                </div>

                <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-xs">
                  <span className="text-xs text-purple-700 font-medium block">Reserved</span>
                  <span className="text-2xl font-extrabold text-purple-700 mt-1 block">
                    {reservedCount}
                  </span>
                  <span className="text-[11px] text-purple-600">Active Bookings</span>
                </div>

                <div
                  className={`border rounded-xl p-4 shadow-xs ${
                    walkInCount > 0
                      ? "bg-amber-50/70 border-amber-300"
                      : "bg-white border-zinc-200"
                  }`}
                >
                  <span className="text-xs text-amber-800 font-medium block">Walk-in</span>
                  <span className="text-2xl font-extrabold text-amber-800 mt-1 block">
                    {walkInCount}
                  </span>
                  <span className="text-[11px] text-amber-700">Unreserved Presence</span>
                </div>
              </div>

              {/* System Infrastructure Telemetry Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      Central Infrastructure Telemetry
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        online
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {online ? "System Online" : "System Offline"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Telemetry status:{" "}
                    <strong>
                      {secondsSinceHeartbeat !== null ? `Synchronized ${secondsSinceHeartbeat}s ago` : "No sync recorded"}
                    </strong>
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab("noise")}
                  className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs space-y-2 cursor-pointer hover:border-purple-300 hover:shadow-sm transition-all group"
                  title="Click to configure sound threshold & acoustic alerts"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5 group-hover:text-purple-700 transition-colors">
                      <Volume2 className="w-4 h-4 text-purple-600" />
                      Acoustic Quiet Zone System
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        device?.noise_warning_active
                          ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {device?.noise_warning_active
                        ? "Acoustic Alert Active"
                        : `Compliant (<${soundThreshold} dB)`}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {device?.noise_warning_active
                      ? "Acoustic monitor actively flagged excessive ambient noise levels."
                      : `Ambient sound compliant with configured limit (${soundThreshold} dB). Click to adjust threshold.`}
                  </p>
                </div>
              </div>

              {/* Interactive Floor Map in Admin Overview */}
              <div>
                <LibraryFloorMap
                  seats={seatsWithStatus}
                  isDeviceOnline={online}
                  noiseAlertActive={Boolean(device?.noise_warning_active)}
                />
              </div>

              {/* Workstations Quick Management Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-900">Workstation Quick Controls</h3>
                  <span className="text-xs text-zinc-500">Toggle maintenance mode directly</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {seatsWithStatus.map((seat) => (
                    <SeatCard
                      key={seat.id}
                      seat={seat}
                      isAdmin={true}
                      onToggleMaintenanceClick={(seatId, current) =>
                        setMaintenanceModal({ seatId, currentState: current })
                      }
                      isLoading={isUpdatingMaintenance}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SEAT MANAGEMENT */}
          {activeTab === "seats" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Seat Station Management</h3>
                  <p className="text-xs text-zinc-500">
                    Manage station status and toggle maintenance mode for repairs or cleaning.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-700">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold text-[11px] uppercase">
                      <tr>
                        <th className="py-3 px-4">Desk</th>
                        <th className="py-3 px-4">Desk Presence</th>
                        <th className="py-3 px-4">Active Booking</th>
                        <th className="py-3 px-4">Maintenance</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {seatsWithStatus.map((seat) => (
                        <tr key={seat.id} className="hover:bg-zinc-50/60 transition-colors">
                          <td className="py-3 px-4 font-semibold text-zinc-900">
                            {seat.id} (Station #{seat.seat_number})
                          </td>
                          <td className="py-3 px-4">
                            {!seat.deviceOnline ? (
                              <span className="text-zinc-400">Offline</span>
                            ) : seat.is_occupied ? (
                              <span className="text-red-600 font-medium">Occupied</span>
                            ) : (
                              <span className="text-green-600 font-medium">Empty</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {seat.activeReservation ? (
                              <span className="text-blue-600">
                                Until {formatToLocalTime(seat.activeReservation.end_time)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {seat.is_maintenance ? (
                              <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium text-[11px]">
                                Maintenance On
                              </span>
                            ) : (
                              <span className="text-zinc-500 text-[11px]">Normal</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() =>
                                setMaintenanceModal({
                                  seatId: seat.id,
                                  currentState: seat.is_maintenance,
                                })
                              }
                              className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                                seat.is_maintenance
                                  ? "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800"
                                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                              }`}
                            >
                              {seat.is_maintenance ? "Restore" : "Set Maintenance"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RESERVATIONS */}
          {activeTab === "reservations" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Reservation Audit Log</h3>
                  <p className="text-xs text-zinc-500">
                    Review student reservations and cancel unauthorized or expired bookings.
                  </p>
                </div>

                {/* Filter and Search */}
                <div className="flex items-center gap-2">
                  <select
                    value={reservationStatusFilter}
                    onChange={(e) => setReservationStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Search student or seat..."
                    value={reservationSearch}
                    onChange={(e) => setReservationSearch(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-700">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold text-[11px] uppercase">
                      <tr>
                        <th className="py-3 px-4">Desk</th>
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4">Start Time</th>
                        <th className="py-3 px-4">End Time</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Admin Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredReservations.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-zinc-400">
                            No reservations found.
                          </td>
                        </tr>
                      ) : (
                        filteredReservations.map((res) => (
                          <tr key={res.id} className="hover:bg-zinc-50/60 transition-colors">
                            <td className="py-3 px-4 font-semibold text-zinc-900">
                              Seat {res.seat_id}
                            </td>
                            <td className="py-3 px-4">
                              {res.profiles?.email || (
                                <span className="font-mono text-zinc-400">
                                  {res.user_id.slice(0, 8)}...
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">{formatToLocalDateTime(res.start_time)}</td>
                            <td className="py-3 px-4">{formatToLocalDateTime(res.end_time)}</td>
                            <td className="py-3 px-4">
                              <StatusBadge status={res.status} size="sm" />
                            </td>
                            <td className="py-3 px-4 text-right">
                              {res.status === "active" ? (
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: NOISE MONITORING & THRESHOLD CONTROLS */}
          {activeTab === "noise" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-purple-600" />
                    Quiet Zone Acoustic Monitoring & Sound Limit
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Configure permissible decibel thresholds, simulate acoustic spikes, and manage real-time quiet policy warnings.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${
                      device?.noise_warning_active
                        ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse font-semibold"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        device?.noise_warning_active ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                    />
                    {device?.noise_warning_active ? "Acoustic Alert Active" : "Quiet Zone Compliant"}
                  </span>
                </div>
              </div>

              {/* Warning Banner if currently active */}
              <NoiseAlertBanner
                isNoiseWarningActive={Boolean(device?.noise_warning_active)}
                updatedAt={device?.noise_warning_updated_at}
                deviceOnline={online}
                thresholdDb={soundThreshold}
                onResetAlert={handleClearAlert}
                isResetting={isClearingAlert}
              />

              {/* Interactive Sound Level Configuration & Live Meter Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* CARD 1: Configured Sound Level Threshold */}
                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                          Acoustic Threshold Limit
                        </h4>
                        <p className="text-[11px] text-zinc-500">
                          Sounds above this decibel level trigger warnings
                        </p>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1 bg-purple-50 border border-purple-200 px-3 py-1 rounded-xl">
                      <span className="text-xl font-extrabold text-purple-700 font-mono">
                        {soundThreshold}
                      </span>
                      <span className="text-xs font-semibold text-purple-600">dB</span>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between text-xs font-medium text-zinc-600">
                      <span>Threshold Slider:</span>
                      <span className="text-purple-700 font-bold font-mono">{soundThreshold} dB</span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={90}
                      step={1}
                      value={soundThreshold}
                      onChange={(e) => setSoundThreshold(Number(e.target.value))}
                      className="w-full accent-purple-600 cursor-pointer h-2 bg-zinc-100 rounded-lg"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                      <span>40 dB (Whisper)</span>
                      <span>65 dB (Recommended)</span>
                      <span>90 dB (Loud)</span>
                    </div>
                  </div>

                  {/* Preset Zones */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-medium text-zinc-500 block">
                      Quick Preset Modes:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSoundThreshold(45);
                          setSoundMode("strict");
                          handleSaveThreshold(45, "strict");
                        }}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                          soundThreshold === 45
                            ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        <div className="font-semibold">Deep Silent</div>
                        <div className="text-[10px] opacity-80">45 dB</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSoundThreshold(65);
                          setSoundMode("standard");
                          handleSaveThreshold(65, "standard");
                        }}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                          soundThreshold === 65
                            ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        <div className="font-semibold">Standard Hall</div>
                        <div className="text-[10px] opacity-80">65 dB (Rec.)</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSoundThreshold(75);
                          setSoundMode("relaxed");
                          handleSaveThreshold(75, "relaxed");
                        }}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-medium transition-all text-center ${
                          soundThreshold === 75
                            ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                            : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        <div className="font-semibold">Study Lounge</div>
                        <div className="text-[10px] opacity-80">75 dB</div>
                      </button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-2 flex items-center justify-between border-t border-zinc-100">
                    <span className="text-[11px] text-zinc-500">
                      Policy enforces quiet study limits across all reading areas.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSaveThreshold(soundThreshold, soundMode)}
                      disabled={isSavingThreshold}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-medium shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isSavingThreshold ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      Save Threshold
                    </button>
                  </div>
                </div>

                {/* CARD 2: Live Monitor, Test Alert & Sound Simulator */}
                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                          Live Acoustic Gauge & Alert Test
                        </h4>
                        <p className="text-[11px] text-zinc-500">
                          Verify alert triggering when noise exceeds {soundThreshold} dB
                        </p>
                      </div>
                    </div>

                    {/* Audio Chime Toggle */}
                    <button
                      type="button"
                      onClick={() => setSoundAlertAudioEnabled(!soundAlertAudioEnabled)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        soundAlertAudioEnabled
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-zinc-50 text-zinc-500 border-zinc-200"
                      }`}
                      title="Toggle browser synthesized alert tone"
                    >
                      {soundAlertAudioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      <span className="text-[11px]">Audio Tone: {soundAlertAudioEnabled ? "ON" : "OFF"}</span>
                    </button>
                  </div>

                  {/* Level Gauge Display */}
                  <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-600 font-medium">
                        Simulated Ambient Sound Level:
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-base font-bold font-mono ${
                            testSoundLevel >= soundThreshold ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {testSoundLevel} dB
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                            testSoundLevel >= soundThreshold
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {testSoundLevel >= soundThreshold ? "BREACH LIMIT" : "NORMAL"}
                        </span>
                      </div>
                    </div>

                    {/* Gauge Progress Bar with Threshold Marker */}
                    <div className="relative w-full h-3 bg-zinc-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          testSoundLevel >= soundThreshold
                            ? "bg-rose-500 animate-pulse"
                            : testSoundLevel >= soundThreshold - 5
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(10, (testSoundLevel / 100) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Ambient Base (30 dB)</span>
                      <span className="font-semibold text-purple-700">Limit: {soundThreshold} dB</span>
                      <span>100 dB</span>
                    </div>
                  </div>

                  {/* Test Sound Level Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-600">
                      <span>Adjust Test Decibel Level:</span>
                      <span className="font-mono font-semibold text-zinc-900">{testSoundLevel} dB</span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={95}
                      step={1}
                      value={testSoundLevel}
                      onChange={(e) => setTestSoundLevel(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer h-2 bg-zinc-100 rounded-lg"
                    />
                  </div>

                  {/* Test Actions */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => handleTriggerAlert(testSoundLevel)}
                      disabled={isTriggeringAlert}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs disabled:opacity-50 ${
                        testSoundLevel >= soundThreshold
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : "bg-zinc-800 hover:bg-zinc-900 text-white"
                      }`}
                    >
                      {isTriggeringAlert ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {testSoundLevel >= soundThreshold
                        ? `Trigger Alert (${testSoundLevel} dB > ${soundThreshold} dB)`
                        : `Test Sound Level (${testSoundLevel} dB)`}
                    </button>

                    {device?.noise_warning_active && (
                      <button
                        type="button"
                        onClick={handleClearAlert}
                        disabled={isClearingAlert}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                      >
                        {isClearingAlert ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        Reset Warning
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Policy note */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs text-zinc-600">
                <p className="font-semibold text-zinc-900 mb-0.5">Acoustic Policy & Calibration Standard:</p>
                <p>
                  High-precision acoustic monitors continuously sample ambient noise levels across reading zones. When ambient sound crosses the configured threshold ({soundThreshold} dB), visual alerts and automated incident records are immediately broadcast across student and admin interfaces.
                </p>
              </div>

              {/* Recent Noise Event History Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-900">Recent Noise Trigger History</h4>
                  <span className="text-[11px] text-zinc-400">Total Events: {noiseLogs.length}</span>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-zinc-700">
                      <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold text-[11px] uppercase">
                        <tr>
                          <th className="py-2.5 px-4">Event Time</th>
                          <th className="py-2.5 px-4">Acoustic Status</th>
                          <th className="py-2.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {noiseLogs.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-6 text-center text-zinc-400">
                              No noise breach events logged.
                            </td>
                          </tr>
                        ) : (
                          noiseLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-zinc-50/60 transition-colors">
                              <td className="py-2.5 px-4 font-mono text-zinc-600">
                                {formatToLocalDateTime(log.recorded_at)}
                              </td>
                              <td className="py-2.5 px-4">
                                {log.noise_detected ? (
                                  <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-medium text-[11px] flex items-center gap-1 w-fit">
                                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                                    Threshold Breached
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium text-[11px] flex items-center gap-1 w-fit">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Normalized
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-zinc-600 font-medium">
                                {log.details || "Acoustic trigger event"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SYSTEM INFRASTRUCTURE */}
          {activeTab === "device" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Facility Network & Infrastructure Hub</h3>
                <p className="text-xs text-zinc-500">
                  Telemetry and connectivity metrics from the central library telemetry gateway.
                </p>
              </div>

              <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-700">
                      <Cpu className="w-5 h-5 text-zinc-700" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-900">
                        {device?.device_name || "Central Telemetry Gateway"}
                      </h4>
                      <p className="text-xs text-zinc-500 font-mono">
                        Hub ID: {device?.id || "HUB_SYS_01"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border ${
                      online
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    {online ? "Connected & Online" : "Disconnected (Offline)"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    <span className="text-zinc-500 block mb-1">Firmware Version</span>
                    <span className="font-semibold text-zinc-900 font-mono">
                      {device?.firmware_version || "v1.0.0"}
                    </span>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    <span className="text-zinc-500 block mb-1">Assigned Local IP</span>
                    <span className="font-semibold text-zinc-900 font-mono">
                      {device?.ip_address || "192.168.x.x (DHCP)"}
                    </span>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    <span className="text-zinc-500 block mb-1">Heartbeat Age</span>
                    <span className="font-semibold text-zinc-900">
                      {secondsSinceHeartbeat !== null ? `${secondsSinceHeartbeat} seconds ago` : "Never"}
                    </span>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    <span className="text-zinc-500 block mb-1">Last Transmission Timestamp</span>
                    <span className="font-semibold text-zinc-900">
                      {formatToLocalDateTime(device?.last_seen)}
                    </span>
                  </div>
                </div>

                {!online && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">Stale Connection Warning:</p>
                    <p>
                      The device has not communicated within the 60-second timeout window. Desk occupancy readings on the dashboard are currently marked as &quot;Offline / Status Unavailable&quot; to prevent displaying outdated data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Confirmation Modal for Maintenance Mode */}
      <ConfirmModal
        isOpen={Boolean(maintenanceModal)}
        title={
          maintenanceModal?.currentState
            ? `Restore Seat ${maintenanceModal?.seatId} to Service`
            : `Place Seat ${maintenanceModal?.seatId} in Maintenance Mode`
        }
        description={
          maintenanceModal?.currentState
            ? "This will make the seat available again for student reservations."
            : "This will immediately cancel any active reservations for this desk and mark it unavailable."
        }
        confirmLabel={maintenanceModal?.currentState ? "Restore to Service" : "Confirm Maintenance"}
        cancelLabel="Dismiss"
        isLoading={isUpdatingMaintenance}
        onConfirm={handleConfirmMaintenance}
        onClose={() => setMaintenanceModal(null)}
      />

      {/* Confirmation Modal for Admin Reservation Cancellation */}
      <ConfirmModal
        isOpen={Boolean(cancelModalReservation)}
        title={`Cancel Booking for Seat ${cancelModalReservation?.seatId}`}
        description="Are you sure you want to cancel this student's reservation? The seat will immediately become available."
        confirmLabel="Cancel Booking"
        cancelLabel="Keep Booking"
        variant="danger"
        isLoading={isCancellingReservation}
        onConfirm={handleConfirmCancelReservation}
        onClose={() => setCancelModalReservation(null)}
      />
    </div>
  );
}
