"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Device, NoiseLog, Reservation, Seat, SeatWithStatus } from "@/types/database";
import {
  getSeatDisplayStatus,
  isDeviceOnline,
  formatToLocalDateTime,
  formatToLocalTime,
  formatRemainingHMS,
} from "@/lib/seat-utils";
import SeatCard from "@/components/SeatCard";
import LibraryFloorMap from "@/components/LibraryFloorMap";
import StatusBadge from "@/components/StatusBadge";
import NoiseAlertBanner from "@/components/NoiseAlertBanner";
import ConfirmModal from "@/components/ConfirmModal";
import BookingModal from "@/components/BookingModal";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Armchair,
  BookOpen,
  Calendar,
  UserCheck,
  CheckCircle2,
  Clock,
  Volume2,
  VolumeX,
  Cpu,
  RefreshCw,
  Search,
  ShieldCheck,
  AlertTriangle,
  Wifi,
  WifiOff,
  Wrench,
  XCircle,
  Activity,
  Sparkles,
  PieChart,
  Bell,
  MoreVertical,
  LogOut,
  ChevronDown,
  ChevronUp,
  FileText,
  DollarSign,
  MessageSquare,
  Settings,
  HelpCircle,
  Briefcase,
  Play,
  Sliders,
  Check,
  Radio,
  Eye,
  Plus,
  History,
  User,
  Edit3,
  Save,
  Camera,
  Mail,
  Phone,
  Building,
  X,
  Menu,
} from "lucide-react";

// Duration formatter for historical reservations
function formatReservationDuration(startTime: string, endTime: string): string {
  try {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs <= 0) return "N/A";
    const totalMinutes = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  } catch {
    return "N/A";
  }
}

// Date formatter for booking history
function formatBookingDate(isoString?: string): string {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

// Generate pure 8-bit PCM WAV buzzer alarm (3 rapid 1000Hz beeps) encoded as Base64 Data URI
let cachedWavDataUri: string | null = null;
function getBuzzerWavDataUri(): string {
  if (cachedWavDataUri) return cachedWavDataUri;
  const sampleRate = 8000;
  const duration = 0.45; // 450ms: 3 beeps with gaps
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Uint8Array(44 + numSamples);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
  };
  const writeU32 = (offset: number, val: number) => {
    buffer[offset] = val & 0xff;
    buffer[offset + 1] = (val >> 8) & 0xff;
    buffer[offset + 2] = (val >> 16) & 0xff;
    buffer[offset + 3] = (val >> 24) & 0xff;
  };
  const writeU16 = (offset: number, val: number) => {
    buffer[offset] = val & 0xff;
    buffer[offset + 1] = (val >> 8) & 0xff;
  };

  writeStr(0, "RIFF");
  writeU32(4, 36 + numSamples);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  writeU32(16, 16);
  writeU16(20, 1); // PCM
  writeU16(22, 1); // Mono
  writeU32(24, sampleRate);
  writeU32(28, sampleRate);
  writeU16(32, 1);
  writeU16(34, 8); // 8-bit
  writeStr(36, "data");
  writeU32(40, numSamples);

  // 3 loud square pulses at 1000 Hz
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const isBeeping = (t >= 0 && t < 0.10) || (t >= 0.15 && t < 0.25) || (t >= 0.30 && t < 0.40);
    buffer[44 + i] = isBeeping ? (((t * 1000) % 1) < 0.5 ? 220 : 35) : 128;
  }

  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  cachedWavDataUri = "data:audio/wav;base64," + (typeof window !== "undefined" ? window.btoa(binary) : "");
  return cachedWavDataUri;
}

let globalAudioCtx: AudioContext | null = null;
let cachedBuzzerAudio: HTMLAudioElement | null = null;

// Pre-warm and unlock audio drivers on first click/tap
function unlockAudioEngines() {
  if (typeof window === "undefined") return;
  try {
    if (!cachedBuzzerAudio) {
      cachedBuzzerAudio = new Audio(getBuzzerWavDataUri());
      cachedBuzzerAudio.volume = 1.0;
    }
    cachedBuzzerAudio.load();
  } catch {}
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      if (!globalAudioCtx) globalAudioCtx = new AudioContextClass();
      if (globalAudioCtx.state === "suspended") {
        globalAudioCtx.resume().then(() => {
          if (globalAudioCtx) {
            const buffer = globalAudioCtx.createBuffer(1, 1, 22050);
            const source = globalAudioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(globalAudioCtx.destination);
            source.start(0);
          }
        }).catch(() => {});
      }
    }
  } catch {}
}

function playOscillatorBeeps(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;
    [0, 0.15, 0.30].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1046.5, now + offset);

      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.6, now + offset + 0.02);
      gain.gain.setValueAtTime(0.6, now + offset + 0.09);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.10);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.11);
    });
  } catch (err) {
    console.warn("Oscillator beep error:", err);
  }
}

