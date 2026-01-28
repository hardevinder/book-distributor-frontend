"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import {
  ChevronLeft,
  Layers,
  School as SchoolIcon,
  Search,
  RefreshCcw,
  Plus,
  Trash2,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  PackagePlus,
  Lock,
} from "lucide-react";

/* ---------------- Types ---------------- */

type School = { id: number; name: string };
type ClassItem = { id: number; class_name: string; sort_order?: number; is_active?: boolean };

type BookLite = {
  id: number;
  title: string;
  subject?: string | null;
  code?: string | null;
  class_name?: string | null;
};

type ProductLite = {
  id: number;
  type: "BOOK" | "MATERIAL";
  book_id?: number | null;
  name?: string | null;
  uom?: string | null;
  is_active?: boolean;
  book?: BookLite | null; // if backend includes it
};

type BundleItemRow = {
  id: number;
  bundle_id: number;
  product_id: number;
  qty: number;
  mrp: number;
  sale_price: number;
  is_optional: boolean;
  sort_order: number;
  product?: ProductLite | null;
};

type BundleRow = {
  id: number;
  school_id: number;
  class_id?: number | null;
  class_name?: string | null;
  academic_session?: string | null;
  name: string;
  is_active: boolean;
  sort_order: number;
  createdAt?: string;
  updatedAt?: string;
  school?: School;
  class?: { id: number; class_name: string } | null;
  items?: BundleItemRow[];
};

type ProductsApiStatus = "idle" | "ok" | "missing" | "unauthorized" | "error";

/* ---------------- Helpers ---------------- */

const SESSION_OPTIONS = (() => {
  const base = 2026;
  const arr: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const y1 = base + i;
    const y2Short = String((y1 + 1) % 100).padStart(2, "0");
    arr.push(`${y1}-${y2Short}`);
  }
  return arr;
})();

const safeStr = (v: any) => String(v ?? "").trim();
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const bool = (v: any) => v === true || v === 1 || v === "1" || v === "true";

