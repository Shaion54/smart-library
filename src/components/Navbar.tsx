"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, User, ShieldCheck, LogOut, LogIn, Menu, X, Sparkles, LayoutDashboard, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isDeviceOnline } from "@/lib/seat-utils";

interface UserState {
  id: string;
  email: string;
  role: "student" | "admin";
  fullName?: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [hardwareOnline, setHardwareOnline] = useState<boolean>(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", user.id)
            .single();

          setCurrentUser({
            id: user.id,
            email: user.email || "",
            role: (profile?.role as "student" | "admin") || "student",
            fullName: profile?.full_name || undefined,
          });
        } else {
          setCurrentUser(null);
        }
      } catch {
        // Fallback gracefully
        setCurrentUser(null);
      }
    }

    async function loadDevice() {
      try {
        const { data } = await supabase
          .from("devices")
          .select("is_online, last_seen")
          .eq("id", "ESP8266_DEV01")
          .single();
        if (data) {
          setHardwareOnline(isDeviceOnline(data as any));
        }
      } catch {
        // Keep previous state
      }
    }

    loadUser();
    loadDevice();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUser();
      } else {
        setCurrentUser(null);
      }
    });

    // Real-time listener for instant hardware online/offline changes
    const deviceChannel = supabase
      .channel("navbar-device-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => loadDevice())
      .subscribe();

    // High frequency 1-second poll to immediately catch stale heartbeats
    const devInterval = setInterval(loadDevice, 1000);

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(deviceChannel);
      clearInterval(devInterval);
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserDropdownOpen(false);
    router.push("/login");
    router.refresh();
  };

  // If on admin dashboard, don't show the public navbar since the admin page has its own full sidebar
  // (Executed after all hooks to strictly adhere to React Rules of Hooks)
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  const navLinks = [
    { name: "Home Overview", href: "/" },
    { name: "Live Desks", href: "/#live-desks" },
    { name: "How It Works", href: "/#how-it-works" },
    { name: "Features", href: "/#features" },
    { name: "Student Dashboard", href: "/login" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-white/90 border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Live Pill */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                  SmartLib
                </span>
                <span
                  className={`hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                    hardwareOnline
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200/80"
                      : "text-rose-700 bg-rose-50 border-rose-200/80"
                  }`}
                  title={hardwareOnline ? "ESP8266 IoT Controller is Online" : "ESP8266 IoT Controller is Disconnected"}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      hardwareOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                    }`}
                  />
                  <span>IoT: {hardwareOnline ? "Online" : "Offline"}</span>
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline-block">
                Intelligent Workspace &amp; Seat Allocation
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1.5">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${isActive
                    ? "text-indigo-600 bg-indigo-50/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          {/* Top Right Section: Prominent Login Button / User Profile */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-800 transition-all shadow-2xs"
                >
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[11px]">
                    {(currentUser.fullName || currentUser.email)[0].toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate font-semibold text-slate-800">
                    {currentUser.fullName || currentUser.email.split("@")[0]}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${currentUser.role === "admin"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-indigo-50 text-indigo-700 border-indigo-200"
                      }`}
                  >
                    {currentUser.role}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 text-xs z-50 animate-fadeIn">
                    <div className="px-3 py-2.5 border-b border-slate-100 text-slate-500 mb-1">
                      <p className="font-bold text-slate-900 truncate">
                        {currentUser.fullName || "Member Account"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{currentUser.email}</p>
                    </div>

                    <Link
                      href="/dashboard"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 rounded-xl transition-colors font-medium"
                    >
                      <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                      Student Dashboard
                    </Link>

                    {currentUser.role === "admin" && (
                      <Link
                        href="/admin"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-purple-700 hover:bg-purple-50 rounded-xl transition-colors font-medium"
                      >
                        <ShieldCheck className="w-4 h-4 text-purple-600" />
                        Admin ERP Portal
                      </Link>
                    )}

                    <div className="pt-1 mt-1 border-t border-slate-100">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-xl text-left transition-colors font-semibold"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  id="top-nav-login-btn"
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/35 active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    Log In<span className="hidden sm:inline"> / Portal</span>
                  </span>
                </Link>
              </div>
            )}

            {/* Mobile Menu Toggle Button */}
            <div className="lg:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Toggle navigation"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-4 pt-2 pb-5 space-y-2 bg-white border-b border-slate-200 text-xs shadow-lg animate-fadeIn">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3.5 py-2.5 rounded-xl font-semibold transition-colors ${pathname === link.href ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                }`}
            >
              {link.name}
            </Link>
          ))}

          <div className="pt-3 border-t border-slate-100">
            {currentUser ? (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-bold text-slate-900">{currentUser.email}</p>
                  <p className="text-[10px] text-indigo-600 uppercase font-bold">{currentUser.role}</p>
                </div>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="text-red-600 flex items-center gap-1 font-semibold px-2 py-1 rounded-lg hover:bg-red-50"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-sm"
              >
                Log In to Smart Library
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
