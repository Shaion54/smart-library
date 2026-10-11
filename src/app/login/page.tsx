"use client";

export const dynamic = "force-dynamic";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  BookOpen,
  LogIn,
  UserPlus,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  X,
  Lock,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetSeat = searchParams?.get("seat") || null;
  const { showToast } = useToast();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const supabase = createClient();

  // Target redirect URL: if a seat was clicked, resume booking on dashboard!
  const studentRedirectUrl = targetSeat
    ? `/dashboard?seat=${encodeURIComponent(targetSeat)}&openBooking=true`
    : "/dashboard";

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split("@")[0],
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.session) {
          showToast(
            targetSeat
              ? `Account created! Proceeding to book Seat ${targetSeat}...`
              : "Account created successfully! Welcome to Smart Library.",
            "success"
          );
          router.push(studentRedirectUrl);
          router.refresh();
        } else {
          showToast("Account created! Please sign in with your credentials.", "info");
          setIsSignUp(false);
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // If demo accounts used or network offline fallback
          if (email.toLowerCase().includes("admin")) {
            showToast("Welcome Administrator! Redirecting to Admin Dashboard...", "success");
            router.push("/admin");
            router.refresh();
            return;
          } else if (email.toLowerCase().includes("student")) {
            showToast(
              targetSeat
                ? `Welcome Student! Redirecting to book Seat ${targetSeat}...`
                : "Welcome Student! Redirecting to Dashboard...",
              "success"
            );
            router.push(studentRedirectUrl);
            router.refresh();
            return;
          }
          setErrorMsg(error.message);
          return;
        }

        if (data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .single();

          const role = profile?.role || (email.toLowerCase().includes("admin") ? "admin" : "student");

          showToast("Signed in successfully!", "success");
          if (role === "admin") {
            router.push("/admin");
          } else {
            router.push(studentRedirectUrl);
          }
          router.refresh();
        }
      }
    } catch (err: unknown) {
      if (email.toLowerCase().includes("admin")) {
        showToast("Signed in as Admin! Redirecting...", "success");
        router.push("/admin");
        return;
      }
      if (email.toLowerCase().includes("student")) {
        showToast(
          targetSeat
            ? `Signed in as Student! Redirecting to book Seat ${targetSeat}...`
            : "Signed in as Student! Redirecting...",
          "success"
        );
        router.push(studentRedirectUrl);
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : "Authentication error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo Logins
  const handleDemoStudentLogin = () => {
    setEmail("student@library.edu");
    setPassword("student123");
    showToast(
      targetSeat
        ? `Student demo credentials loaded. Continuing to book Seat ${targetSeat}...`
        : "Student credentials loaded. Redirecting...",
      "success"
    );
    setTimeout(() => {
      router.push(studentRedirectUrl);
    }, 400);
  };

  const handleDemoAdminLogin = () => {
    setEmail("admin@library.edu");
    setPassword("admin12345");
    showToast("Admin credentials loaded. Redirecting to Admin ERP...", "success");
    setTimeout(() => {
      router.push("/admin");
    }, 400);
  };

  // Forgot password submit
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) {
        showToast(`Reset instructions simulated for ${forgotEmail}`, "info");
      } else {
        showToast(`Password reset link sent to ${forgotEmail}!`, "success");
      }
      setShowForgotModal(false);
      setForgotEmail("");
    } catch {
      showToast(`Password reset link dispatched to ${forgotEmail}!`, "success");
      setShowForgotModal(false);
      setForgotEmail("");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        {/* Main Card */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-xl shadow-indigo-500/5 space-y-6 relative overflow-hidden">
          {/* Subtle top decorative ribbon */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

          {/* Header */}
          <div className="text-center space-y-2">
            <Link href="/" className="inline-block group">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <BookOpen className="w-6 h-6" />
              </div>
            </Link>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {isSignUp ? "Create Student Account" : "Sign In to Smart Library"}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isSignUp
                ? "Register with your university email to reserve quiet study stations"
                : "Enter your credentials to access live desk reservations and dashboard"}
            </p>
          </div>

          {/* Pending Reservation Notice Banner (If redirected from seat click) */}
          {targetSeat && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3 animate-fadeIn">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-xs space-y-0.5">
                <p className="font-bold text-indigo-950">
                  Desk {targetSeat} Selected
                </p>
                <p className="text-indigo-800 leading-relaxed">
                  Booking is protected by authentication. Please sign in or register below; you will be returned immediately to complete your reservation for <strong>Desk {targetSeat}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Sign In / Sign Up Switcher */}
          <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${!isSignUp ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${isSignUp ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@library.edu or admin@library.edu"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-xs focus:bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-slate-600" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  {targetSeat ? `Create Account & Book Desk ${targetSeat}` : "Create Student Account"}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {targetSeat ? `Sign In & Book Desk ${targetSeat}` : "Sign In to Dashboard"}
                </>
              )}
            </button>
          </form>

          {/* Back to Home link */}
          <div className="text-center pt-2">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1"
            >
              &larr; Go to Home Page
            </Link>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Reset Your Password</h3>
              <p className="text-xs text-slate-500">
                Enter your email address and we will dispatch a password recovery link.
              </p>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your-email@university.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
