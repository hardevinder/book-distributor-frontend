"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  Pencil,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  Building2,
  Sparkles,
  Image as ImageIcon,
  UploadCloud,
} from "lucide-react";

type CompanyProfile = {
  id: number;
  name: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone_primary?: string | null;
  phone_secondary?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  logo_url?: string | null;
  is_default: boolean;
  is_active: boolean;
};

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

const emptyForm: Omit<CompanyProfile, "id" | "is_default" | "is_active"> = {
  name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  phone_primary: "",
  phone_secondary: "",
  email: "",
  website: "",
  gstin: "",
  logo_url: "",
};

const CompanyProfilePageClient: React.FC = () => {
  const { user, logout } = useAuth();

  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isDefault, setIsDefault] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // Logo upload state
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const fetchProfiles = async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await api.get<CompanyProfile[]>("/api/company-profiles");
      setProfiles(res.data);
      if (!editingId && res.data.length > 0) {
        setIsDefault(false);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to load company profiles.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto hide toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsDefault(profiles.length === 0); // first profile default
    setIsActive(true);
    setError(null);
    setUploadingLogo(false);
    setIsDragOver(false);
  };

  const saveProfile = async () => {
    setError(null);
    setLoading(true);

    try {
      if (!form.name.trim()) {
        throw new Error("Company name is required.");
      }

      const payload = {
        ...form,
        is_default: isDefault,
        is_active: isActive,
      };

      if (editingId) {
        await api.put(`/api/company-profiles/${editingId}`, payload);
        setToast({
          message: "Company profile updated successfully.",
          type: "success",
        });
      } else {
        await api.post("/api/company-profiles", payload);
        setToast({
          message: "Company profile created successfully.",
          type: "success",
        });
      }

      await fetchProfiles();
      resetForm();
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        (editingId
          ? "Failed to update company profile."
          : "Failed to create company profile.");
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (profile: CompanyProfile) => {
    setEditingId(profile.id);
    setForm({
      name: profile.name || "",
      address_line1: profile.address_line1 || "",
      address_line2: profile.address_line2 || "",
      city: profile.city || "",
      state: profile.state || "",
      pincode: profile.pincode || "",
      phone_primary: profile.phone_primary || "",
      phone_secondary: profile.phone_secondary || "",
      email: profile.email || "",
      website: profile.website || "",
      gstin: profile.gstin || "",
      logo_url: profile.logo_url || "",
    });
    setIsDefault(profile.is_default);
    setIsActive(profile.is_active);
    setError(null);
  };

  const handleToggleActive = async (id: number) => {
    setError(null);
    try {
      await api.patch(`/api/company-profiles/${id}/toggle`);
      await fetchProfiles();
      setToast({
        message: "Status updated successfully.",
        type: "success",
      });
    } catch (err: any) {
      console.error(err);
      const msg = "Failed to update active status.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    }
  };

  const defaultProfile = profiles.find((p) => p.is_default);

  /* ---------------- Logo Upload Helpers ---------------- */

  const uploadLogoFile = async (file: File) => {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post(
        "/api/company-profile/logo-upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const { logo_url } = res.data || {};
      if (logo_url) {
        setForm((prev) => ({ ...prev, logo_url }));
        setToast({
          message: "Logo uploaded successfully.",
          type: "success",
        });
      } else {
        throw new Error("Invalid response from server.");
      }
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to upload logo.";
      setError(msg);
      setToast({ message: msg, type: "error" });
    } finally {
      setUploadingLogo(false);
      setIsDragOver(false);
    }
  };

  const handleLogoInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogoFile(file);
    }
    // reset value so same file can be selected again if needed
    e.target.value = "";
  };

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadLogoFile(file);
    }
  };

  const handleLogoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleLogoDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Back to Dashboard</span>
          </Link>
        </div>
        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">
              Company Profile
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Header details for Purchase Orders & Invoices
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col items-end">
            <span className="font-semibold text-slate-800">
              {user?.name || "User"}
            </span>
            {user?.role && (
              <span className="text-xs rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-medium">
                {user.role}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 transform"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 p-6 lg:p-8 space-y-6">
        {/* Title & small badge for default */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Company Header Settings
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                This information will appear on Purchase Orders, Invoices and
                other documents.
              </p>
            </div>
          </div>
          {defaultProfile && (
            <div className="px-4 py-2 rounded-xl bg-white/80 border border-emerald-200 shadow-sm text-[11px] sm:text-xs text-emerald-700 max-w-xs">
              <div className="font-semibold flex items-center gap-2 mb-1">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[10px]">
                  ✓
                </span>
                Default Profile in Use
              </div>
              <div className="font-medium truncate">
                {defaultProfile.name || "—"}
              </div>
              {defaultProfile.city && (
                <div className="truncate text-emerald-800">
                  {defaultProfile.city}
                  {defaultProfile.state ? `, ${defaultProfile.state}` : ""}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Alerts */}
        {error && (
          <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-red-700">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">
                !
              </div>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Form + List */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Form Card */}
          <div className="lg:col-span-1 bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-slate-200/70">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500" />
                {editingId ? "Edit Company Profile" : "New Company Profile"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] sm:text-xs px-3 py-1.5 border border-slate-200 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="e.g. Sumeet Book Store"
                />
              </div>

              {/* Phones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Phone (Primary)
                  </label>
                  <input
                    name="phone_primary"
                    value={form.phone_primary || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Phone (Secondary)
                  </label>
                  <input
                    name="phone_secondary"
                    value={form.phone_secondary || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Email & Website */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Website
                  </label>
                  <input
                    name="website"
                    value={form.website || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              {/* GST & Logo (with drag & drop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    GSTIN
                  </label>
                  <input
                    name="gstin"
                    value={form.gstin || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="e.g. 03BSJPS3113G1Z0"
                  />
                </div>

                {/* Drag & Drop Logo Uploader */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                    Company Logo
                  </label>

                  <div
                    className={`relative border border-dashed rounded-md px-3 py-3 text-[10px] sm:text-[11px] cursor-pointer transition-all ${
                      isDragOver
                        ? "border-indigo-400 bg-indigo-50/60"
                        : "border-slate-300 bg-slate-50/80 hover:bg-slate-100"
                    }`}
                    onDragOver={handleLogoDragOver}
                    onDragLeave={handleLogoDragLeave}
                    onDrop={handleLogoDrop}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200">
                        <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-800">
                          {uploadingLogo
                            ? "Uploading logo..."
                            : "Drag & drop logo, or click to browse"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          PNG, JPG, JPEG, WEBP • Max 5 MB
                        </span>
                      </div>
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoInputChange}
                    />
                  </div>

                  {/* Logo path + preview */}
                  {form.logo_url && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-10 w-10 rounded-md border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                        {/* Simple preview; ensure your logo_url is absolute or accessible from frontend */}
                        <img
                          src={form.logo_url}
                          alt="Company logo"
                          className="max-h-10 max-w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 truncate max-w-[160px]">
                          {form.logo_url}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm((prev) => ({ ...prev, logo_url: "" }));
                          }}
                          className="text-[10px] text-rose-600 hover:underline"
                        >
                          Remove logo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Address Line 1
                </label>
                <input
                  name="address_line1"
                  value={form.address_line1 || ""}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Street / Building"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Address Line 2
                </label>
                <input
                  name="address_line2"
                  value={form.address_line2 || ""}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Area / Landmark"
                />
              </div>

              {/* City, State, Pincode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    name="city"
                    value={form.city || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    State
                  </label>
                  <input
                    name="state"
                    value={form.state || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Pincode
                  </label>
                  <input
                    name="pincode"
                    value={form.pincode || ""}
                    onChange={handleChange}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-[11px] sm:text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold">Set as default profile</span>
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold">Active</span>
                </label>
              </div>

              {/* Save Button */}
              <div className="pt-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={saveProfile}
                  className="w-full inline-flex items-center justify-center h-9 px-4 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] sm:text-xs font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-60"
                >
                  {loading
                    ? editingId
                      ? "Saving changes..."
                      : "Creating..."
                    : editingId
                    ? "Save Changes"
                    : "Create Profile"}
                </button>
              </div>
            </div>
          </div>

          {/* List Card */}
          <div className="lg:col-span-2 bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-lg border border-slate-200/70">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500" />
                Company Profiles ({profiles.length})
              </h2>
              {!listLoading && profiles.length === 0 && (
                <span className="text-[11px] sm:text-xs text-slate-500">
                  No profiles yet. Add one using the form on left.
                </span>
              )}
            </div>

            {listLoading ? (
              <div className="flex items-center justify-center py-10 text-xs sm:text-sm text-slate-600">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                Loading company profiles...
              </div>
            ) : (
              <div className="overflow-auto max-h-[520px] rounded-xl border border-slate-200/80 shadow-inner">
                <table className="w-full text-[11px] sm:text-sm border-collapse bg-white">
                  <thead className="bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-20">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                        Company
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                        Contact
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 border-b border-slate-200">
                        Address
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-700 border-b border-slate-200">
                        Default
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-700 border-b border-slate-200">
                        Active
                      </th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-700 border-b border-slate-200">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p) => {
                      const addrParts = [
                        p.address_line1,
                        p.address_line2,
                        [p.city, p.state, p.pincode].filter(Boolean).join(", "),
                      ]
                        .filter(Boolean)
                        .join(", ");

                      const contactLines = [
                        p.phone_primary,
                        p.email,
                        p.website,
                        p.gstin ? `GSTIN: ${p.gstin}` : null,
                      ].filter(Boolean);

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50 transition-colors group"
                        >
                          <td className="px-3 py-2 border-b border-slate-200 align-top">
                            <div className="flex flex-col gap-0.5">
                              <div className="font-semibold text-slate-900 flex items-center gap-2">
                                {p.name || "—"}
                                {p.is_default && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Default
                                  </span>
                                )}
                              </div>
                              {p.logo_url && (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="h-7 w-7 rounded-md border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                                    <img
                                      src={p.logo_url}
                                      alt="Logo"
                                      className="max-h-7 max-w-full object-contain"
                                    />
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate max-w-[160px] flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3 text-slate-400" />
                                    <span>{p.logo_url}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-b border-slate-200 align-top text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              {contactLines.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                contactLines.map((line, idx) => (
                                  <span
                                    key={idx}
                                    className="block truncate max-w-[200px]"
                                  >
                                    {line}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-b border-slate-200 align-top text-slate-600">
                            {addrParts ? (
                              <span className="line-clamp-2">{addrParts}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-200 text-center align-top">
                            {p.is_default ? (
                              <span className="inline-flex h-6 items-center justify-center px-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">
                                Yes
                              </span>
                            ) : (
                              <span className="inline-flex h-6 items-center justify-center px-2 rounded-full bg-slate-50 text-slate-500 border border-slate-200 text-[10px] font-medium">
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-200 text-center align-top">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(p.id)}
                              className="inline-flex items-center justify-center h-7 px-2 rounded-full border border-slate-300 bg-white text-[10px] sm:text-xs text-slate-700 hover:bg-slate-50 gap-1"
                            >
                              {p.is_active ? (
                                <>
                                  <ToggleRight className="w-4 h-4 text-emerald-500" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                                  Inactive
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2 border-b border-slate-200 text-center align-top">
                            <button
                              type="button"
                              onClick={() => handleEdit(p)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg hover:scale-110 transition-all group-hover:opacity-100 opacity-80"
                              aria-label="Edit profile"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {profiles.length === 0 && !listLoading && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-4 text-center text-[11px] text-slate-500"
                        >
                          No company profiles found. Use the form on the left to
                          add one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm sm:text-base ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default CompanyProfilePageClient;