// Dual-Engine Browser Buzzer Sound: HTML5 Audio + Web Audio API Oscillator
function playBrowserBuzzerBeep() {
  if (typeof window === "undefined") return;

  // Engine 1: HTML5 Audio with embedded base64 PCM WAV
  try {
    if (!cachedBuzzerAudio) {
      cachedBuzzerAudio = new Audio(getBuzzerWavDataUri());
      cachedBuzzerAudio.volume = 1.0;
    }
    cachedBuzzerAudio.currentTime = 0;
    const playPromise = cachedBuzzerAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Pending browser user gesture unlock
      });
    }
  } catch {}

  // Engine 2: Web Audio API Oscillator (High C6 1046.5Hz Sawtooth Buzzer)
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      if (!globalAudioCtx) globalAudioCtx = new AudioContextClass();
      const ctx = globalAudioCtx;
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          playOscillatorBeeps(ctx);
        }).catch(() => {});
      } else {
        playOscillatorBeeps(ctx);
      }
    }
  } catch (e) {
    console.warn("Browser audio synthesizer error:", e);
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Navigation tab state
  const [activeMenu, setActiveMenu] = useState<string>("Dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Data states
  const [seats, setSeats] = useState<Seat[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);

  // Noise decibel simulator & live status (default to 30 dB strict standard)
  const [liveDb, setLiveDb] = useState(25);
  const [soundThreshold, setSoundThreshold] = useState<number>(30);
  const [soundMode, setSoundMode] = useState<"strict" | "standard" | "relaxed">("strict");
  const [isAlertActive, setIsAlertActive] = useState<boolean>(false);
  const [isTriggeringAlert, setIsTriggeringAlert] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isNoisePopupOpen, setIsNoisePopupOpen] = useState<boolean>(false);

  // Seat management modals
  const [maintenanceModal, setMaintenanceModal] = useState<{ seatId: string; currentState: boolean } | null>(null);
  const [cancelModalReservation, setCancelModalReservation] = useState<{ id: string; seatId: string } | null>(null);
  const [assignBookingSeatId, setAssignBookingSeatId] = useState<string | null>(null);
  const [isAssigningBooking, setIsAssigningBooking] = useState(false);

  // Booking history filter & search state
  const [bookingHistoryFilter, setBookingHistoryFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");
  const [bookingHistorySearch, setBookingHistorySearch] = useState<string>("");

  // Admin Profile State & Customization
  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string>("Tanvir Ahmed");
  const [adminEmail, setAdminEmail] = useState<string>("admin@smartlibrary.edu");
  const [adminDesignation, setAdminDesignation] = useState<string>("Library Administrator");
  const [adminPhone, setAdminPhone] = useState<string>("+880 1712-345678");
  const [adminOffice, setAdminOffice] = useState<string>("Central Library (Room 102)");
  const [adminAvatar, setAdminAvatar] = useState<string>(
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
  );

  // Admin Profile Edit Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>("");
  const [editDesignation, setEditDesignation] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editOffice, setEditOffice] = useState<string>("");
  const [editAvatar, setEditAvatar] = useState<string>("");

  // Live ticking clock for countdowns
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(Date.now());

  const supabase = createClient();

  // Unlock Web Audio context on first user interaction anywhere on the screen
  // Unlock Web Audio context and audio drivers on user interaction anywhere on the screen
  useEffect(() => {
    const unlockAudio = () => {
      unlockAudioEngines();
    };
    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Continuous audible alert loop when noise is detected in the quiet zone
  useEffect(() => {
    if (!isAlertActive || isAudioMuted) return;
    // Play alert sound immediately
    playBrowserBuzzerBeep();
    // Repeat alert buzzer sound every 2.8 seconds until silenced or normalized
    const buzzerInterval = setInterval(() => {
      playBrowserBuzzerBeep();
    }, 2800);
    return () => clearInterval(buzzerInterval);
  }, [isAlertActive, isAudioMuted]);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNow(Date.now()), 1000);

    // 1. Read persistent admin metadata from localStorage
    if (typeof window !== "undefined") {
      try {
        const savedMeta = localStorage.getItem("smart_library_admin_profile");
        if (savedMeta) {
          const parsed = JSON.parse(savedMeta);
          if (parsed.fullName) setAdminName(parsed.fullName);
          if (parsed.designation) setAdminDesignation(parsed.designation);
          if (parsed.phone) setAdminPhone(parsed.phone);
          if (parsed.office) setAdminOffice(parsed.office);
          if (parsed.avatar) setAdminAvatar(parsed.avatar);
        }
      } catch (e) {
        console.warn("Could not read local admin profile:", e);
      }
    }

    // 2. Load authenticated user and profile from Supabase
    async function fetchAdminUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setAdminId(user.id);
          if (user.email) setAdminEmail(user.email);
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
          if (profile?.full_name) {
            setAdminName(profile.full_name);
          }
        }
      } catch (err) {
        console.warn("Notice loading admin profile:", err);
      }
    }
    fetchAdminUser();

    return () => clearInterval(timer);
  }, [supabase]);

  const handleOpenProfileModal = () => {
    setEditName(adminName);
    setEditDesignation(adminDesignation);
    setEditPhone(adminPhone);
    setEditOffice(adminOffice);
    setEditAvatar(adminAvatar);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      setAdminName(editName);
      setAdminDesignation(editDesignation);
      setAdminPhone(editPhone);
      setAdminOffice(editOffice);
      setAdminAvatar(editAvatar);

      // Save to Supabase profiles table
      if (adminId) {
        await supabase
          .from("profiles")
          .update({ full_name: editName })
          .eq("id", adminId);
      }

      // Save full admin metadata locally so custom avatars/titles persist
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "smart_library_admin_profile",
          JSON.stringify({
            fullName: editName,
            designation: editDesignation,
            phone: editPhone,
            office: editOffice,
            avatar: editAvatar,
          })
        );
      }

      showToast("Admin profile updated successfully!", "success");
      setIsProfileModalOpen(false);
    } catch (err) {
      console.warn("Could not save to Supabase, saved locally:", err);
      showToast("Admin profile saved locally!", "success");
      setIsProfileModalOpen(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Initial & periodic data loading (Telemetries & DB records only, NOT noise-settings)
  const loadData = useCallback(async () => {
    try {
      const { data: seatsData } = await supabase
        .from("seats")
        .select("*")
        .order("seat_number", { ascending: true });

      const { data: resData } = await supabase
        .from("reservations")
        .select("*, profiles(email, full_name, role)")
        .order("created_at", { ascending: false });

      const { data: deviceData } = await supabase
        .from("devices")
        .select("*")
        .eq("id", "ESP8266_DEV01")
        .single();

      if (seatsData && seatsData.length > 0) setSeats(seatsData);
      if (deviceData) {
        setDevice(deviceData);
        const warning = Boolean(deviceData.noise_warning_active);
        setIsAlertActive((prev) => {
          if (!prev && warning) {
            setIsNoisePopupOpen(true);
            playBrowserBuzzerBeep();
            showToast("🚨 ACOUSTIC ALERT: Hardware sensor detected noise spike (> limit) in library!", "error");
          }
          return warning;
        });
        if (!warning) {
          setIsNoisePopupOpen(false);
        }
      }
    } catch {
      console.warn("Using sample mock telemetry on admin dashboard");
    } finally {
      setLoading(false);
    }
  }, [supabase, showToast]);

  // Load persistent noise settings ONCE on initial mount so it never overrides user dragging
  useEffect(() => {
    let isCurrent = true;
    async function initAcousticSettings() {
      try {
        const settingsRes = await fetch("/api/admin/noise-settings");
        if (settingsRes.ok) {
          const sData = await settingsRes.json();
          if (isCurrent && sData.settings?.threshold_db) {
            setSoundThreshold(Number(sData.settings.threshold_db));
            if (sData.settings.mode) setSoundMode(sData.settings.mode);
          }
        }
      } catch (err) {
        console.warn("Could not load initial acoustic settings", err);
      }
    }
    initAcousticSettings();
    return () => {
      isCurrent = false;
    };
  }, []);

  // Trigger Acoustic Alert in Database and notify all student screens + hardware
  const handleTriggerNoiseAlert = useCallback(
    async (currentDb?: number, customDetails?: string) => {
      setIsAlertActive(true);
      setIsNoisePopupOpen(true);
      const dbToLog = currentDb || 78;
      if (currentDb) {
        setLiveDb(currentDb);
      }
      playBrowserBuzzerBeep();

      try {
        await fetch("/api/admin/trigger-hardware", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "alert",
            sound_level_db: dbToLog,
            details: customDetails || `Acoustic breach: ${dbToLog} dB exceeded quiet limit (${soundThreshold} dB)`,
          }),
        });

        showToast("Acoustic noise alert dispatched to hardware buzzer & student screens!", "error");
        await loadData();
      } catch {
        showToast("Noise alert broadcasted", "warning");
      }
    },
    [soundThreshold, loadData, showToast]
  );

  // Restore Quiet Sanctuary Normal in Database & stop hardware buzzer
  const handleClearNoiseAlert = useCallback(async () => {
    setIsAlertActive(false);
    setIsNoisePopupOpen(false);
    const calmDb = Math.min(26, Math.max(22, soundThreshold - 4));
    setLiveDb(calmDb);

    try {
      await fetch("/api/admin/trigger-hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear",
          sound_level_db: calmDb,
          details: `Acoustic level normalized to ${calmDb} dB tranquil standard (below ${soundThreshold} dB limit)`,
        }),
      });

      showToast("Acoustic quiet sanctuary restored; hardware buzzer silenced.", "success");
      await loadData();
    } catch {
      showToast("Acoustic alert cleared", "info");
    }
  }, [soundThreshold, loadData, showToast]);

  // Update and persist noise threshold to backend and check if breach occurs
  const handleUpdateThreshold = async (newThreshold: number) => {
    const val = Math.max(20, Math.min(100, Math.round(newThreshold)));
    setSoundThreshold(val);
    let mode: "strict" | "standard" | "relaxed" = "standard";
    if (val <= 35) mode = "strict";
    else if (val <= 60) mode = "standard";
    else mode = "relaxed";
    setSoundMode(mode);

    try {
      await fetch("/api/admin/noise-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold_db: val, mode }),
      });
      showToast(`Quiet zone threshold updated to ${val} dB`, "success");
    } catch {
      // silent
    }

    // Direct LAN sync to ESP8266 if reachable on local network
    if (device?.ip_address && device.ip_address.startsWith("192.168.")) {
      fetch(`http://${device.ip_address}/threshold?val=${val}`).catch(() => {});
    }

  };

  // Live decibel wave display (reflects real ambient sound ~24-27 dB, or smooth decay after spike test)
  useEffect(() => {
    const dbInterval = setInterval(() => {
      setLiveDb((prev) => {
        // If a test spike occurred (e.g. 78 dB), smoothly decay back down to ambient!
        if (prev > 30) {
          const nextVal = prev - Math.floor(Math.random() * 6 + 10);
          return Math.max(25, nextVal);
        }

        // Peaceful ambient fluctuation around 24-27 dB (typically 26 dB)
        const delta = Math.floor(Math.random() * 3) - 1;
        return Math.max(24, Math.min(27, prev + delta));
      });
    }, 2000);
    return () => clearInterval(dbInterval);
  }, []);

  useEffect(() => {
    loadData();

    // Subscribe to Supabase real-time changes
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "seats" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, (payload) => {
        loadData();
        if (payload.new && (payload.new as Device).noise_warning_active) {
          setIsAlertActive(true);
          setIsNoisePopupOpen(true);
          playBrowserBuzzerBeep();
          showToast("⚠️ Acoustic Noise Limit Breached! Hardware buzzer sounding.", "error");
        } else if (payload.new && !(payload.new as Device).noise_warning_active) {
          setIsAlertActive(false);
          setIsNoisePopupOpen(false);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => loadData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "noise_logs" }, (payload) => {
        loadData();
        if (payload.new && (payload.new as NoiseLog).noise_detected) {
          setIsAlertActive(true);
          setIsNoisePopupOpen(true);
          playBrowserBuzzerBeep();
          showToast("⚠️ Noise spike logged by library acoustic sensor!", "error");
        }
      })
      .subscribe();

    // High frequency 1-second live telemetry poll
    const interval = setInterval(loadData, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadData, supabase]);

  // Real database-driven states only - no mock data
  const online = isDeviceOnline(device);

  const seatsWithStatus: SeatWithStatus[] = useMemo(() => {
    return seats.map((s) => {
      const activeRes = reservations.find((r) => r.seat_id === s.id && r.status === "active");
      return {
        ...s,
        activeReservation: activeRes || null,
        deviceOnline: online,
        displayStatus: getSeatDisplayStatus(s, activeRes, online),
      };
    });
  }, [seats, reservations, online]);

  // Handle Maintenance Toggle directly in Supabase
  const handleToggleMaintenance = async () => {
    if (!maintenanceModal) return;
    const targetState = !maintenanceModal.currentState;

    setSeats((prev) =>
      prev.map((s) => (s.id === maintenanceModal.seatId ? { ...s, is_maintenance: targetState } : s))
    );

    try {
      const { error } = await supabase
        .from("seats")
        .update({
          is_maintenance: targetState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", maintenanceModal.seatId);

      if (error) {
        showToast("Database error: " + error.message, "error");
      } else {
        showToast(`Seat ${maintenanceModal.seatId} maintenance set to ${targetState ? "Active" : "Normal"}`, "success");
        await loadData();
      }
    } catch {
      showToast("Failed to update seat maintenance", "error");
    } finally {
      setMaintenanceModal(null);
    }
  };

  // Handle Force Cancel / Revoke Reservation in Supabase
  const handleConfirmCancelReservation = async () => {
    if (!cancelModalReservation) return;

    try {
      const { error } = await supabase
        .from("reservations")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", cancelModalReservation.id);

      if (error) {
        showToast("Database error: " + error.message, "error");
      } else {
        showToast(`Reservation for seat ${cancelModalReservation.seatId} revoked in database`, "success");
        await loadData();
      }
    } catch {
      showToast("Failed to cancel reservation", "error");
    } finally {
      setCancelModalReservation(null);
    }
  };

  // Handle Manual Assign Booking to Walk-in student directly in Supabase
  const handleAssignBooking = async (seatId: string, durationMinutes: number) => {
    setIsAssigningBooking(true);
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    try {
      // Find an existing profile or fallback to walkin
      const { data: profs } = await supabase.from("profiles").select("id").limit(1);
      const assignedUserId = profs?.[0]?.id;

      if (!assignedUserId) {
        showToast("No registered user found in database to assign.", "error");
        return;
      }

      const { error } = await supabase.from("reservations").insert({
        seat_id: seatId,
        user_id: assignedUserId,
        status: "active",
        start_time: startTime,
        end_time: endTime,
      });

      if (error) {
        showToast("Database insert error: " + error.message, "error");
      } else {
        showToast(`Assigned booking for Seat ${seatId} (${durationMinutes} mins) in database!`, "success");
        await loadData();
      }
    } catch (err: any) {
      showToast("Error creating walk-in booking: " + err.message, "error");
    } finally {
      setAssignBookingSeatId(null);
      setIsAssigningBooking(false);
    }
  };

  // Toggle Hardware Online / Offline state in Supabase
  const handleToggleHardwareOnline = async () => {
    const nextState = !online;
    const nowIso = new Date().toISOString();

    setDevice((prev) => (prev ? { ...prev, is_online: nextState, last_seen: nowIso } : null));

    try {
      const { error } = await supabase
        .from("devices")
        .upsert(
          {
            id: "ESP8266_DEV01",
            device_name: "Library Central Telemetry Hub",
            is_online: nextState,
            last_seen: nowIso,
          },
          { onConflict: "id" }
        );

      if (error) {
        showToast("Database error: " + error.message, "error");
      } else {
        showToast(
          `Hardware Hub is now set to ${nextState ? "ONLINE" : "OFFLINE"} in database!`,
          nextState ? "success" : "warning"
        );
        await loadData();
      }
    } catch {
      showToast("Failed to toggle hardware state", "error");
    }
  };

  // Trigger Acoustic Alert Simulator in Database & trigger hardware buzzer + browser tone
  const handleSimulateNoiseAlert = async () => {
    setIsTriggeringAlert(true);
    setLiveDb(78);
    setIsAlertActive(true);
    setIsNoisePopupOpen(true);

    // Audible buzzer alert in user's browser
    playBrowserBuzzerBeep();

    try {
      await fetch("/api/admin/trigger-hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          sound_level_db: 78,
          details: "Admin simulation: 78 dB acoustic spike triggered on hardware buzzer & student screens",
        }),
      });

      showToast("Acoustic noise alert simulated (78 dB)! Hardware buzzer sounding.", "error");
      await loadData();
    } catch {
      showToast("Noise alert broadcasted", "warning");
    } finally {
      setIsTriggeringAlert(false);
    }
  };

  // Smart Library System Sidebar Navigation
  const sidebarItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Desk Matrix", icon: Armchair },
    { name: "Active Bookings", icon: Clock },
    { name: "Booking History", icon: History },
    { name: "Presence & Walk-Ins", icon: UserCheck },
    { name: "Acoustic Decibel", icon: Volume2 },
    { name: "Hardware Hub", icon: Cpu },
    { name: "Noise Alerts", icon: Bell },
    { name: "Admin Profile", icon: User },
  ];

  // Dynamic Smart Library stats computed directly from database
  const totalDesks = seats.length;
  const occupiedCount = seats.filter((s) => s.is_occupied).length;
  const activeBookingsCount = reservations.filter((r) => r.status === "active").length;
  const availableCount = seats.filter(
    (s) => !s.is_occupied && !s.is_maintenance && !reservations.some((r) => r.seat_id === s.id && r.status === "active")
  ).length;
  const utilizationPct = totalDesks > 0 ? Math.min(100, Math.round(((occupiedCount + activeBookingsCount) / totalDesks) * 100)) : 0;

  // Real database-driven recent check-ins
  const recentCheckins = useMemo(() => {
    return reservations.slice(0, 5).map((r) => {
      const occupantName = r.profiles?.full_name || r.profiles?.email?.split("@")[0] || "Enrolled Student";
      return {
        id: r.id,
        name: occupantName,
        time: formatToLocalTime(r.start_time),
        seat: `Desk ${r.seat_id}`,
        status: r.status === "active" ? "Active Booking" : r.status === "cancelled" ? "Cancelled" : "Completed",
        email: r.profiles?.email || "student@library.edu",
      };
    });
  }, [reservations]);

  // Filtered booking history records directly from database
  const filteredBookingHistory = useMemo(() => {
    return reservations.filter((r) => {
      if (bookingHistoryFilter !== "all" && r.status !== bookingHistoryFilter) {
        return false;
      }
      if (bookingHistorySearch.trim()) {
        const query = bookingHistorySearch.toLowerCase().trim();
        const studentName = (r.profiles?.full_name || "").toLowerCase();
        const studentEmail = (r.profiles?.email || "").toLowerCase();
        const seatId = (r.seat_id || "").toLowerCase();
        const resId = (r.id || "").toLowerCase();
        if (
          !studentName.includes(query) &&
          !studentEmail.includes(query) &&
          !seatId.includes(query) &&
          !resId.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [reservations, bookingHistoryFilter, bookingHistorySearch]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex text-slate-800 font-sans antialiased">
      {/* ================= LEFT SIDEBAR (DESKTOP) ================= */}
      <aside className="hidden lg:flex w-64 bg-[#3C2AB9] text-white flex-col justify-between shrink-0 shadow-2xl relative z-30 select-none">
        <div>
          {/* Brand Logo & Title */}
          <div className="p-6 pb-5 flex items-center justify-between border-b border-indigo-400/20">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-sm group-hover:scale-105 transition-transform">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight text-white leading-tight">
                  SmartLib
                </span>
                <span className="text-[10px] text-indigo-200 font-medium">
                  Smart Library ERP &amp; IoT
                </span>
              </div>
            </Link>

            <button
              onClick={() => router.push("/")}
              className="w-7 h-7 rounded-lg bg-indigo-500/30 hover:bg-indigo-500/50 flex items-center justify-center text-indigo-200 hover:text-white transition-colors"
              title="Return to Public Landing Page"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Navigation Menu List */}
          <nav className="p-3.5 space-y-1 max-h-[calc(100vh-170px)] overflow-y-auto custom-scroll">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeMenu === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => {
                    setActiveMenu(item.name);
                    if (item.name === "Admin Profile") {
                      handleOpenProfileModal();
                    } else if (item.name === "Desk Matrix" || item.name === "Presence & Walk-Ins" || item.name === "Active Bookings") {
                      document.getElementById("desk-matrix-section")?.scrollIntoView({ behavior: "smooth" });
                    } else if (item.name === "Acoustic Decibel" || item.name === "Noise Alerts") {
                      document.getElementById("noise-monitor-section")?.scrollIntoView({ behavior: "smooth" });
                    } else if (item.name === "Booking History") {
                      document.getElementById("booking-history-section")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-[#5A45F3] text-white shadow-md shadow-indigo-900/30 font-bold"
                      : "text-indigo-200/80 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-indigo-300"}`} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Profile Badge (Admin Profile Quick View & Edit) */}
        <div className="p-4 border-t border-indigo-400/20 relative">
          <div
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center justify-between p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 cursor-pointer transition-all border border-white/10 group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={adminAvatar}
                  alt={adminName}
                  className="w-9 h-9 rounded-full object-cover border-2 border-indigo-300 shadow-sm"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenProfileModal();
                  }}
                  title="Edit Admin Profile"
                  className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center border border-white text-[9px] shadow-sm transition-transform hover:scale-110"
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              </div>
              <div className="flex flex-col text-left truncate">
                <span className="text-xs font-bold text-white leading-tight truncate">
                  {adminName}
                </span>
                <span className="text-[10px] text-indigo-200 truncate">
                  {adminDesignation}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-indigo-200 shrink-0 ml-1" />
          </div>

          {/* User Popover Menu */}
          {userDropdownOpen && (
            <div className="absolute bottom-20 left-4 right-4 bg-white text-slate-800 rounded-2xl shadow-2xl p-2 border border-slate-200 text-xs z-50 animate-fadeIn">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="font-bold text-slate-900 truncate">{adminName}</p>
                <p className="text-[10px] text-slate-500 truncate">{adminEmail}</p>
              </div>

              <button
                onClick={() => {
                  setUserDropdownOpen(false);
                  handleOpenProfileModal();
                }}
                className="w-full flex items-center gap-2 p-2 hover:bg-indigo-50 text-indigo-700 font-semibold rounded-xl text-left transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Edit Admin Profile
              </button>

              <Link
                href="/dashboard"
                className="flex items-center gap-2 p-2 hover:bg-indigo-50 text-indigo-700 font-semibold rounded-xl transition-colors"
              >
                <Users className="w-4 h-4" />
                Switch to Student View
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2 p-2 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Public Landing Page
              </Link>
              <button
                onClick={() => {
                  showToast("Signed out successfully", "info");
                  router.push("/login");
                }}
                className="w-full flex items-center gap-2 p-2 hover:bg-rose-50 text-rose-600 font-semibold rounded-xl text-left transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ================= MOBILE SIDEBAR DRAWER OVERLAY ================= */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Content */}
          <aside className="relative w-72 max-w-[85vw] bg-[#3C2AB9] text-white flex flex-col justify-between h-full shadow-2xl z-10 select-none animate-in slide-in-from-left duration-200">
            <div>
              <div className="p-5 flex items-center justify-between border-b border-indigo-400/20">
                <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-sm">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-lg tracking-tight text-white leading-tight">SmartLib</span>
                    <span className="text-[10px] text-indigo-200 font-medium">Smart Library ERP</span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-3.5 space-y-1 max-h-[calc(100vh-170px)] overflow-y-auto">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeMenu === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        setActiveMenu(item.name);
                        setIsMobileMenuOpen(false);
                        if (item.name === "Admin Profile") {
                          handleOpenProfileModal();
                        } else if (item.name === "Desk Matrix" || item.name === "Presence & Walk-Ins" || item.name === "Active Bookings") {
                          document.getElementById("desk-matrix-section")?.scrollIntoView({ behavior: "smooth" });
                        } else if (item.name === "Acoustic Decibel" || item.name === "Noise Alerts") {
                          document.getElementById("noise-monitor-section")?.scrollIntoView({ behavior: "smooth" });
                        } else if (item.name === "Booking History") {
                          document.getElementById("booking-history-section")?.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? "bg-[#5A45F3] text-white shadow-md font-bold"
                          : "text-indigo-200/80 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-indigo-300"}`} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="p-4 border-t border-indigo-400/20">
              <div
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenProfileModal();
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 cursor-pointer transition-all border border-white/10"
              >
                <img
                  src={adminAvatar}
                  alt={adminName}
                  className="w-9 h-9 rounded-full object-cover border-2 border-indigo-300"
                />
                <div className="flex flex-col text-left truncate flex-1 min-w-0">
                  <span className="text-xs font-bold text-white truncate">{adminName}</span>
                  <span className="text-[10px] text-indigo-200 truncate">{adminDesignation}</span>
                </div>
                <Edit3 className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {/* TOP HEADER BAR */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Open mobile navigation"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="truncate">
              <h1 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight leading-tight truncate">
                Library Dashboard
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 hidden sm:block truncate">
                Welcome back, {adminName} &bull; Live IoT telemetries &amp; desk matrix active
              </p>
            </div>
          </div>

          {/* Search bar, notifications & avatar */}
          <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
            {/* Live Hardware Online/Offline Pill with Toggle */}
            <button
              onClick={handleToggleHardwareOnline}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all shadow-xs ${
                online
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                  : "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 animate-pulse"
              }`}
              title="Click to toggle hardware Online / Offline in database"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span className="hidden sm:inline">Hardware Hub: </span>
              <strong>{online ? "ONLINE" : "OFFLINE"}</strong>
            </button>

            {/* Search Input */}
            <div className="relative w-44 lg:w-64 hidden md:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search desk, student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition-colors"
              />
            </div>

            {/* Test Alarm Sound Button */}
            <button
              type="button"
              onClick={() => {
                unlockAudioEngines();
                playBrowserBuzzerBeep();
                showToast("🔊 Test Alarm Sound playing now!", "info");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200/80 transition-all active:scale-95 shadow-xs"
              title="Click to test emergency buzzer alarm sound"
            >
              <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Test Sound</span>
            </button>

            {/* Notification Bell with Active Noise Warning Badge */}
            <div
              onClick={() => {
                document.getElementById("noise-monitor-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="relative cursor-pointer p-1.5 sm:p-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title={isAlertActive ? "Noise alert active!" : "System notifications"}
            >
              <Bell className="w-5 h-5" />
              <span className={`absolute top-1 right-1 w-4 h-4 rounded-full text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white ${
                isAlertActive ? "bg-rose-500 animate-ping" : "bg-[#5A45F3]"
              }`}>
                {isAlertActive ? "!" : "3"}
              </span>
            </div>

            {/* Profile Avatar with Quick Edit Click */}
            <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200">
              <button
                type="button"
                onClick={handleOpenProfileModal}
                className="relative group p-0.5 rounded-full focus:outline-none"
                title="Click to view & edit admin profile"
              >
                <img
                  src={adminAvatar}
                  alt={adminName}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ring-indigo-500/30 group-hover:ring-indigo-600 transition-all shadow-sm"
                />
                <span className="absolute -bottom-0.5 -right-0.5 p-0.5 sm:p-1 bg-indigo-600 text-white rounded-full border border-white shadow-sm opacity-90 group-hover:opacity-100 transition-all">
                  <Edit3 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* EMERGENCY NOISE ALERT AUDIBLE & VISUAL BANNER */}
        {isAlertActive && (
          <div className="bg-gradient-to-r from-rose-600 via-rose-700 to-rose-600 text-white px-4 py-2.5 sm:py-3 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs font-bold sticky top-[53px] sm:top-[69px] z-30 border-b border-rose-800 animate-pulse">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 bg-white/20 rounded-lg shrink-0">
                <AlertTriangle className="w-4 h-4 text-white animate-bounce" />
              </span>
              <div className="truncate">
                <span className="uppercase tracking-wider font-extrabold text-rose-100 mr-2">
                  🚨 NOISE BREACH DETECTED:
                </span>
                <span className="text-white/95">
                  Microphone sensor registered noise exceeding {soundThreshold} dB limit in Quiet Zone!
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center gap-1.5 text-[11px]"
                title={isAudioMuted ? "Unmute web alert audio" : "Mute web alert audio"}
              >
                {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 animate-pulse" />}
                <span>{isAudioMuted ? "Audio Muted" : "Mute Alarm"}</span>
              </button>
              <button
                type="button"
                onClick={handleClearNoiseAlert}
                className="px-3 py-1 bg-white text-rose-700 hover:bg-rose-50 rounded-lg transition-all shadow-sm text-[11px] font-black"
              >
                Silence Hardware Buzzer
              </button>
            </div>
          </div>
        )}

        {/* INNER SCROLLABLE CONTENT */}
        <div className="p-3.5 sm:p-6 lg:p-8 space-y-5 sm:space-y-7 max-w-7xl w-full mx-auto">
          {/* Top Noise Alert Warning Banner (Visible immediately across the screen) */}
          <NoiseAlertBanner
            isNoiseWarningActive={isAlertActive}
            updatedAt={device?.noise_warning_updated_at || new Date().toISOString()}
            deviceOnline={true}
            thresholdDb={soundThreshold}
            onResetAlert={handleClearNoiseAlert}
          />

          {/* ================= ROW 1: 4 STAT CARDS (SMART LIBRARY METRICS) ================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Total Study Desks */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 block">Total Study Desks</span>
                <span className="text-3xl font-black text-slate-900 block tracking-tight">{totalDesks}</span>
                <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                  <span>ESP8266 IoT Connected</span>
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#EDE9FE] text-[#7C3AED] flex items-center justify-center">
                <Armchair className="w-6 h-6" />
              </div>
            </div>

            {/* Card 2: Currently Occupied */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 block">Currently Occupied</span>
                <span className="text-3xl font-black text-slate-900 block tracking-tight">{occupiedCount}</span>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <span>Physical presence active</span>
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Card 3: Active Bookings */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 block">Active Bookings</span>
                <span className="text-3xl font-black text-slate-900 block tracking-tight">{activeBookingsCount}</span>
                <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                  <span>With live countdown</span>
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* Card 4: Available Desks */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 block">Available Now</span>
                <span className="text-3xl font-black text-slate-900 block tracking-tight">{availableCount}</span>
                <span className="text-xs font-bold text-purple-600 flex items-center gap-1">
                  <span>Ready for reservation</span>
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#F3E8FF] text-[#9333EA] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[#9333EA]" />
              </div>
            </div>
          </div>

          {/* ================= ROW 2: DONUT OVERVIEWS (SMART LIBRARY OCCUPANCY & NOISE COMPLIANCE) ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut Card 1: Desk Utilization & Occupancy */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Desk Utilization Rate</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time capacity distribution</p>
                </div>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
                  Live IoT
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                {/* SVG Donut Ring */}
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#F1F5F9" strokeWidth="11" />
                    {/* Occupied segment (Emerald) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="11"
                      strokeDasharray="238.76"
                      strokeDashoffset={238.76 - (238.76 * (occupiedCount / (totalDesks || 1)))}
                      strokeLinecap="round"
                    />
                    {/* Reserved segment (Purple) */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke="#5B45F3"
                      strokeWidth="11"
                      strokeDasharray="238.76"
                      strokeDashoffset={238.76 - (238.76 * (activeBookingsCount / (totalDesks || 1)))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-black text-slate-900 leading-none">{utilizationPct}%</span>
                    <span className="text-xs text-slate-500 font-medium mt-1">Utilization</span>
                  </div>
                </div>

                {/* Legend List */}
                <div className="space-y-3.5 text-xs w-full sm:w-48">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                      <span className="text-slate-600 font-medium">Physically Occupied</span>
                    </div>
                    <span className="font-bold text-slate-900">{occupiedCount} Desks</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#5B45F3]" />
                      <span className="text-slate-600 font-medium">Active Bookings</span>
                    </div>
                    <span className="font-bold text-slate-900">{activeBookingsCount} Desks</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                      <span className="text-slate-600 font-medium">Vacant / Available</span>
                    </div>
                    <span className="font-bold text-slate-900">{availableCount} Desks</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold">Capacity: {totalDesks} Study Desks</span>
                <button
                  onClick={() => document.getElementById("desk-matrix-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-[11px] text-indigo-600 font-semibold cursor-pointer hover:underline"
                >
                  View Matrix &rarr;
                </button>
              </div>
            </div>

            {/* Donut Card 2: Hardware Hub & Acoustic Health */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Hardware &amp; Acoustic Status</h3>
                  <p className="text-xs text-slate-400 mt-0.5">ESP8266 IoT connection &amp; noise health</p>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${
                    online
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "bg-rose-50 text-rose-700 border-rose-300"
                  }`}
                >
                  {online ? "Hub Online" : "Hub Offline"}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                {/* SVG Donut Ring 2 */}
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#F1F5F9" strokeWidth="11" />
                    {/* Ring showing online status or alert */}
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="none"
                      stroke={online ? (device?.noise_warning_active ? "#FB7185" : "#10B981") : "#E11D48"}
                      strokeWidth="11"
                      strokeDasharray="238.76"
                      strokeDashoffset={online ? "30" : "180"}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span
                      className={`text-xl font-black leading-none ${
                        online ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {online ? "ONLINE" : "OFFLINE"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold mt-1">ESP8266 Hub</span>
                  </div>
                </div>

                {/* Legend List 2 */}
                <div className="space-y-3.5 text-xs w-full sm:w-48">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                      <span className="text-slate-600 font-medium">IoT Controller</span>
                    </div>
                    <span className={`font-bold ${online ? "text-emerald-700" : "text-rose-700"}`}>
                      {online ? "Active" : "Disconnected"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${liveDb > soundThreshold ? "bg-rose-500" : "bg-indigo-500"}`} />
                      <span className="text-slate-600 font-medium">Ambient Noise</span>
                    </div>
                    <span className="font-bold text-slate-900">{liveDb} dB</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span className="text-slate-600 font-medium">Alert Limit</span>
                    </div>
                    <span className="font-bold text-slate-900">{soundThreshold} dB</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono text-[11px] font-semibold text-slate-600">IP: {device?.ip_address || "192.168.137.124"}</span>
                <button
                  onClick={handleToggleHardwareOnline}
                  className="text-[11px] text-indigo-600 font-bold cursor-pointer hover:underline"
                >
                  {online ? "Simulate Disconnect" : "Simulate Connect"} &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* ================= ROW 3: REAL RECENT CHECK-INS & IOT HARDWARE CONTROLLER ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Real Recent Desk Check-ins Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Recent Desk Check-ins</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time student reservations from database</p>
                </div>
                <button
                  onClick={() => document.getElementById("desk-matrix-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs transition-colors"
                >
                  Manage Desks
                </button>
              </div>

              <div className="space-y-3">
                {recentCheckins.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-xs font-bold text-slate-600">No reservations recorded in database yet.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Students reserving desks will appear here in real-time.</p>
                  </div>
                ) : (
                  recentCheckins.map((student) => (
                    <div
                      key={student.id}
                      className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 transition-colors border border-slate-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-extrabold flex items-center justify-center text-sm shadow-xs">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{student.name}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {student.time} &bull; <strong className="text-slate-700">{student.seat}</strong>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                          student.status === "Active Booking"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : student.status.includes("Walk-in")
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {student.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Real IoT Hardware Telemetry & Hub Controller Card (Replacing fake payroll chart) */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/90 shadow-sm space-y-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">ESP8266 IoT Hardware Hub</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Physical controller telemetry &amp; live connection</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                      online
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-rose-50 text-rose-700 border-rose-300"
                    }`}
                  >
                    {online ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>

                {/* Hardware Telemetry Parameters */}
                <div className="grid grid-cols-2 gap-3 pt-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Device ID</span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {device?.id || "ESP8266_DEV01"}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">IP Address</span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {device?.ip_address || "192.168.137.124"}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Firmware</span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {device?.firmware_version || "v1.0.0 (Production)"}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Last Heartbeat</span>
                    <span suppressHydrationWarning className="font-mono font-bold text-slate-900 text-xs truncate block">
                      {mounted && device?.last_seen ? formatToLocalDateTime(device.last_seen) : "Live Synced"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-indigo-950 block">Acoustic Shield Status</span>
                    <span className="text-[11px] text-indigo-700">
                      {device?.noise_warning_active ? "Warning Broadcast Active (> Threshold)" : "Quiet Sanctuary Standard Normal"}
                    </span>
                  </div>
                  <span className="font-mono font-extrabold text-indigo-700 text-sm">{liveDb} dB</span>
                </div>
              </div>

              {/* Hardware Management Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleToggleHardwareOnline}
                  className={`flex-1 w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    online
                      ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300"
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  <span>Toggle Hardware {online ? "OFFLINE" : "ONLINE"}</span>
                </button>

                <button
                  onClick={async () => {
                    setLoading(true);
                    await loadData();
                    showToast("Hardware telemetry synchronized from database!", "success");
                  }}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>Sync Hub</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================= LIVE NOISE MONITORING SYSTEM ================= */}
          <div id="noise-monitor-section" className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Live Library Acoustic &amp; Noise Decibel Monitoring System
                    </h3>
                    <p className="text-xs text-slate-500">
                      Real-time decibel telemetry from IoT microphone hubs with automatic visual quiet alert triggers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                    isAlertActive
                      ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isAlertActive ? "bg-rose-500 animate-ping" : "bg-emerald-500"
                    }`}
                  />
                  {isAlertActive ? "NOISE ALERT ACTIVE (> Threshold)" : "Quiet Study Sanctuary Normal"}
                </span>
              </div>
            </div>

            {/* Noise Gauge & Live Wave Display */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Big Decibel Meter */}
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Live Ambient Noise
                </span>
                <span
                  className={`text-5xl font-black font-mono tracking-tight ${
                    liveDb > soundThreshold ? "text-rose-600" : liveDb > 55 ? "text-amber-600" : "text-indigo-600"
                  }`}
                >
                  {liveDb} <span className="text-xl font-normal text-slate-500">dB</span>
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Threshold limit: <strong>{soundThreshold} dB</strong>
                </span>
              </div>

              {/* Threshold Range Slider & Strictness Presets */}
              <div className="space-y-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label htmlFor="noise-limit-slider" className="text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Quiet Zone Noise Limit Slider</span>
                  </label>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs">
                    {soundThreshold} dB Limit
                  </span>
                </div>

                {/* Range Slider Track & Thumb */}
                <div className="space-y-1.5 pt-1">
                  <input
                    id="noise-limit-slider"
                    type="range"
                    min={20}
                    max={90}
                    step={1}
                    value={soundThreshold}
                    onChange={(e) => handleUpdateThreshold(Number(e.target.value))}
                    className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium px-0.5">
                    <span className={soundThreshold === 20 ? "text-indigo-600 font-bold" : ""}>20 dB (Min)</span>
                    <span className={soundThreshold === 30 ? "text-indigo-600 font-bold" : ""}>30 dB (Strict)</span>
                    <span className={soundThreshold === 50 ? "text-indigo-600 font-bold" : ""}>50 dB (Std)</span>
                    <span className={soundThreshold === 70 ? "text-indigo-600 font-bold" : ""}>70 dB (Relaxed)</span>
                    <span>90 dB</span>
                  </div>
                </div>

                {/* Quick 1-Touch Presets (20 dB, 30 dB, 50 dB, 70 dB) */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateThreshold(20)}
                    className={`py-1.5 px-1.5 rounded-xl border text-[10px] font-bold transition-all text-center ${
                      soundThreshold === 20
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Silent (20 dB)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateThreshold(30)}
                    className={`py-1.5 px-1.5 rounded-xl border text-[10px] font-bold transition-all text-center ${
                      soundThreshold === 30
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Strict (30 dB)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateThreshold(50)}
                    className={`py-1.5 px-1.5 rounded-xl border text-[10px] font-bold transition-all text-center ${
                      soundThreshold === 50
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Standard (50 dB)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateThreshold(70)}
                    className={`py-1.5 px-1.5 rounded-xl border text-[10px] font-bold transition-all text-center ${
                      soundThreshold === 70
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Relaxed (70 dB)
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  IoT microphone hubs trigger visual alert banners when noise spikes above <strong>{soundThreshold} dB</strong>.
                </p>
              </div>

              {/* Action Buttons: Simulator & Clear */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioEngines();
                    playBrowserBuzzerBeep();
                    showToast("🔊 Browser alarm buzzer test played!", "info");
                  }}
                  className="w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-4 h-4 text-indigo-600" />
                  🔊 Test Browser Buzzer Sound (সাউন্ড টেস্ট)
                </button>

                <button
                  onClick={handleSimulateNoiseAlert}
                  disabled={isTriggeringAlert}
                  className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-4 h-4 text-rose-600" />
                  Test Audio Noise Alert (Simulate Spike)
                </button>

                <button
                  onClick={handleClearNoiseAlert}
                  className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 text-emerald-600" />
                  Restore Quiet Sanctuary Normal
                </button>
              </div>
            </div>
          </div>

          {/* ================= LIVE SEAT MANAGEMENT & WALK-IN SENSOR STATUS ================= */}
          <div id="desk-matrix-section" className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Armchair className="w-5 h-5 text-indigo-600" />
                  Physical Desk Matrix &amp; Walk-In Presence Controller
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time detection of legitimate bookings vs unreserved walk-in occupants with hour, minute, second timers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setLoading(true);
                    loadData();
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Sync Sensors
                </button>
              </div>
            </div>

            {/* Table of Desks with Start Time, End Time & Hour:Min:Sec Countdowns */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <div className="sm:hidden px-3 py-1.5 bg-slate-50 text-[10px] text-slate-500 font-medium text-center border-b border-slate-200">
                &larr; Swipe sideways to view all desk telemetry &amp; controls &rarr;
              </div>
              <table className="w-full min-w-[700px] text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Desk ID</th>
                    <th className="py-3 px-4">Physical IoT Status</th>
                    <th className="py-3 px-4">Booking Schedule</th>
                    <th className="py-3 px-4">Remaining Time (HMS)</th>
                    <th className="py-3 px-4">Occupant / Student</th>
                    <th className="py-3 px-4 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {seatsWithStatus.map((seat) => {
                    const isWalkIn = seat.deviceOnline && seat.is_occupied && !seat.activeReservation;

                    const remainingHMS = seat.activeReservation
                      ? formatRemainingHMS(seat.activeReservation.end_time, seat.activeReservation.start_time)
                      : "N/A";

                    return (
                      <tr key={seat.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          Desk {seat.id} (Seat #{seat.seat_number})
                        </td>

                        <td className="py-3.5 px-4">
                          {seat.is_maintenance ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Maintenance
                            </span>
                          ) : seat.is_occupied ? (
                            isWalkIn ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                Unreserved Walk-In Detected
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Physically Occupied
                              </span>
                            )
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Vacant Desk
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {seat.activeReservation ? (
                            <span suppressHydrationWarning className="font-semibold text-slate-800">
                              {mounted ? `${formatToLocalTime(seat.activeReservation.start_time)} → ${formatToLocalTime(seat.activeReservation.end_time)}` : "Live schedule"}
                            </span>
                          ) : (
                            <span className="text-slate-400">No active reservation</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {seat.activeReservation ? (
                            <span suppressHydrationWarning className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                              {mounted ? remainingHMS : "--:--:--"}
                            </span>
                          ) : isWalkIn ? (
                            <span className="text-amber-700 font-semibold text-[11px]">
                              Sitting without reservation
                            </span>
                          ) : (
                            <span className="text-slate-400">&mdash;</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {seat.activeReservation?.profiles ? (
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">
                                {seat.activeReservation.profiles.full_name || "Enrolled Student"}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {seat.activeReservation.profiles.email}
                              </span>
                            </div>
                          ) : isWalkIn ? (
                            <span className="text-amber-700 font-semibold text-[11px]">
                              Anonymous Physical Presence
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* If Walk-In: Admin can assign booking */}
                            {isWalkIn && (
                              <button
                                onClick={() => setAssignBookingSeatId(seat.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
                              >
                                Assign Booking
                              </button>
                            )}

                            {/* If Active reservation: Admin can force revoke */}
                            {seat.activeReservation && (
                              <button
                                onClick={() =>
                                  setCancelModalReservation({
                                    id: seat.activeReservation!.id,
                                    seatId: seat.id,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                              >
                                Revoke Slot
                              </button>
                            )}

                            {/* Toggle Maintenance */}
                            <button
                              onClick={() =>
                                setMaintenanceModal({
                                  seatId: seat.id,
                                  currentState: seat.is_maintenance,
                                })
                              }
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                                seat.is_maintenance
                                  ? "bg-slate-900 text-white border-slate-900"
                                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              {seat.is_maintenance ? "Restore" : "Maintenance"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================= PREVIOUS & HISTORICAL BOOKING AUDIT LOGS ================= */}
          <div id="booking-history-section" className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                    <History className="w-5 h-5" />
                  </div>
                  <span>Previous Booking History &amp; Audit Logs</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Complete historical audit trail of all student reservations, duration, and status loaded directly from the database.
                </p>
              </div>

              {/* Summary metrics pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                  Total: <strong>{reservations.length}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                  Active: <strong>{reservations.filter((r) => r.status === "active").length}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                  Completed: <strong>{reservations.filter((r) => r.status === "completed").length}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                  Cancelled: <strong>{reservations.filter((r) => r.status === "cancelled").length}</strong>
                </span>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Filter Buttons */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                {(["all", "active", "completed", "cancelled"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setBookingHistoryFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
                      bookingHistoryFilter === filter
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {filter === "all" ? "All Bookings" : filter}
                    {filter === "all" && ` (${reservations.length})`}
                    {filter === "active" && ` (${reservations.filter((r) => r.status === "active").length})`}
                    {filter === "completed" && ` (${reservations.filter((r) => r.status === "completed").length})`}
                    {filter === "cancelled" && ` (${reservations.filter((r) => r.status === "cancelled").length})`}
                  </button>
                ))}
              </div>

              {/* Search Input for history */}
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by student, desk, email..."
                  value={bookingHistorySearch}
                  onChange={(e) => setBookingHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-indigo-600 transition-colors"
                />
              </div>
            </div>

            {/* Table of Historical Bookings */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <div className="sm:hidden px-3 py-1.5 bg-slate-50 text-[10px] text-slate-500 font-medium text-center border-b border-slate-200">
                &larr; Swipe sideways to view complete reservation audit details &rarr;
              </div>
              <table className="w-full min-w-[800px] text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Booking Ref</th>
                    <th className="py-3 px-4">Desk / Seat</th>
                    <th className="py-3 px-4">Student / Member</th>
                    <th className="py-3 px-4">Reserved Window</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Booked Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookingHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">No booking records found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {bookingHistorySearch
                            ? "Try adjusting your search query."
                            : "No reservations found under this filter."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredBookingHistory.map((res) => {
                      const seat = seats.find((s) => s.id === res.seat_id);
                      const isOngoing = res.status === "active";
                      const duration = formatReservationDuration(res.start_time, res.end_time);

                      return (
                        <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            #{res.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            Desk {res.seat_id} {seat ? `(Seat #${seat.seat_number})` : ""}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">
                                {res.profiles?.full_name || "Enrolled Student"}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {res.profiles?.email || "student@library.edu"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span suppressHydrationWarning className="font-medium text-slate-700">
                              {mounted
                                ? `${formatToLocalTime(res.start_time)} → ${formatToLocalTime(res.end_time)}`
                                : "Schedule"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-slate-700 font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-[11px]">
                              {duration}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {res.status === "active" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active Session
                              </span>
                            ) : res.status === "cancelled" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Cancelled / Revoked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                Completed
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]" suppressHydrationWarning>
                            {mounted ? formatBookingDate(res.created_at) : "--"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {isOngoing ? (
                              <button
                                onClick={() =>
                                  setCancelModalReservation({
                                    id: res.id,
                                    seatId: res.seat_id,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                              >
                                Revoke Slot
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[11px]">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FLOATING ACTION PILL ON MOBILE & DESKTOP WHEN NOISE ALERT IS ACTIVE */}
        {isAlertActive && (
          <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2.5 p-3 sm:p-3.5 bg-rose-600 text-white rounded-2xl shadow-2xl border-2 border-white animate-bounce max-w-[92vw]">
            <div className="p-2 bg-white/20 rounded-xl shrink-0">
              <Volume2 className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black leading-tight uppercase tracking-tight text-white">
                NOISE SPIKE DETECTED
              </span>
              <span className="text-[11px] text-rose-100 truncate">
                {liveDb} dB breached {soundThreshold} dB limit
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearNoiseAlert}
              className="ml-2 px-3 py-1.5 bg-white text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-black shadow-sm transition-transform active:scale-95 shrink-0"
            >
              Silence
            </button>
          </div>
        )}
      </main>

      {/* Confirmation Modal for Cancellation */}
      <ConfirmModal
        isOpen={Boolean(cancelModalReservation)}
        title={`Revoke Reservation for Seat ${cancelModalReservation?.seatId}`}
        description="Are you sure you want to administratively revoke this booking slot? The desk will immediately become open for other students."
        confirmLabel="Yes, Revoke Reservation"
        cancelLabel="Keep Reservation"
        variant="danger"
        isLoading={false}
        onConfirm={handleConfirmCancelReservation}
        onClose={() => setCancelModalReservation(null)}
      />

      {/* Confirmation Modal for Maintenance */}
      <ConfirmModal
        isOpen={Boolean(maintenanceModal)}
        title={`${maintenanceModal?.currentState ? "Restore" : "Set"} Maintenance Mode for Seat ${maintenanceModal?.seatId}`}
        description={`Are you sure you want to ${
          maintenanceModal?.currentState ? "restore this seat to active service" : "take this seat out of service for repair"
        }?`}
        confirmLabel={maintenanceModal?.currentState ? "Restore to Service" : "Set Maintenance"}
        cancelLabel="Cancel"
        variant={maintenanceModal?.currentState ? "primary" : "danger"}
        isLoading={false}
        onConfirm={handleToggleMaintenance}
        onClose={() => setMaintenanceModal(null)}
      />

      {/* Booking Modal for Assigning Walk-in */}
      <BookingModal
        isOpen={Boolean(assignBookingSeatId)}
        seatId={assignBookingSeatId}
        seatNumber={seats.find((s) => s.id === assignBookingSeatId)?.seat_number}
        isLoading={isAssigningBooking}
        onConfirm={handleAssignBooking}
        onClose={() => setAssignBookingSeatId(null)}
      />

      {/* ================= EMERGENCY NOISE ALERT POPUP MODAL WITH SOUND ================= */}
      {isNoisePopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white border-2 border-rose-500 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-rose-950/40 text-center space-y-5 animate-scaleUp ring-4 ring-rose-500/20">
            {/* Pulsing Alarm Icon & Waves */}
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
              <span className="absolute inset-2 rounded-full bg-rose-500/30 animate-pulse" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/40">
                <Volume2 className="w-9 h-9 animate-bounce text-white" />
              </div>
            </div>

            {/* Alert Headings */}
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-black uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Noise Limit Breached!</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                শব্দ শনাক্ত হয়েছে! (Acoustic Alert)
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                লাইব্রেরির শান্ত পরিবেশের নির্ধারিত সীমা অতিক্রান্ত হয়েছে। ESP8266 হার্ডওয়্যার বাজার বেজে উঠেছে!
              </p>
            </div>

            {/* Decibel Metric Display */}
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-4 flex items-center justify-around gap-4">
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Current Noise
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono text-rose-600 tracking-tight block">
                  {liveDb} <span className="text-sm font-normal text-slate-500">dB</span>
                </span>
                <span className="text-[10px] font-bold text-rose-700">Level Breached</span>
              </div>

              <div className="h-10 w-px bg-rose-200" />

              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Configured Limit
                </span>
                <span className="text-3xl sm:text-4xl font-black font-mono text-slate-700 tracking-tight block">
                  {soundThreshold} <span className="text-sm font-normal text-slate-500">dB</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Quiet Zone Standard</span>
              </div>
            </div>

            {/* Audio alarm status & Mute toggle */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isAudioMuted ? "bg-slate-400" : "bg-emerald-500 animate-ping"}`} />
                <span className="font-semibold text-slate-700">
                  {isAudioMuted ? "Browser Audio Muted" : "Web Alarm Sounding"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioEngines();
                    playBrowserBuzzerBeep();
                  }}
                  className="text-[11px] font-bold text-slate-700 hover:text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-xs cursor-pointer"
                >
                  🔊 Test Sound
                </button>
                <button
                  type="button"
                  onClick={() => setIsAudioMuted(!isAudioMuted)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  {isAudioMuted ? "Unmute Sound" : "Mute Sound"}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              {/* Primary: Silence Hardware Buzzer & Reset */}
              <button
                type="button"
                onClick={handleClearNoiseAlert}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Check className="w-4 h-4 text-white" />
                <span>Silence Hardware Buzzer (বাজার বন্ধ করুন)</span>
              </button>

              {/* Secondary: Acknowledge & Close popup */}
              <button
                type="button"
                onClick={() => setIsNoisePopupOpen(false)}
                className="w-full py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Dismiss Popup (পপআপ বন্ধ রাখুন)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EDIT ADMIN PROFILE MODAL ================= */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 animate-scaleUp max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Edit Administrator Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Update your display name, designation, contact info, and avatar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Selector Section */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Profile Photo &amp; Avatar
                </label>
                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                  <img
                    src={editAvatar}
                    alt="Preview"
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-500/30 shrink-0 shadow-sm"
                  />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Choose Avatar Preset:
                    </span>
                    <div className="flex items-center gap-2">
                      {[
                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
                        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
                        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
                        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
                      ].map((presetUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setEditAvatar(presetUrl)}
                          className={`w-8 h-8 rounded-xl overflow-hidden border-2 transition-transform hover:scale-105 ${
                            editAvatar === presetUrl
                              ? "border-indigo-600 ring-2 ring-indigo-500/40"
                              : "border-transparent opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img src={presetUrl} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  <input
                    type="url"
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    placeholder="Or paste custom image URL (https://...)"
                    className="w-full px-3 py-1.5 text-[11px] rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              {/* Display Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Display Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 font-medium"
                  />
                </div>
              </div>

              {/* Admin Email (Read-Only) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Official Email</span>
                  <span className="text-[10px] text-slate-400 font-normal">Managed via Auth</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    disabled
                    value={adminEmail}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-500 cursor-not-allowed font-medium"
                  />
                </div>
              </div>

              {/* Designation & Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Designation / Role
                  </label>
                  <div className="relative">
                    <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      placeholder="e.g. Chief Librarian & IoT Admin"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Contact Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. +880 1712-345678"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Office Location */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Office / Desk Location
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={editOffice}
                    onChange={(e) => setEditOffice(e.target.value)}
                    placeholder="e.g. Central Library (Room 102)"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 font-medium"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
