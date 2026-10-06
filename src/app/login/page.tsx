"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { BookOpen, LogIn, UserPlus, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

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
          showToast("Account created successfully!", "success");
          router.push("/dashboard");
          router.refresh();
        } else {
          showToast("Account created! Check your email to verify or sign in.", "info");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .single();

          showToast("Signed in successfully", "success");
          if (profile?.role === "admin") {
            router.push("/admin");
          } else {
            router.push("/dashboard");
          }
          router.refresh();
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected authentication error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12">
      <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
            {isSignUp ? "Create Student Account" : "Sign In to Smart Library"}
          </h2>
          <p className="text-xs text-zinc-500">
            {isSignUp
              ? "Register to reserve quiet study stations in the library"
              : "Enter your university credentials to manage seat reservations"}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-xl bg-zinc-100 p-1 border border-zinc-200">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              !isSignUp ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
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
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              isSignUp ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.edu"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-3 pr-10 py-2 rounded-xl bg-white border border-zinc-200 text-zinc-900 text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1 rounded-md transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-zinc-600" />
                ) : (
                  <Eye className="w-4 h-4 text-zinc-400" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" />
                Register Account
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Security Policy Notice */}
        <div className="pt-4 border-t border-zinc-100 text-[11px] text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-700">Account Access Note</p>
          <p>
            All registrations default to the <strong>student</strong> role. Administrator privileges are granted server-side in the Supabase database.
          </p>
        </div>
      </div>
    </div>
  );
}