const normalizeSchools = (payload: any): School[] => {
  if (Array.isArray(payload)) return payload as School[];
  if (payload && Array.isArray(payload.data)) return payload.data as School[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as School[];
  if (payload && Array.isArray(payload.schools)) return payload.schools as School[];
  return [];
};

const normalizeClasses = (payload: any): ClassItem[] => {
  if (Array.isArray(payload)) return payload as ClassItem[];
  if (payload && Array.isArray(payload.data)) return payload.data as ClassItem[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as ClassItem[];
  if (payload && Array.isArray(payload.classes)) return payload.classes as ClassItem[];
  return [];
};

const normalizeProducts = (payload: any): ProductLite[] => {
  if (Array.isArray(payload)) return payload as ProductLite[];
  if (payload && Array.isArray(payload.data)) return payload.data as ProductLite[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as ProductLite[];
  if (payload && Array.isArray(payload.products)) return payload.products as ProductLite[];
  return [];
};

const BundlesPageClient: React.FC = () => {
  const { user } = useAuth();

  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [schoolId, setSchoolId] = useState<number | "">("");
  const DEFAULT_SESSION = "2026-27";
  const [session, setSession] = useState<string>(DEFAULT_SESSION);

  const [loadingBundles, setLoadingBundles] = useState(false);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<BundleRow | null>(null);

  // editor fields (bundle)
  const [bundleName, setBundleName] = useState("");
  const [classId, setClassId] = useState<number | "">("");
  const [className, setClassName] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  // items editor
  const [savingBundle, setSavingBundle] = useState(false);
  const [savingItems, setSavingItems] = useState(false);

  // picker
  const [productsApiStatus, setProductsApiStatus] = useState<ProductsApiStatus>("idle");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [booksFallback, setBooksFallback] = useState<BookLite[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerType, setPickerType] = useState<"ALL" | "BOOK" | "MATERIAL">("ALL");

  // notifications
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSchool = useMemo(() => {
    const idNum = Number(schoolId);
    return schools.find((s) => s.id === idNum);
  }, [schools, schoolId]);

  /* ---------------- Load masters ---------------- */

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, cRes] = await Promise.all([api.get("/api/schools"), api.get("/api/classes")]);
        setSchools(normalizeSchools(sRes?.data));
        setClasses(
          normalizeClasses(cRes?.data).sort(
            (a, b) =>
              num(a.sort_order) - num(b.sort_order) ||
              safeStr(a.class_name).localeCompare(safeStr(b.class_name))
          )
        );
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  /* ---------------- Bundles list ---------------- */

  const loadBundles = async () => {
    if (!schoolId) return;
    setError(null);

    try {
      setLoadingBundles(true);
      const res = await api.get("/api/bundles", {
        params: {
          school_id: Number(schoolId),
          academic_session: session || undefined,
          is_active: undefined, // keep all
        },
      });

      const rows = Array.isArray(res?.data?.data) ? (res.data.data as BundleRow[]) : [];
      const sorted = rows.sort((a, b) => num(a.sort_order) - num(b.sort_order) || num(b.id) - num(a.id));
      setBundles(sorted);
    } catch (err: any) {
      console.error("Failed to load bundles", err);
      setBundles([]);
      setError(err?.response?.data?.message || "Failed to load bundles.");
    } finally {
      setLoadingBundles(false);
    }
  };

  const loadBundleById = async (id: number) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await api.get(`/api/bundles/${id}`);
      const row: BundleRow | null = res?.data?.data || null;
      setActive(row);
      setActiveId(row?.id ?? null);

      setBundleName(row?.name || "");
      setSortOrder(num(row?.sort_order));
      setIsActive(bool(row?.is_active));

      setClassId(row?.class_id ? num(row.class_id) : "");
      setClassName(row?.class_name || row?.class?.class_name || "");
    } catch (err: any) {
      console.error("Failed to load bundle", err);
      setError(err?.response?.data?.message || "Failed to load bundle.");
    }
  };

  /* ---------------- Products picker ---------------- */

  const loadProductsOrFallback = async () => {
    if (!schoolId) return;

    setPickerLoading(true);
    setProductsApiStatus("idle");

    try {
      // ✅ load ALL products (BOOK + MATERIAL), include book details for BOOK products
      const pRes = await api.get("/api/products", {
        params: { is_active: 1, include_book: 1 },
      });

      const arr = normalizeProducts(pRes?.data);
      setProducts(arr);
      setBooksFallback([]);
      setProductsApiStatus("ok");
    } catch (e: any) {
      const status = e?.response?.status;

      // Important: differentiate 401 vs 404
      if (status === 401) {
        setProducts([]);
        setBooksFallback([]);
        setProductsApiStatus("unauthorized");
        // show a clean message, not "API not found"
        setError("You are not authorized to load products. Please login again (token missing/expired).");
        return;
      }

      if (status === 404) {
        setProductsApiStatus("missing");
      } else {
        setProductsApiStatus("error");
      }

      // fallback to books list (only when products route missing / error)
      try {
        const bRes = await api.get("/api/books", { params: { limit: 5000 } });
        const rows = Array.isArray(bRes?.data?.data)
          ? (bRes.data.data as any[])
          : Array.isArray(bRes?.data?.rows)
          ? bRes.data.rows
          : Array.isArray(bRes?.data)
          ? bRes.data
          : [];

        const lite: BookLite[] = rows.map((x: any) => ({
          id: num(x.id),
          title: safeStr(x.title),
          subject: x.subject ?? null,
          code: x.code ?? null,
          class_name: x.class_name ?? null,
        }));

        setBooksFallback(lite);
        setProducts([]);
      } catch (err) {
        console.error(err);
        setProducts([]);
        setBooksFallback([]);
      }
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    if (!schoolId) {
      setBundles([]);
      setActive(null);
      setActiveId(null);
      setProducts([]);
      setBooksFallback([]);
      setProductsApiStatus("idle");
      return;
    }

    setError(null);
    setSuccess(null);

    // reset selection on change
    setActive(null);
    setActiveId(null);
    setBundleName("");
    setClassId("");
    setClassName("");
    setSortOrder(0);
    setIsActive(true);
    setPickerQ("");
    setPickerType("ALL");

    loadBundles();
    loadProductsOrFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, session]);

  /* ---------------- Picker filtering ---------------- */

  const filteredPickerRows = useMemo(() => {
    const q = safeStr(pickerQ).toLowerCase();

    // products api available
    if (products.length) {
      let rows = products.map((p) => {
        const isBook = p.type === "BOOK";
        const title = isBook ? p.book?.title || `Book #${p.book_id ?? ""}` : p.name || `Material #${p.id}`;
        const subject = isBook ? p.book?.subject || "" : "MATERIAL";
        const code = isBook ? p.book?.code || "" : (p.uom || "");
        const cls = isBook ? p.book?.class_name || "" : "";

        return {
          key: `p:${p.id}`,
          type: p.type,
          product_id: p.id,
          title,
          subject,
          code,
          class_name: cls,
        };
      });

      if (pickerType !== "ALL") {
        rows = rows.filter((r) => r.type === pickerType);
      }

      if (!q) return rows.slice(0, 80);

      return rows
        .filter((r) => `${r.title} ${r.subject} ${r.code} ${r.class_name}`.toLowerCase().includes(q))
        .slice(0, 80);
    }

    // fallback books list (API missing/error)
    let rows = booksFallback.map((b) => ({
      key: `b:${b.id}`,
      type: "BOOK" as const,
      product_id: b.id, // fallback assumption
      title: b.title,
      subject: b.subject || "",
      code: b.code || "",
      class_name: b.class_name || "",
    }));

    if (pickerType === "MATERIAL") rows = []; // no materials in fallback

    if (!q) return rows.slice(0, 80);
    return rows.filter((r) => `${r.title} ${r.subject} ${r.code} ${r.class_name}`.toLowerCase().includes(q)).slice(0, 80);
  }, [products, booksFallback, pickerQ, pickerType]);

  /* ---------------- Create bundle ---------------- */

  const canCreateBundle = !!schoolId && safeStr(bundleName) && !!(session || "").trim() && !savingBundle;

  const createBundle = async () => {
    if (!canCreateBundle) return;
    setError(null);
    setSuccess(null);

    try {
      setSavingBundle(true);

      const payload: any = {
        school_id: Number(schoolId),
        name: safeStr(bundleName),
        academic_session: safeStr(session) || null,
        is_active: !!isActive,
        sort_order: num(sortOrder),
      };

      if (classId) payload.class_id = Number(classId);
      if (!classId && safeStr(className)) payload.class_name = safeStr(className);

      const res = await api.post("/api/bundles", payload);
      const created: BundleRow | null = res?.data?.data || null;

      setSuccess("Bundle created ✅");
      await loadBundles();

      if (created?.id) {
        await loadBundleById(created.id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to create bundle.");
    } finally {
      setSavingBundle(false);
    }
  };

  /* ---------------- Save bundle details ---------------- */

  const canSaveBundle = !!activeId && !savingBundle;

  const saveBundle = async () => {
    if (!activeId) return;
    setError(null);
    setSuccess(null);

    try {
      setSavingBundle(true);

      const payload: any = {
        name: safeStr(bundleName),
        academic_session: safeStr(session) || null,
        is_active: !!isActive,
        sort_order: num(sortOrder),
      };

      if (classId) {
        payload.class_id = Number(classId);
        payload.class_name = null;
      } else {
        payload.class_id = null;
        payload.class_name = safeStr(className) || null;
      }

      await api.put(`/api/bundles/${activeId}`, payload);
      setSuccess("Bundle updated ✅");

      await loadBundles();
      await loadBundleById(activeId);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to update bundle.");
    } finally {
      setSavingBundle(false);
    }
  };

  /* ---------------- Delete bundle ---------------- */

  const deleteBundle = async () => {
    if (!activeId) return;
    setError(null);
    setSuccess(null);

    const ok = window.confirm(`Delete Bundle #${activeId}? This will remove its items too.`);
    if (!ok) return;

    try {
      await api.delete(`/api/bundles/${activeId}`);
      setSuccess("Bundle deleted ✅");
      setActive(null);
      setActiveId(null);
      setBundleName("");
      setClassId("");
      setClassName("");
      setSortOrder(0);
      setIsActive(true);

      await loadBundles();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete bundle.");
    }
  };

  /* ---------------- Items editing ---------------- */

  const activeItems = useMemo(() => {
    const items = (active?.items || []).slice();
    items.sort((a, b) => num(a.sort_order) - num(b.sort_order) || num(a.id) - num(b.id));
    return items;
  }, [active]);

  const updateItemLocal = (itemId: number, patch: Partial<BundleItemRow>) => {
    setActive((prev) => {
      if (!prev) return prev;
      const nextItems = (prev.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it));
      return { ...prev, items: nextItems };
    });
  };

  const addItemLocal = (product_id: number) => {
    if (!activeId) {
      setError("Create/select a bundle first.");
      return;
    }
    setError(null);
    setSuccess(null);

    const exists = (active?.items || []).some((it) => num(it.product_id) === num(product_id));
    if (exists) {
      setSuccess("Already in bundle ✅");
      return;
    }

    const tempId = -Date.now();
    const prod = products.find((p) => p.id === product_id) || null;

    const row: BundleItemRow = {
      id: tempId,
      bundle_id: activeId,
      product_id,
      qty: 1,
      mrp: 0,
      sale_price: 0,
      is_optional: false,
      sort_order: (active?.items?.length || 0) + 1,
      product: prod,
    };

    setActive((prev) => {
      if (!prev) return prev;
      return { ...prev, items: [...(prev.items || []), row] };
    });

    setSuccess("Item added (save to apply) ✅");
  };

  const removeItem = async (itemId: number) => {
    if (!activeId) return;
    setError(null);
    setSuccess(null);

    if (itemId < 0) {
      setActive((prev) => {
        if (!prev) return prev;
        return { ...prev, items: (prev.items || []).filter((it) => it.id !== itemId) };
      });
      return;
    }

    const ok = window.confirm("Remove this item from bundle?");
    if (!ok) return;

    try {
      await api.delete(`/api/bundles/${activeId}/items/${itemId}`);
      setSuccess("Item removed ✅");
      await loadBundleById(activeId);
      await loadBundles();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to remove item.");
    }
  };

  const saveItems = async () => {
    if (!activeId || !active) return;
    setError(null);
    setSuccess(null);

    const items = (active.items || []).map((it) => ({
      id: it.id > 0 ? it.id : undefined,
      product_id: num(it.product_id),
      qty: Math.max(0, num(it.qty)),
      mrp: Math.max(0, num(it.mrp)),
      sale_price: Math.max(0, num(it.sale_price)),
      is_optional: !!it.is_optional,
      sort_order: Math.max(0, num(it.sort_order)),
    }));

    const bad = items.find((x) => !x.product_id || x.qty < 0);
    if (bad) {
      setError("Invalid item data. Please check qty/product.");
      return;
    }

    try {
      setSavingItems(true);
      await api.post(`/api/bundles/${activeId}/items`, { replace: true, items });
      setSuccess("Items saved ✅");
      await loadBundleById(activeId);
      await loadBundles();
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save items.");
    } finally {
      setSavingItems(false);
    }
  };

  /* ---------------- UI ---------------- */

  const refreshAll = async () => {
    if (!schoolId) return;
    setSuccess(null);
    setError(null);
    await Promise.all([loadBundles(), loadProductsOrFallback()]);
    if (activeId) await loadBundleById(activeId);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Desktop
              </Link>

              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Layers className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-base font-bold truncate">Bundles / Kits (Template Builder)</div>
                <div className="text-xs text-slate-500 truncate">
                  {selectedSchool?.name ? (
                    <>
                      <SchoolIcon className="inline w-4 h-4 mr-1" />
                      {selectedSchool.name}
                      {session ? ` • ${session}` : ""}
                    </>
                  ) : (
                    <>Select school to manage kits</>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={refreshAll}
              disabled={!schoolId || loadingBundles || pickerLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
            >
              <RefreshCcw className={`w-4 h-4 ${loadingBundles || pickerLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>

            <div className="text-xs text-slate-600 hidden sm:block">{user?.name || "User"}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-3">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-5">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">School</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={schoolId}
                onChange={(e) => setSchoolId(Number(e.target.value) || "")}
              >
                <option value="">Select School</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 sm:col-span-6 md:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Session</label>
              <select
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                {SESSION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-12 sm:col-span-6 md:col-span-4">
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                Tip: Create a bundle, then add items + prices. POS will use this kit template.
              </div>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="mt-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Products API status hints */}
          {schoolId && productsApiStatus === "missing" && booksFallback.length > 0 && (
            <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Products API route not found (404) — using books list as fallback. For perfect kit builder (books + stationery),
              add <b className="ml-1">/api/products</b>.
            </div>
          )}

          {schoolId && productsApiStatus === "unauthorized" && (
            <div className="mt-3 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <Lock className="w-5 h-5 flex-shrink-0" />
              Products API is protected (401). Ensure frontend sends JWT Authorization header for <b>/api/products</b>.
            </div>
          )}

          {schoolId && productsApiStatus === "error" && (
            <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Could not load products due to an error — using books fallback for now.
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="p-4 max-w-[1400px] mx-auto grid grid-cols-12 gap-4">
        {/* LEFT: Bundles list */}
        <section className="col-span-12 lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Bundles</div>
                <div className="text-xs text-slate-500">School-wise kit templates</div>
              </div>
              <button
                onClick={loadBundles}
                disabled={!schoolId || loadingBundles}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${loadingBundles ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>

            {!schoolId ? (
              <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select a school.
              </div>
            ) : loadingBundles ? (
              <div className="mt-3 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : bundles.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                No bundles yet.
              </div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {bundles.map((b) => {
                  const isSel = b.id === activeId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => loadBundleById(b.id)}
                      className={`w-full text-left border rounded-2xl px-3 py-3 transition ${
                        isSel ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate">{b.name || `Bundle #${b.id}`}</div>
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full border ${
                            b.is_active
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-slate-100 border-slate-200 text-slate-700"
                          }`}
                        >
                          {b.is_active ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-slate-600 truncate">
                        {b.class?.class_name || b.class_name || (b.class_id ? `Class #${b.class_id}` : "Class")}
                        {" • "}
                        {b.academic_session || session}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Items: <b>{b.items?.length ?? 0}</b> • Sort: <b>{num(b.sort_order)}</b>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* MIDDLE: Bundle editor */}
        <section className="col-span-12 lg:col-span-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-bold truncate">
                  {activeId ? `Edit Bundle #${activeId}` : "Create New Bundle"}
                </div>
                <div className="text-xs text-slate-500">Set class + name. Then add items & prices.</div>
              </div>

              <div className="flex items-center gap-2">
                {activeId ? (
                  <>
                    <button
                      onClick={saveBundle}
                      disabled={!canSaveBundle}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {savingBundle ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={deleteBundle}
                      disabled={!activeId}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={createBundle}
                    disabled={!canCreateBundle}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    <PackagePlus className="w-4 h-4" />
                    {savingBundle ? "Creating…" : "Create"}
                  </button>
                )}
              </div>
            </div>

            {!schoolId ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select school to start.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-12 gap-3">
                <div className="col-span-12">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Bundle Name</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="e.g., Class 5 Student Kit"
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    disabled={!schoolId}
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Class (preferred)</label>
                  <select
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    value={classId}
                    onChange={(e) => {
                      const v = Number(e.target.value) || "";
                      setClassId(v);
                      if (v) {
                        const cls = classes.find((c) => c.id === v);
                        setClassName(cls?.class_name || "");
                      }
                    }}
                    disabled={!schoolId}
                  >
                    <option value="">Select Class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.class_name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[11px] text-slate-500">If you don’t have class table, use Class Name field.</div>
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Class Name (fallback)</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="e.g., 5th / UKG / Nursery"
                    value={className}
                    onChange={(e) => {
                      setClassName(e.target.value);
                      setClassId("");
                    }}
                    disabled={!schoolId}
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Sort Order</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(num(e.target.value))}
                    disabled={!schoolId}
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Active</label>
                  <select
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    value={isActive ? "1" : "0"}
                    onChange={(e) => setIsActive(e.target.value === "1")}
                    disabled={!schoolId}
                  >
                    <option value="1">Active</option>
                    <option value="0">Disabled</option>
                  </select>
                </div>

                <div className="col-span-12 md:col-span-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Session</label>
                  <div className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-slate-50 text-sm">{session}</div>
                </div>
              </div>
            )}

            {/* Items editor */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-bold">Bundle Items</div>
                  <div className="text-xs text-slate-500">Qty, MRP & Sale Price are stored in kit template.</div>
                </div>

                <button
                  onClick={saveItems}
                  disabled={!activeId || savingItems}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingItems ? "Saving…" : "Save Items"}
                </button>
              </div>

              {!activeId ? (
                <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  Create/select a bundle to edit items.
                </div>
              ) : activeItems.length === 0 ? (
                <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  No items yet — add from right side.
                </div>
              ) : (
                <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="max-h-[56vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-800">Item</th>
                          <th className="px-3 py-3 text-center font-bold text-slate-800 w-20">Qty</th>
                          <th className="px-3 py-3 text-center font-bold text-slate-800 w-28">MRP</th>
                          <th className="px-3 py-3 text-center font-bold text-slate-800 w-28">Sale</th>
                          <th className="px-3 py-3 text-center font-bold text-slate-800 w-24">Optional</th>
                          <th className="px-3 py-3 text-center font-bold text-slate-800 w-20">Del</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map((it) => {
                          const title =
                            it.product?.type === "MATERIAL"
                              ? it.product?.name || `Material #${it.product_id}`
                              : it.product?.book?.title || it.product?.name || `Product #${it.product_id}`;

                          const meta =
                            it.product?.type === "MATERIAL"
                              ? `MATERIAL${it.product?.uom ? ` • ${it.product.uom}` : ""}`
                              : it.product?.book?.class_name || it.product?.book?.code || it.product?.book?.subject || "";

                          return (
                            <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{title}</div>
                                {meta ? <div className="text-xs text-slate-500 mt-0.5">{meta}</div> : null}
                                <div className="text-[11px] text-slate-400 mt-1">
                                  product_id: <b>{it.product_id}</b>
                                </div>
                              </td>

                              <td className="px-3 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-16 border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.qty}
                                  onChange={(e) => updateItemLocal(it.id, { qty: Math.max(0, num(e.target.value)) })}
                                />
                              </td>

                              <td className="px-3 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-24 border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.mrp}
                                  onChange={(e) => updateItemLocal(it.id, { mrp: Math.max(0, num(e.target.value)) })}
                                />
                              </td>

                              <td className="px-3 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-24 border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.sale_price}
                                  onChange={(e) => updateItemLocal(it.id, { sale_price: Math.max(0, num(e.target.value)) })}
                                />
                              </td>

                              <td className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => updateItemLocal(it.id, { is_optional: !it.is_optional })}
                                  className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold border transition ${
                                    it.is_optional
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  {it.is_optional ? "Yes" : "No"}
                                </button>
                              </td>

                              <td className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItem(it.id)}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs text-slate-500">Tip: Keep MRP for reference; POS will use Sale Price for billing.</div>
            </div>
          </div>
        </section>

        {/* RIGHT: Picker */}
        <section className="col-span-12 lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold">Add Items</div>
                <div className="text-xs text-slate-500">Search and add books + stationery</div>
              </div>
              <button
                type="button"
                onClick={loadProductsOrFallback}
                disabled={!schoolId || pickerLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-medium disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${pickerLoading ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>

            <div className="mt-3 grid grid-cols-12 gap-2">
              <div className="col-span-8">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    className={`w-full border border-slate-300 rounded-xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                      pickerQ ? "pr-10" : "pr-4"
                    }`}
                    placeholder="Title / name / subject / code…"
                    value={pickerQ}
                    onChange={(e) => setPickerQ(e.target.value)}
                    disabled={!schoolId}
                  />
                  {pickerQ && (
                    <button
                      type="button"
                      onClick={() => setPickerQ("")}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
                <select
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  value={pickerType}
                  onChange={(e) => setPickerType(e.target.value as any)}
                  disabled={!schoolId}
                >
                  <option value="ALL">All</option>
                  <option value="BOOK">Books</option>
                  <option value="MATERIAL">Material</option>
                </select>
              </div>
            </div>

            {!schoolId ? (
              <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select school first.
              </div>
            ) : pickerLoading ? (
              <div className="mt-3 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredPickerRows.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                No results.
              </div>
            ) : (
              <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden">
                <div className="max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-left font-bold text-slate-800">Item</th>
                        <th className="px-3 py-3 text-center font-bold text-slate-800 w-20">Add</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPickerRows.map((r) => {
                        const already = (active?.items || []).some((it) => num(it.product_id) === num(r.product_id));
                        const metaLine = [r.class_name, r.subject, r.code].filter(Boolean).join(" • ");

                        return (
                          <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            <td className="px-3 py-3">
                              <div className="font-semibold text-slate-900">{r.title}</div>
                              {metaLine ? <div className="text-xs text-slate-500 mt-0.5">{metaLine}</div> : null}
                              <div className="text-[11px] text-slate-400 mt-1">
                                product_id: <b>{r.product_id}</b>
                              </div>
                            </td>

                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => addItemLocal(r.product_id)}
                                disabled={!activeId || already}
                                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition border ${
                                  !activeId
                                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : already
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 cursor-not-allowed"
                                    : "border-slate-300 bg-white hover:bg-slate-100 text-slate-800"
                                }`}
                              >
                                {already ? (
                                  <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Added
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-4 h-4" />
                                    Add
                                  </>
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-slate-500">
              Books + Materials are supported when <b>/api/products</b> works. If you still see 401, fix JWT in apiClient.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default BundlesPageClient;
