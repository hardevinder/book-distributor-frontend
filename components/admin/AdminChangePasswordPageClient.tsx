"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCcw,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";

type ToastState =
  | {
      message: string;
      type: "success" | "error";
    }
  | null;

const safeMsg = (err: any) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  err?.message ||
  "Something went wrong";

const AdminChangePasswordPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [old_password, setOldPassword] = useState("");
  const [new_password, setNewPassword] = useState("");
  const [confirm_password, setConfirmPassword] = useState("");

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // (optional) fetch /me like your other pages sometimes do
  const loadMe = async () => {
    setChecking(true);
    try {
      await api.get("/api/auth/me"); // just to verify token is ok
    } catch (e: any) {
      // if token invalid, your axios interceptor may logout already,
      // but we still show message:
      setError(safeMsg(e));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto hide toast (same as your code)
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const isAdminish = useMemo(() => {
    const r = String(user?.role || "").toUpperCase();
    return ["SUPERADMIN", "ADMIN", "OWNER", "STAFF", "ACCOUNTANT"].includes(r);
  }, [user?.role]);

  const canSubmit = useMemo(() => {
    if (!old_password || !new_password || !confirm_password) return false;
    if (new_password.length < 6) return false;
    if (new_password !== confirm_password) return false;
    if (new_password === old_password) return false;
    return true;
  }, [old_password, new_password, confirm_password]);

  const resetForm = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const onSubmit = async () => {
    setError(null);

    try {
      if (!isAdminish) throw new Error("Access denied. Only admin users allowed.");
      if (!canSubmit) throw new Error("Please fill all fields correctly.");

      setLoading(true);
      await api.post("/api/auth/change-password", {
        old_password: (old_password || "").trim(),
        new_password: (new_password || "").trim(),
        confirm_password: (confirm_password || "").trim(),
      });

      setToast({ message: "Password changed successfully.", type: "success" });
      resetForm();
    } catch (e: any) {
      const msg = safeMsg(e);
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Compact Top bar (same vibe as your distributors page) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
              Admin
            </Link>

            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <KeyRound className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="text-sm font-extrabold truncate">Change Password</div>
              <div className="text-[11px] text-slate-500 truncate">
                Update your admin login password
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadMe}
              disabled={checking}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold disabled:opacity-60"
              title="Reload"
            >
              <RefreshCcw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
              Reload
            </button>

            <div className="hidden sm:flex flex-col items-end leading-tight">
              <div className="text-xs font-semibold text-slate-800">{user?.name || "User"}</div>
              {user?.role ? (
                <div className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
                  {user.role}
                </div>
              ) : null}
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="p-2 sm:p-3">
        {/* Alerts */}
        {error && (
          <div className="mb-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Work area */}
        <div className="max-w-2xl">
          <section className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-extrabold truncate">Update Password</div>
                <div className="text-[11px] text-slate-500">
                  Enter current password and choose a new one.
                </div>
              </div>

              <button
                type="button"
                onClick={resetForm}
                disabled={loading}
                className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                Reset
              </button>
            </div>

            {!isAdminish ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <div>
                  <div className="font-extrabold">Access denied</div>
                  <div className="text-[11px] mt-0.5">
                    This page is only for admin roles (ADMIN / SUPERADMIN / etc).
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-12 gap-2">
                {/* OLD */}
                <div className="col-span-12">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Current Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showOld ? "text" : "password"}
                      value={old_password}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-10 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                      placeholder="Enter current password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOld((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                      title={showOld ? "Hide" : "Show"}
                    >
                      {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* NEW */}
                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showNew ? "text" : "password"}
                      value={new_password}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-10 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                      placeholder="Min 6 characters"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                      title={showNew ? "Hide" : "Show"}
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Use long password for safety.
                  </div>
                </div>

                {/* CONFIRM */}
                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirm_password}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-10 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                      title={showConfirm ? "Hide" : "Show"}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* helper validations like your style */}
                <div className="col-span-12">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-slate-500" />
                      <div className="space-y-1">
                        <div>New password must be at least 6 characters.</div>
                        <div>New + Confirm must match.</div>
                        <div>New should be different from current password.</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* actions */}
                <div className="col-span-12 flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={loading || !canSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-extrabold disabled:opacity-60"
                  >
                    {loading ? "Saving..." : "Change Password"}
                  </button>

                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-sm font-bold disabled:opacity-60"
                  >
                    Reset
                  </button>

                  <div className="flex-1" />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Toast (same) */}
      {toast && (
        <div
          className={`fixed bottom-3 right-3 z-50 px-4 py-2 rounded-xl shadow-lg text-sm ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default AdminChangePasswordPageClient;
