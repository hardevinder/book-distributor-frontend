"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  Pencil,
  Trash2,
  Download,
  Upload,
  Building2,
  ChevronLeft,
  Mail,
  Phone,
  MapPin,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  X,
  RefreshCcw,
} from "lucide-react";

/* ---------------- Types ---------------- */

type Distributor = {
  id: number;
  name: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  is_active?: boolean;
};

type DistUser = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  distributor_id: number;
  is_active?: boolean;
};

type ToastState =
  | {
      message: string;
      type: "success" | "error";
    }
  | null;

type NewUserResult = {
  distributor?: Distributor | any;
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
    distributor_id: number;
  };
  temp_password?: string;
};

type FormState = {
  // distributor
  name: string;
  mobile: string;
  email: string;
  address: string;
  city: string;

  // user creation (new only)
  create_login: boolean;
  user_email: string;
  user_name: string;
  password: string; // optional
};

const emptyForm: FormState = {
  name: "",
  mobile: "",
  email: "",
  address: "",
  city: "",

  create_login: true,
  user_email: "",
  user_name: "",
  password: "",
};

const DistributorsPageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const formRef = useRef<FormState>(emptyForm);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // optional export/import
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  // login created / reset result modal (reuse)
  const [createdLogin, setCreatedLogin] = useState<NewUserResult | null>(null);
  const [showPass, setShowPass] = useState(false);

  // compact search
  const [q, setQ] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Edit mode: linked user (login) panel ---
  const [editUserLoading, setEditUserLoading] = useState(false);
  const [editUserSaving, setEditUserSaving] = useState(false);
  const [editUser, setEditUser] = useState<DistUser | null>(null);
  const [userForm, setUserForm] = useState<{ name: string; email: string; phone: string; password: string }>({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [showEditPass, setShowEditPass] = useState(false);

  // keep state + ref in sync whenever we set form
  const setFormBoth = (updater: FormState | ((prev: FormState) => FormState)) => {
    setForm((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      formRef.current = next;
      return next;
    });
  };

  const normalizeList = (raw: any): Distributor[] => {
    const list: Distributor[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.rows)
      ? raw.rows
      : [];
    return list;
  };

  const fetchDistributors = async () => {
    setListLoading(true);
    try {
      const res = await api.get<any>("/api/distributors");
      const list = normalizeList(res?.data);
      const sorted = [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
      setDistributors(sorted);
    } catch (err) {
      console.error(err);
      setError("Failed to load distributors.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchDistributors();
  }, []);

  // Auto hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const resetUserPanel = () => {
    setEditUser(null);
    setUserForm({ name: "", email: "", phone: "", password: "" });
    setShowEditPass(false);
  };

  const resetForm = () => {
    setFormBoth(emptyForm);
    setEditingId(null);
    resetUserPanel();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as any;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormBoth((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    setFormBoth((prev) => ({ ...prev, [name]: value }));
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return distributors;
    return distributors.filter((d) => {
      const hay = `${d.name ?? ""} ${d.mobile ?? ""} ${d.email ?? ""} ${d.city ?? ""} ${d.address ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [distributors, q]);

  const saveDistributor = async () => {
    setError(null);
    setImportSummary(null);
    setLoading(true);

    try {
      const latest = formRef.current;

      const cleanName = (latest.name ?? "").trim();
      if (!cleanName) throw new Error("Distributor name is required.");

      const distPayload = {
        name: cleanName,
        mobile: (latest.mobile ?? "").trim() || null,
        email: (latest.email ?? "").trim() || null,
        city: (latest.city ?? "").trim() || null,
        address: (latest.address ?? "").trim() || null,
      };

      // EDIT: distributor only
      if (editingId) {
        await api.put(`/api/distributors/${editingId}`, distPayload);
        setToast({ message: "Distributor updated.", type: "success" });
        await fetchDistributors();
        return;
      }

      // CREATE: distributor only OR distributor + user
      if (latest.create_login) {
        const userEmail = (latest.user_email ?? "").trim();
        if (!userEmail) throw new Error("Login email (user_email) is required.");

        const payload = {
          ...distPayload,
          user_email: userEmail,
          user_name: (latest.user_name ?? "").trim() || `${cleanName} (Distributor)`,
          password: (latest.password ?? "").trim() || undefined, // optional
        };

        const res = await api.post("/api/distributors/with-user", payload);

        const data = res?.data || {};
        const result: NewUserResult = {
          distributor: data.distributor || data.row || data.data?.distributor || data.data?.row,
          user: data.user || data.data?.user,
          temp_password: data.temp_password || data.data?.temp_password,
        };

        setCreatedLogin(result);
        setToast({ message: "Distributor + Login created.", type: "success" });
      } else {
        await api.post("/api/distributors", distPayload);
        setToast({ message: "Distributor added.", type: "success" });
      }

      resetForm();
      await fetchDistributors();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.message ||
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (editingId ? "Failed to update distributor." : "Failed to create distributor.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadDistributorUser = async (id: number) => {
    setEditUserLoading(true);
    setEditUser(null);
    setUserForm({ name: "", email: "", phone: "", password: "" });

    try {
      const res = await api.get(`/api/distributors/${id}/user`);
      const u: DistUser | null = res?.data?.user || null;

      setEditUser(u || null);
      setUserForm({
        name: u?.name || "",
        email: u?.email || "",
        phone: (u?.phone as any) || "",
        password: "",
      });
    } catch (e: any) {
      // If endpoint exists but user doesn't, backend returns { user: null }
      // If endpoint missing, show error.
      const msg = e?.response?.data?.message || e?.message || "Failed to load distributor login.";
      setError(msg);
      setToast({ message: msg, type: "error" });
      setEditUser(null);
    } finally {
      setEditUserLoading(false);
    }
  };

  const handleEdit = async (d: Distributor) => {
    setError(null);
    setImportSummary(null);
    setEditingId(d.id);

    const nextForm: FormState = {
      name: d.name || "",
      mobile: (d.mobile as any) || "",
      email: (d.email as any) || "",
      city: (d.city as any) || "",
      address: (d.address as any) || "",

      // editing: disable login creation
      create_login: false,
      user_email: "",
      user_name: "",
      password: "",
    };

    setFormBoth(nextForm);
    await loadDistributorUser(d.id);
  };

  const handleDelete = async (id: number) => {
    const ok = window.confirm("Deactivate this distributor?");
    if (!ok) return;

    setError(null);
    setImportSummary(null);
    setDeletingId(id);
    try {
      await api.delete(`/api/distributors/${id}`);
      await fetchDistributors();
      if (editingId === id) resetForm();
      setToast({ message: "Distributor deactivated.", type: "success" });
    } catch (err) {
      console.error(err);
      const msg = "Failed to delete distributor.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  const saveUserLogin = async () => {
    if (!editingId) return;
    setError(null);
    setEditUserSaving(true);

    try {
      const payload: any = {
        name: (userForm.name || "").trim(),
        email: (userForm.email || "").trim(),
        phone: (userForm.phone || "").trim() || null,
      };

      // only send password if user typed OR wants generate (blank means generate if we send it)
      // We'll send password field ONLY when user clicked save with password box touched.
      // But easiest UX: if password field is present (even blank) user may want generate.
      // We'll add checkbox-like behavior via: if user clicked "Generate" sets password="" and will send.
      // Here: send only if userForm.password is not null (string always). We'll decide:
      // If user changed password field OR explicitly wants generate, we send it.
      // We'll treat: if userForm.password !== "__NOCHANGE__" not possible, so we use a local flag:
      // -> simplest: send password if userForm.password was changed OR user clicked generate sets it to "" but we still send.
      // We'll track with a ref below.
      // For now: send password if password box is non-empty OR userForm.password === "" AND userWantsGenerateRef.current = true
      // Implement below.
    } catch (e) {
      // noop, handled below
    } finally {
      setEditUserSaving(false);
    }
  };

  const userWantsPasswordChangeRef = useRef(false);
  const markPasswordChange = (val: string) => {
    userWantsPasswordChangeRef.current = true;
    setUserForm((p) => ({ ...p, password: val }));
  };

  const doSaveUserLogin = async () => {
    if (!editingId) return;
    setError(null);
    setEditUserSaving(true);

    try {
      const payload: any = {
        name: (userForm.name || "").trim(),
        email: (userForm.email || "").trim(),
        phone: (userForm.phone || "").trim() || null,
      };

      // Only update password if user intended
      if (userWantsPasswordChangeRef.current) {
        payload.password = (userForm.password || "").trim(); // "" => backend auto-generate
      }

      // Basic client validation
      if (!payload.name) throw new Error("Login name is required.");
      if (!payload.email) throw new Error("Login email is required.");

      const res = await api.patch(`/api/distributors/${editingId}/user`, payload);
      const data = res?.data || {};

      // refresh shown user
      const updated = data.user || null;
      setEditUser(updated || editUser);

      // if password changed, show modal with temp_password (once)
      const tp = data.temp_password || null;
      if (tp) {
        setCreatedLogin({
          user: updated
            ? {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                role: updated.role,
                distributor_id: updated.distributor_id,
              }
            : undefined,
          temp_password: tp,
        });
      }

      setToast({ message: "Login updated.", type: "success" });
      userWantsPasswordChangeRef.current = false;
      setUserForm((p) => ({ ...p, password: "" }));
      await fetchDistributors();
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.message || e?.message || "Failed to update login.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setEditUserSaving(false);
    }
  };

  // Optional export/import (only enable if backend exists)
  const handleExport = async () => {
    setError(null);
    setImportSummary(null);
    setExporting(true);
    try {
      const res = await api.get("/api/distributors/export", { responseType: "blob" });

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "distributors.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setToast({ message: "Exported successfully.", type: "success" });
    } catch (err) {
      console.error(err);
      const msg = "Export endpoint not available (or failed).";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportSummary(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/api/distributors/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const { created, updated, errors: importErrors } = res.data || {};
      let summary = `Import done. Created: ${created ?? 0}, Updated: ${updated ?? 0}`;
      if (importErrors && importErrors.length > 0) summary += `, Errors: ${importErrors.length}`;
      setImportSummary(summary);

      setToast({ message: "Imported successfully.", type: "success" });
      await fetchDistributors();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.error || "Import endpoint not available (or failed).";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isCreateMode = !editingId;
  const canShowLoginPanel = isCreateMode && form.create_login;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Compact Top bar (more space for 13") */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
            >
              <ChevronLeft className="w-4 h-4" />
              Desktop
            </Link>

            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Building2 className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="text-sm font-extrabold truncate">Distributors</div>
              <div className="text-[11px] text-slate-500 truncate">
                Create distributors + optional login (email/password)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchDistributors}
              disabled={listLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold disabled:opacity-60"
              title="Reload"
            >
              <RefreshCcw className={`w-4 h-4 ${listLoading ? "animate-spin" : ""}`} />
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

      {/* Main layout: maximize work area */}
      <main className="p-2 sm:p-3">
        {/* Alerts */}
        {(error || importSummary) && (
          <div className="mb-2 space-y-2">
            {error && (
              <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            {importSummary && !error && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                {importSummary}
              </div>
            )}
          </div>
        )}

        {/* Two-column workspace */}
        <div className="grid grid-cols-12 gap-2">
          {/* LEFT: Work area (create/edit) */}
          <section className="col-span-12 lg:col-span-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate">
                    {editingId ? `Edit Distributor #${editingId}` : "Create Distributor"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {editingId ? "Edit distributor + login (if exists)." : "You can also create login for distributor."}
                  </div>
                </div>

                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>

              {/* Distributor fields */}
              <div className="mt-3 grid grid-cols-12 gap-2">
                <div className="col-span-12">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Name *</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Distributor name"
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mobile</label>
                  <input
                    name="mobile"
                    value={form.mobile}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Mobile"
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Contact email"
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">City</label>
                  <input
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="City"
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Address</label>
                  <input
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Address"
                  />
                </div>
              </div>

              {/* EDIT MODE: Login panel */}
              {editingId && (
                <div className="mt-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-slate-600" />
                      Login Settings
                    </div>
                    <button
                      type="button"
                      onClick={() => loadDistributorUser(editingId)}
                      disabled={editUserLoading}
                      className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
                      title="Reload login"
                    >
                      {editUserLoading ? "Loading..." : "Reload"}
                    </button>
                  </div>

                  {editUserLoading ? (
                    <div className="mt-2 text-[11px] text-slate-500">Loading login…</div>
                  ) : !editUser ? (
                    <div className="mt-2 text-[11px] text-slate-600">
                      No login linked for this distributor.
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-12 gap-2">
                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Login Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            value={userForm.email}
                            onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="login email"
                          />
                        </div>
                      </div>

                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Login Name</label>
                        <div className="relative">
                          <UserPlus className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            value={userForm.name}
                            onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="login name"
                          />
                        </div>
                      </div>

                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone (optional)</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            value={userForm.phone}
                            onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="phone"
                          />
                        </div>
                      </div>

                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          New Password (optional)
                        </label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type={showEditPass ? "text" : "password"}
                            value={userForm.password}
                            onChange={(e) => markPasswordChange(e.target.value)}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="Leave blank + Generate to auto"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditPass((v) => !v)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                            title={showEditPass ? "Hide" : "Show"}
                          >
                            {showEditPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                            onClick={() => {
                              // request backend to generate by sending password:""
                              userWantsPasswordChangeRef.current = true;
                              setUserForm((p) => ({ ...p, password: "" }));
                              setToast({ message: "Will generate password on Save Login.", type: "success" });
                            }}
                          >
                            Generate
                          </button>

                          <button
                            type="button"
                            disabled={editUserSaving}
                            onClick={doSaveUserLogin}
                            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-extrabold disabled:opacity-60"
                          >
                            {editUserSaving ? "Saving..." : "Save Login"}
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-500 mt-2">
                          Password will be shown only once if changed.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Create login toggle (only in create mode) */}
              {!editingId && (
                <div className="mt-3 border border-slate-200 rounded-2xl p-3 bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        name="create_login"
                        checked={form.create_login}
                        onChange={handleChange}
                        className="h-4 w-4"
                      />
                      Create Login for Distributor
                    </label>
                    <div className="text-[11px] text-slate-500">Uses backend: /with-user</div>
                  </div>

                  {canShowLoginPanel ? (
                    <div className="mt-3 grid grid-cols-12 gap-2">
                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Login Email (required)
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            name="user_email"
                            type="email"
                            value={form.user_email}
                            onChange={handleChange}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="e.g. dist.login@gmail.com"
                          />
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">(This becomes User.email — must be unique)</div>
                      </div>

                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Login Name (optional)</label>
                        <div className="relative">
                          <UserPlus className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            name="user_name"
                            value={form.user_name}
                            onChange={handleChange}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="Shown in user profile"
                          />
                        </div>
                      </div>

                      <div className="col-span-12">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Password (optional)</label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            name="password"
                            type={showPass ? "text" : "password"}
                            value={form.password}
                            onChange={handleChange}
                            className="w-full border border-slate-300 rounded-xl pl-10 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                            placeholder="Leave blank to auto-generate"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPass((v) => !v)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                            title={showPass ? "Hide" : "Show"}
                          >
                            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          If blank, backend returns <b>temp_password</b> once.
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={saveDistributor}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-extrabold disabled:opacity-60"
                >
                  {loading ? "Saving..." : editingId ? "Save Changes" : "Create"}
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

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || listLoading || distributors.length === 0}
                  className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold disabled:opacity-60"
                  title="Works only if backend export endpoint exists"
                >
                  <Download className="w-4 h-4" />
                  {exporting ? "Exporting" : "Export"}
                </button>

                <label
                  className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold cursor-pointer disabled:opacity-60"
                  title="Works only if backend import endpoint exists"
                >
                  <Upload className="w-4 h-4" />
                  {importing ? "Importing" : "Import"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleImportChange}
                    disabled={importing}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* RIGHT: Listing area (maximized) */}
          <section className="col-span-12 lg:col-span-8">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  Listing ({filtered.length})
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="w-[240px] max-w-[55vw] border border-slate-300 rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Search name/mobile/email/city..."
                    />
                    {q ? (
                      <button
                        type="button"
                        onClick={() => setQ("")}
                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700"
                        title="Clear"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {listLoading ? (
                <div className="p-4 text-xs text-slate-600 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  Loading distributors...
                </div>
              ) : (
                <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200 w-[260px]">
                          Distributor
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200 w-[150px]">
                          Mobile
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200 w-[220px]">
                          Email
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200 w-[140px]">
                          City
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">
                          Address
                        </th>
                        <th className="px-3 py-2 text-center font-bold text-slate-700 border-b border-slate-200 w-[90px]">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            No distributors found.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((d) => (
                          <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <div className="font-bold text-slate-900">{d.name || "-"}</div>
                              <div className="text-[11px] text-slate-500">ID: {d.id}</div>
                            </td>

                            <td className="px-3 py-2 text-slate-700">
                              <span className="inline-flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {d.mobile || "-"}
                              </span>
                            </td>

                            <td className="px-3 py-2 text-slate-700">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                {d.email || "-"}
                              </span>
                            </td>

                            <td className="px-3 py-2 text-slate-700">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                {d.city || "-"}
                              </span>
                            </td>

                            <td className="px-3 py-2 text-slate-700">
                              <div className="line-clamp-2">{d.address || "-"}</div>
                            </td>

                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(d)}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDelete(d.id)}
                                  disabled={deletingId === d.id}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-50"
                                  title="Deactivate"
                                >
                                  {deletingId === d.id ? (
                                    <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Created / Reset password modal (re-used) */}
      {createdLogin && (
        <div className="fixed inset-0 z-[60] bg-black/60">
          <div className="h-full w-full p-3 flex items-center justify-center">
            <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <div className="text-sm font-extrabold">Distributor Login</div>
                <button
                  onClick={() => setCreatedLogin(null)}
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-sm">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                  Save these credentials now. Password is shown only once.
                </div>

                <div className="grid grid-cols-12 gap-2 text-xs">
                  <div className="col-span-12 sm:col-span-6">
                    <div className="text-[11px] text-slate-500">Login Email</div>
                    <div className="font-bold text-slate-900 break-all">{createdLogin.user?.email || "-"}</div>
                  </div>
                  <div className="col-span-12 sm:col-span-6">
                    <div className="text-[11px] text-slate-500">Role</div>
                    <div className="font-bold text-slate-900">{createdLogin.user?.role || "distributor"}</div>
                  </div>

                  <div className="col-span-12">
                    <div className="text-[11px] text-slate-500">Temporary Password</div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="font-extrabold text-slate-900 break-all">
                        {createdLogin.temp_password || "(not returned)"}
                      </div>
                      <button
                        type="button"
                        className="text-[11px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                        onClick={() => {
                          const text = createdLogin.temp_password || "";
                          if (!text) return;
                          navigator.clipboard?.writeText(text);
                          setToast({ message: "Password copied.", type: "success" });
                        }}
                        disabled={!createdLogin.temp_password}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreatedLogin(null)}
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-extrabold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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

export default DistributorsPageClient;
