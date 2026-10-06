"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, User, ShieldCheck, LogOut, LogIn, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
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
          role: profile?.role || "student",
          fullName: profile?.full_name || undefined,
        });
      } else {
        setCurrentUser(null);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUser();
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserDropdownOpen(false);
    router.push("/login");
    router.refresh();
  };

  const navLinks = [
    { name: "Overview", href: "/" },
    { name: "Dashboard", href: "/dashboard" },
    ...(currentUser?.role === "admin" ? [{ name: "Admin Portal", href: "/admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-900 tracking-tight">
                Smart Library
              </span>
              <span className="hidden sm:inline-block text-[11px] font-medium text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                Seat Finder
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "text-zinc-900 bg-zinc-100 font-semibold"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
            {currentUser && pathname === "/dashboard" && (
              <a
                href="#my-reservations"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
              >
                My Reservations
              </a>
            )}
          </nav>

          {/* User Account / Sign In */}
          <div className="hidden md:flex items-center gap-3">
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs text-zinc-800 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600">
                    <User className="w-3 h-3" />
                  </div>
                  <span className="max-w-[120px] truncate font-medium">
                    {currentUser.fullName || currentUser.email.split("@")[0]}
                  </span>
                  <span
                    className={`text-[10px] font-medium uppercase px-1.5 py-0.2 rounded border ${
                      currentUser.role === "admin"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {currentUser.role}
                  </span>
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 text-xs z-50">
                    <div className="px-3 py-2 border-b border-zinc-100 text-zinc-500">
                      <p className="font-semibold text-zinc-900 truncate">
                        {currentUser.fullName || "Student Account"}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500">{currentUser.email}</p>
                    </div>
                    {currentUser.role === "admin" && (
                      <Link
                        href="/admin"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-zinc-700 hover:bg-zinc-50 rounded-lg"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                        Admin Dashboard
                      </Link>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-2 pb-4 space-y-1 bg-white border-b border-zinc-200 text-xs">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg font-medium ${
                pathname === link.href ? "bg-zinc-100 text-zinc-900" : "text-zinc-600"
              }`}
            >
              {link.name}
            </Link>
          ))}
          <div className="pt-2 border-t border-zinc-100">
            {currentUser ? (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold text-zinc-900">{currentUser.email}</p>
                  <p className="text-[11px] text-zinc-500 uppercase">{currentUser.role}</p>
                </div>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="text-red-600 flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center py-2 bg-blue-600 text-white rounded-lg font-medium"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
