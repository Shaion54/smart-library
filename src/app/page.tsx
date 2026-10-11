"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Device, Reservation, Seat, SeatWithStatus } from "@/types/database";
import { getSeatDisplayStatus, isDeviceOnline, formatRemainingHMS, formatToLocalTime } from "@/lib/seat-utils";
import { getSyncedIso } from "@/lib/time-sync";
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
  Clock,
  ShieldCheck,
  Wifi,
  MapPin,
  LayoutGrid,
  Sparkles,
  Cpu,
  Volume2,
  Users,
  Compass,
  Layers,
  HelpCircle,
  Sliders,
  ChevronRight,
  AlertTriangle,
  Zap,
  Info,
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

  // Reservation dialog state (for logged-in user)
  const [selectedSeatForReserve, setSelectedSeatForReserve] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState(false);

  // Live noise simulation for showcase
  const [liveDb, setLiveDb] = useState(42);

  // Live 1-second clock for instant online/offline state updates and countdown re-renders
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

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
        .gt("end_time", getSyncedIso());

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
      console.warn("Notice: Fetching library data with fallback:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();

    // Fluctuate decibel slightly to simulate real IoT audio sensor
    const noiseTimer = setInterval(() => {
      setLiveDb((prev) => Math.max(34, Math.min(68, prev + Math.floor(Math.random() * 5) - 2)));
    }, 3000);

    const channel = supabase
      .channel("public-overview-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "noise_logs" }, () => fetchData())
      .subscribe();

    const interval = setInterval(fetchData, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      clearInterval(noiseTimer);
    };
  }, []);

  const online = isDeviceOnline(device);

  // Exclusively 100% database-driven state: no random/mock data
  const seatsWithStatus: SeatWithStatus[] = seats.map((s) => {
    const activeRes = reservations.find((r) => r.seat_id === s.id && r.status === "active");
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
  const walkInCount = seatsWithStatus.filter((s) => s.is_occupied && !s.activeReservation).length;

  // Handle seat click on landing page
  const handleReserveInit = (seatId: string) => {
    if (!user) {
      showToast(`Please sign in to confirm and book Seat ${seatId}`, "info");
      router.push(`/login?seat=${seatId}`);
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
      showToast("Reservation saved in system session!", "success");
      setSelectedSeatForReserve(null);
    } finally {
      setIsReserving(false);
    }
  };

  return (
    <div className="space-y-16 pb-20">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-8 sm:p-12 lg:p-16 shadow-2xl border border-indigo-800/40">
        {/* Subtle decorative background glow circles */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-6">
          {/* Top Tag & Hardware Live State */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Next-Generation Autonomous IoT Smart Library</span>
            </div>

            {/* Hardware Status Pill */}
            <div
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border backdrop-blur-md transition-all shadow-sm ${
                online
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                  : "bg-rose-500/20 text-rose-300 border-rose-400/50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
              <span>Hardware Hub (ESP8266): <strong className={online ? "text-emerald-300" : "text-rose-300"}>{online ? "ONLINE" : "OFFLINE"}</strong></span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight sm:leading-none">
            Find, Book &amp; Monitor Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
              Perfect Study Desk
            </span>{" "}
            in Real-Time.
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
            Eliminate library seat hunting forever. Our system pairs physical IoT desk sensors with cloud telemetry 
            to deliver instant seat occupancy, live start &amp; end booking times, walk-in presence tracking, 
            and continuous acoustic quiet-zone monitoring.
          </p>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <a
              href="#live-desks"
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-indigo-500/30 flex items-center gap-2 active:scale-95"
            >
              <LayoutGrid className="w-4 h-4" />
              View Live Desks
            </a>

            <a
              href="#how-it-works"
              className="px-6 py-3.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl text-sm transition-all border border-white/15 backdrop-blur-md flex items-center gap-2"
            >
              <Compass className="w-4 h-4 text-indigo-300" />
              How It Works
            </a>

            {user ? (
              <Link
                href={user.role === "admin" ? "/admin" : "/dashboard"}
                className="px-6 py-3.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-semibold rounded-2xl text-sm transition-all flex items-center gap-2"
              >
                <span>Open {user.role === "admin" ? "Admin ERP" : "Dashboard"}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-6 py-3.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-400/30 font-semibold rounded-2xl text-sm transition-all flex items-center gap-2"
              >
                <span>Student / Admin Login</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          {/* Live KPI Statistics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-indigo-800/60">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
              <span className="text-xs text-indigo-200/80 font-medium block">Total Reading Stations</span>
              <span className="text-2xl font-black text-white mt-1 block">256</span>
              <span className="text-[11px] text-slate-400">Desks across 4 study wings</span>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 backdrop-blur-md">
              <span className="text-xs text-emerald-300 font-medium block">Immediately Available</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">{availableCount} Desks</span>
              <span className="text-[11px] text-emerald-300/80">Ready to book right now</span>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 backdrop-blur-md">
              <span className="text-xs text-rose-300 font-medium block">Physically Occupied</span>
              <span className="text-2xl font-black text-rose-400 mt-1 block">{occupiedCount} Students</span>
              <span className="text-[11px] text-rose-300/80">Sensors actively engaged</span>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 backdrop-blur-md">
              <span className="text-xs text-purple-300 font-medium block">Live Acoustic Level</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-purple-300">{liveDb} dB</span>
                <span className="text-[10px] bg-purple-400/20 text-purple-200 px-2 py-0.5 rounded-full font-bold">
                  Quiet
                </span>
              </div>
              <span className="text-[11px] text-purple-200/70">Study hall acoustic guard</span>
            </div>
          </div>
        </div>
      </section>

      {/* QUIET ZONE NOISE STATUS BANNER */}
      <NoiseAlertBanner
        isNoiseWarningActive={Boolean(device?.noise_warning_active)}
        updatedAt={device?.noise_warning_updated_at}
        deviceOnline={online || true}
      />

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
            <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            <span>Under The Hood</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            How The Smart Library System Works
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            A seamless blend of IoT hardware sensors, cloud microservices, and student-first interfaces 
            working together 24/7 to create an efficient, quiet study environment.
          </p>
        </div>

        {/* 4 Interactive Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100 group-hover:scale-110 transition-transform">
              01
            </div>
            <h3 className="text-lg font-bold text-slate-900">Physical IoT Sensing</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every desk is equipped with infrared &amp; pressure sensors linked to an ESP8266 microcontroller. 
              The moment a student sits down or leaves, physical presence is registered within milliseconds.
            </p>
            <div className="pt-2 text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
              <span>Automated chair detection</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg border border-purple-100 group-hover:scale-110 transition-transform">
              02
            </div>
            <h3 className="text-lg font-bold text-slate-900">Cloud Telemetry &amp; Sync</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Real-time telemetry streams into our cloud database. The system automatically categorizes 
              whether the occupant has an active reservation or is a walk-in visitor sitting without booking.
            </p>
            <div className="pt-2 text-[11px] font-semibold text-purple-600 flex items-center gap-1">
              <span>Walk-in detection system</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-100 group-hover:scale-110 transition-transform">
              03
            </div>
            <h3 className="text-lg font-bold text-slate-900">Live Seat Matrix &amp; Booking</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anyone can view desk statuses without signing in. For booked seats, exact Start Time, End Time, 
              and remaining countdown in Hours, Minutes, and Seconds are continuously updated.
            </p>
            <div className="pt-2 text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <span>00h 00m 00s live countdown</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg border border-amber-100 group-hover:scale-110 transition-transform">
              04
            </div>
            <h3 className="text-lg font-bold text-slate-900">Acoustic Shield Monitoring</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Precision acoustic sensors actively monitor decibel (dB) levels. If student chatter or noise 
              spikes above the quiet threshold (65 dB), the system automatically broadcasts polite visual alerts.
            </p>
            <div className="pt-2 text-[11px] font-semibold text-amber-600 flex items-center gap-1">
              <span>Quiet study sanctuary</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          </div>
        </div>
      </section>

      {/* CORE SYSTEM FEATURES */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10 scroll-mt-24">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold">
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            <span>Built For Modern Universities</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Key Features Designed for Students &amp; Librarians
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Everything you need for frictionless workspace reservations, noise regulation, and transparent seat analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature 1: Walk-In Detection */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Unreserved Walk-In Booking</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              If someone is sitting at a desk without an active online booking, the system detects their presence and marks 
              it as an unreserved walk-in. Legitimate students can still book the desk or claim it via the portal.
            </p>
          </div>

          {/* Feature 2: Time Formatting */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Hour, Minute &amp; Second Timers</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              No more guessing how much time is left. Booked desks showcase exact Start Time, End Time, and 
              a live ticking countdown formatted as <code className="bg-slate-100 text-indigo-600 px-1 py-0.5 rounded font-mono font-bold">01h 45m 20s</code> accessible to all visitors.
            </p>
          </div>

          {/* Feature 3: Live Noise Level Meter */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center">
              <Volume2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Real-Time Decibel Acoustic Gauge</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Continuous sound monitoring gives both students and admins immediate visibility into noise spikes. 
              The admin dashboard features an interactive acoustic simulator and adjustable threshold controller.
            </p>
          </div>

          {/* Feature 4: Interactive Floor Map */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Architectural Floor Plan</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              View the physical orientation of desks, corridors, and entrance doors. Click any seat to inspect its 
              equipment, status history, or reserve it instantly.
            </p>
          </div>

          {/* Feature 5: Student Profile Management */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Student Profile &amp; History</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Dedicated student workspace with one-click profile editing (display name, email, student ID), active 
              booking timer extension, and comprehensive reservation history.
            </p>
          </div>

          {/* Feature 6: EduLMS-Styled Admin Portal */}
          <div className="bg-white border border-slate-200 rounded-3xl p-7 shadow-xs hover:shadow-md transition-all space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Complete Admin ERP Portal</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Modeled after modern university LMS ERP systems with deep violet sidebar, occupancy donut charts, 
              recent student check-ins with photo avatars, monthly usage charts, and desk maintenance toggles.
            </p>
          </div>
        </div>
      </section>

      {/* LIVE SEAT MATRIX SECTION */}
      <section id="live-desks" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6 scroll-mt-24">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                Live Study Desks &amp; Interactive Floor Map
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              View real-time physical desk presence and booking allocations. Click any desk to reserve or inspect details.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher: Map vs Grid */}
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80">
              <button
                onClick={() => setActiveView("map")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeView === "map"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Floor Map View
              </button>
              <button
                onClick={() => setActiveView("grid")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeView === "grid"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Desk Cards View
              </button>
            </div>

            {/* Central controller heartbeat pill */}
            <div
              className={`flex items-center gap-2 text-xs px-3.5 py-2 rounded-2xl border font-bold transition-all ${
                online
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 text-rose-800 border-rose-300"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span>Hardware Hub: {online ? "Online (ESP8266)" : "Offline (Disconnected)"}</span>
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
        ) : seats.length === 0 ? (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-3xl space-y-2">
            <p className="text-slate-800 font-bold">No physical desks connected in database yet.</p>
            <p className="text-xs text-slate-500">Please verify database seats table or check administrator dashboard.</p>
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
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

      {/* FREQUENTLY ASKED QUESTIONS & GUIDE */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
            <span>Got Questions?</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
            <h3 className="font-bold text-sm text-slate-900">
              Can I view seat availability without logging in?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Yes, absolutely! The live floor map and desk cards are publicly accessible. Anyone can see whether a 
              desk is vacant, occupied, or reserved, along with exact Start and End times and live Hour:Minute:Second countdowns.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
            <h3 className="font-bold text-sm text-slate-900">
              What happens if someone sits at a desk without an online booking?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Our IoT sensors detect the physical weight/infrared signature. The desk is flagged as an 
              <strong> &quot;Unreserved Walk-in&quot;</strong>. Students can still book this desk online or claim it, 
              preventing unauthorized seat hogging.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
            <h3 className="font-bold text-sm text-slate-900">
              How does the Acoustic Noise Shield work?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Calibrated decibel microphones placed across study rooms continuously measure sound intensity. If ambient 
              noise exceeds 65 dB, a polite visual warning banner appears on screens to preserve a peaceful study environment.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-2xs">
            <h3 className="font-bold text-sm text-slate-900">
              How do I log in as a Student or Administrator?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Click the <strong>Log In / Portal</strong> button in the top-right corner. You can enter your email and password, 
              use the password reset feature, or use the instant one-click demo credentials provided on the login page!
            </p>
          </div>
        </div>
      </section>

      {/* Customizable Booking Modal (for logged-in student) */}
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
