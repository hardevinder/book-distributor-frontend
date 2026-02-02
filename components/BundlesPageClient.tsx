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
  BookOpen,
  Boxes,
  ShieldCheck,
  Menu,
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
  book?: BookLite | null;
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

/* ---- Availability API Types ---- */

type AvailabilityBookRow = {
  book_id: number;
  title: string;
  subject?: string | null;
  code?: string | null;
  publisher?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;

  required_qty: number;
  available_qty: number;
  reserved_qty: number;
  issued_qty: number;
  free_qty: number;

  source?: "REQ" | "DIRECT" | "BOTH";
};

type AvailabilityClassRow = { class_name: string; books: AvailabilityBookRow[] };

type AvailabilityResponse = {
  mode?: string;
  school?: { id: number; name: string };
  academic_session?: string | null;
  classes?: AvailabilityClassRow[];
};

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

  // picker - products
  const [productsApiStatus, setProductsApiStatus] = useState<ProductsApiStatus>("idle");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerType, setPickerType] = useState<"ALL" | "BOOK" | "MATERIAL">("ALL");

  // picker - school availability
  const [avLoading, setAvLoading] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [avQ, setAvQ] = useState("");
  const [avClass, setAvClass] = useState<string>("ALL");

  // picker tab
  const [pickerTab, setPickerTab] = useState<"SCHOOL_BOOKS" | "ADD_PRODUCTS">("SCHOOL_BOOKS");

  // ensure-books action
  const [ensuringBooks, setEnsuringBooks] = useState(false);

  // notifications
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ✅ UI Space improvements
  const [bundlesDrawerOpen, setBundlesDrawerOpen] = useState(false);

  // ✅ Create bundle as popup (space saver)
  const [createBundleOpen, setCreateBundleOpen] = useState(false);

  // ✅ Manual Extra create modal
  const [extraCreateOpen, setExtraCreateOpen] = useState(false);
  const [extraSaving, setExtraSaving] = useState(false);
  const [extraErr, setExtraErr] = useState<string | null>(null);
  const [extraName, setExtraName] = useState("");
  const [extraUom, setExtraUom] = useState("");
  const [extraActive, setExtraActive] = useState(true);

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
          is_active: undefined,
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

      // close drawer on select (small screens)
      setBundlesDrawerOpen(false);
    } catch (err: any) {
      console.error("Failed to load bundle", err);
      setError(err?.response?.data?.message || "Failed to load bundle.");
    }
  };

  /* ---------------- Load Products ---------------- */
  /**
   * ✅ Backend behavior:
   * - section=books  -> BOOK products only from REQUIREMENTS (school_id + academic_session)
   * - section=extras -> only DIRECT PURCHASED items (MATERIAL + direct-purchased BOOKs)
   */
  const loadProducts = async (opts?: { ensure_books?: boolean; section?: "books" | "extras" }) => {
    if (!schoolId) return;

    setPickerLoading(true);
    setProductsApiStatus("idle");

    try {
      const section: "books" | "extras" =
        opts?.section ?? (pickerTab === "ADD_PRODUCTS" ? "extras" : "books");

      const pRes = await api.get("/api/products", {
        params: {
          section, // ✅ NEW
          school_id: Number(schoolId), // ✅ for books section
          academic_session: session || undefined, // ✅ for books section

          is_active: 1,
          include_book: 1,

          // ✅ Option-A: auto create BOOK products (only makes sense for books)
          ensure_books: section === "books" && opts?.ensure_books ? 1 : undefined,
        },
      });

      const arr = normalizeProducts(pRes?.data);
      setProducts(arr);
      setProductsApiStatus("ok");
    } catch (e: any) {
      const status = e?.response?.status;

      if (status === 401) {
        setProducts([]);
        setProductsApiStatus("unauthorized");
        setError("You are not authorized to load products. Please login again (token missing/expired).");
        return;
      }

      if (status === 404) setProductsApiStatus("missing");
      else setProductsApiStatus("error");

      setProducts([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const ensureBookProductsNow = async () => {
    if (!schoolId) return;
    setError(null);
    setSuccess(null);

    setEnsuringBooks(true);
    try {
      await loadProducts({ ensure_books: true, section: "books" });
      setSuccess("BOOK products ensured ✅ (Books are now addable in kits)");
    } catch (e: any) {
      // loadProducts handles errors
    } finally {
      setEnsuringBooks(false);
    }
  };

  /* ---------------- Load Availability ---------------- */

  const loadAvailability = async () => {
    if (!schoolId) return;

    setAvLoading(true);
    try {
      const res = await api.get("/api/school-orders/availability", {
        params: {
          school_id: Number(schoolId),
          academic_session: session || undefined,
        },
      });

      const data: AvailabilityResponse = res?.data || null;
      setAvailability(data);
    } catch (e: any) {
      console.error(e);
      setAvailability(null);
      setError(e?.response?.data?.message || "Failed to load school availability.");
    } finally {
      setAvLoading(false);
    }
  };

  // When school/session changes: reload everything
  useEffect(() => {
    if (!schoolId) {
      setBundles([]);
      setActive(null);
      setActiveId(null);
      setProducts([]);
      setAvailability(null);
      setProductsApiStatus("idle");
      setPickerQ("");
      setPickerType("ALL");
      setAvQ("");
      setAvClass("ALL");
      setPickerTab("SCHOOL_BOOKS");
      return;
    }

    setError(null);
    setSuccess(null);

    setActive(null);
    setActiveId(null);
    setBundleName("");
    setClassId("");
    setClassName("");
    setSortOrder(0);
    setIsActive(true);

    loadBundles();
    loadProducts({ section: pickerTab === "ADD_PRODUCTS" ? "extras" : "books" });
    loadAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, session]);

  // When tab changes: reload products + adjust default pickerType
  useEffect(() => {
    if (!schoolId) return;

    if (pickerTab === "ADD_PRODUCTS") {
      setPickerType("MATERIAL");
      loadProducts({ section: "extras" });
    } else {
      setPickerType("ALL");
      loadProducts({ section: "books" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerTab]);

  /* ---------------- Maps ---------------- */

  // book_id -> product (BOOK)
  const bookProductByBookId = useMemo(() => {
    const m = new Map<number, ProductLite>();
    for (const p of products) {
      if (p.type === "BOOK" && p.book_id) m.set(Number(p.book_id), p);
    }
    return m;
  }, [products]);

  /* ---------------- Picker Filtering: Products ---------------- */

  const filteredProductRows = useMemo(() => {
    const q = safeStr(pickerQ).toLowerCase();

    let rows = products.map((p) => {
      const isBook = p.type === "BOOK";
      const title = isBook
        ? p.book?.title || (p.book_id ? `Book #${p.book_id}` : `Book Product #${p.id}`)
        : p.name || `Material #${p.id}`;

      const subject = isBook ? p.book?.subject || "" : "MATERIAL";
      const code = isBook ? p.book?.code || "" : p.uom || "";
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

    // For extras tab, keep BOTH types (MATERIAL + direct BOOK)
    if (pickerTab !== "ADD_PRODUCTS") {
      if (pickerType !== "ALL") rows = rows.filter((r) => r.type === pickerType);
    }

    if (!q) return rows.slice(0, 140);

    return rows
      .filter((r) => `${r.title} ${r.subject} ${r.code} ${r.class_name}`.toLowerCase().includes(q))
      .slice(0, 140);
  }, [products, pickerQ, pickerType, pickerTab]);

  /* ---------------- Picker Filtering: Availability ---------------- */

  const availabilityClassOptions = useMemo(() => {
    const cls = (availability?.classes || []).map((c) => safeStr(c.class_name)).filter(Boolean);
    const uniq = Array.from(new Set(cls)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ["ALL", ...uniq];
  }, [availability]);

  const flattenedAvailability = useMemo(() => {
    const q = safeStr(avQ).toLowerCase();
    const wantClass = safeStr(avClass);

    const out: Array<AvailabilityBookRow & { class_name: string }> = [];
    for (const c of availability?.classes || []) {
      const clsName = safeStr(c.class_name) || "Unknown";
      if (wantClass !== "ALL" && clsName !== wantClass) continue;

      for (const b of c.books || []) {
        const hay = `${b.title} ${b.subject ?? ""} ${b.code ?? ""} ${clsName}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        out.push({ ...b, class_name: clsName });
      }
    }

    out.sort(
      (a, b) =>
        num(b.required_qty) - num(a.required_qty) ||
        num(b.free_qty) - num(a.free_qty) ||
        safeStr(a.title).localeCompare(safeStr(b.title))
    );
    return out;
  }, [availability, avQ, avClass]);

  /* ---------------- Bundle CRUD ---------------- */

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

      if (created?.id) await loadBundleById(created.id);

      // reset create form popup state
      setCreateBundleOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to create bundle.");
    } finally {
      setSavingBundle(false);
    }
  };

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
    items.sort((a, b) => num(a.sort_order) - num(b.sort_order) || num(a.id) - num(a.id));
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

  const addSchoolBookToKit = (book_id: number) => {
    const p = bookProductByBookId.get(Number(book_id));
    if (!p?.id) {
      setError(`No BOOK product for book_id=${book_id}. Click “Ensure Book Products” once.`);
      return;
    }
    addItemLocal(p.id);
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

  /* ---------------- Extras: Manual create product ---------------- */

  const createExtraProductNow = async () => {
    if (!schoolId) {
      setExtraErr("Select school first.");
      return;
    }
    if (!safeStr(extraName)) {
      setExtraErr("Enter item name.");
      return;
    }

    setExtraErr(null);
    setSuccess(null);
    setError(null);

    try {
      setExtraSaving(true);

      // ✅ MUST match your backend createProduct payload
      // POST /api/products { type, name, uom?, is_active? }
      const payload: any = {
        type: "MATERIAL",
        name: safeStr(extraName),
        uom: safeStr(extraUom) || "PCS",
        is_active: extraActive ? 1 : 0,
      };

      const res = await api.post("/api/products", payload);

      const created: any = res?.data?.data || null;
      if (!created?.id) {
        setExtraErr("Created but response missing product id.");
        return;
      }

      const newProd: ProductLite = {
        id: Number(created.id),
        type: "MATERIAL",
        name: created.name ?? safeStr(extraName),
        uom: created.uom ?? (safeStr(extraUom) || "PCS"),
        is_active: created.is_active ?? (extraActive ? true : false),
        book_id: null,
        book: null,
      };

      // insert locally (instant UI)
      setProducts((prev) => {
        const exists = prev.some((p) => Number(p.id) === Number(newProd.id));
        if (exists) return prev;
        return [newProd, ...prev];
      });

      // auto-add to bundle if selected
      if (activeId) addItemLocal(newProd.id);

      setExtraName("");
      setExtraUom("");
      setExtraActive(true);
      setExtraCreateOpen(false);
      setSuccess(activeId ? "Extra item created & added ✅" : "Extra item created ✅ (select bundle to add)");
    } catch (e: any) {
      console.error(e);
      setExtraErr(e?.response?.data?.message || "Failed to create extra item.");
    } finally {
      setExtraSaving(false);
    }
  };

  /* ---------------- UI ---------------- */

  const refreshAll = async () => {
    if (!schoolId) return;
    setSuccess(null);
    setError(null);
    await Promise.all([
      loadBundles(),
      loadProducts({ section: pickerTab === "ADD_PRODUCTS" ? "extras" : "books" }),
      loadAvailability(),
    ]);
    if (activeId) await loadBundleById(activeId);
  };

  const schoolBooksCount = flattenedAvailability.length;
  const bookProductsCount = products.filter((p) => p.type === "BOOK").length;

  const missingBookProductsCount = useMemo(() => {
    let missing = 0;
    for (const row of flattenedAvailability) {
      if (!bookProductByBookId.get(Number(row.book_id))) missing++;
    }
    return missing;
  }, [flattenedAvailability, bookProductByBookId]);

  const activeBundleLabel = useMemo(() => {
    if (!activeId) return "Select Bundle";
    const b = bundles.find((x) => x.id === activeId);
    return b?.name ? b.name : `Bundle #${activeId}`;
  }, [activeId, bundles]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* ✅ Top Bar: ONE toolbar row (filters + actions + expand button in same bar) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
        <div className="px-3 sm:px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* LEFT: back + icon + title */}
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition shrink-0"
                title="Back"
              >
                <ChevronLeft className="w-4 h-4" />
                Desktop
              </Link>

              <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                <Layers className="w-5 h-5" />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-extrabold leading-tight truncate">Bundles / Kits</div>
                <div className="text-[11px] text-slate-500 truncate">
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

            {/* Spacer so controls align right */}
            <div className="flex-1 min-w-[10px]" />

            {/* RIGHT: filters + expand + actions (in same bar) */}
            <div className="flex flex-wrap items-center gap-2 justify-end w-full xl:w-auto">
              {/* School */}
              <div className="w-full sm:w-[260px]">
                <select
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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

              {/* Session */}
              <div className="w-[130px]">
                <select
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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

              {/* ✅ Expand/Drawer button stays in BAR (not on top) */}
              <button
                type="button"
                onClick={() => setBundlesDrawerOpen(true)}
                className="lg:hidden inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold"
                title="Select Bundle"
              >
                <Menu className="w-4 h-4" />
                <span className="max-w-[160px] truncate">{activeBundleLabel}</span>
              </button>

              {/* Compact stats chip (hidden on small screens to save height) */}
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-700">
                <span>
                  Books: <b>{schoolBooksCount}</b>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  Missing: <b>{missingBookProductsCount}</b>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  Book Products: <b>{bookProductsCount}</b>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  Products: <b>{products.length}</b>
                </span>
              </div>

              {/* New Bundle */}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  setCreateBundleOpen(true);
                }}
                disabled={!schoolId}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-sm font-bold disabled:opacity-50"
              >
                <PackagePlus className="w-4 h-4" />
                New
              </button>

              {/* Refresh */}
              <button
                onClick={refreshAll}
                disabled={!schoolId || loadingBundles || pickerLoading || avLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
              >
                <RefreshCcw
                  className={`w-4 h-4 ${loadingBundles || pickerLoading || avLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>

              {/* user name (optional) */}
              <div className="hidden xl:block text-xs text-slate-600 pl-1">{user?.name || "User"}</div>
            </div>
          </div>

          {/* Error / Success (compact, under bar only when needed) */}
          {error && (
            <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="mt-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {schoolId && productsApiStatus === "unauthorized" && (
            <div className="mt-2 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <Lock className="w-4 h-4 flex-shrink-0" />
              Products API is protected (401). Ensure frontend sends JWT Authorization header for <b>/api/products</b>.
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="p-3 sm:p-4 max-w-[1500px] mx-auto grid grid-cols-12 gap-4">
        {/* LEFT: Bundles list (desktop only) */}
        <section className="hidden lg:block col-span-12 lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Bundles</div>
                <div className="text-xs text-slate-500">Pick bundle then add items</div>
              </div>
              <button
                onClick={loadBundles}
                disabled={!schoolId || loadingBundles}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold disabled:opacity-50"
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
              <div className="mt-3 space-y-2 max-h-[72vh] overflow-y-auto pr-1">
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
                        <div className="font-bold text-sm truncate">{b.name || `Bundle #${b.id}`}</div>
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

        {/* MIDDLE: Bundle editor (more space now) */}
        <section className="col-span-12 lg:col-span-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-bold truncate">
                  {activeId ? `Edit Bundle #${activeId}` : "No Bundle Selected"}
                </div>
                <div className="text-xs text-slate-500">
                  {activeId ? "Edit name/class then add items." : "Select a bundle (or create new) to add items."}
                </div>
              </div>

              {activeId ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveBundle}
                    disabled={!canSaveBundle}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {savingBundle ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={deleteBundle}
                    disabled={!activeId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-4 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {!schoolId ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select school to start.
              </div>
            ) : !activeId ? (
              <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                No bundle selected. Use <b>New</b> button on top OR select bundle from menu.
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-12 gap-3">
                <div className="col-span-12">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Bundle Name</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    placeholder="e.g., Class 5 Student Kit"
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    disabled={!schoolId}
                  />
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Class (preferred)</label>
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
                </div>

                <div className="col-span-12 md:col-span-6">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Class Name (fallback)</label>
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
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Sort Order</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(num(e.target.value))}
                    disabled={!schoolId}
                  />
                </div>

                <div className="col-span-12 md:col-span-4">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Active</label>
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
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Session</label>
                  <div className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-slate-50 text-sm">
                    {session}
                  </div>
                </div>
              </div>
            )}

            {/* Items editor */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-bold">Bundle Items</div>
                  <div className="text-xs text-slate-500">Tip: POS will use Sale Price.</div>
                </div>

                <button
                  onClick={saveItems}
                  disabled={!activeId || savingItems}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingItems ? "Saving…" : "Save Items"}
                </button>
              </div>

              {!activeId ? (
                <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  Select a bundle to edit items.
                </div>
              ) : (active?.items || []).length === 0 ? (
                <div className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  No items yet — add from right side.
                </div>
              ) : (
                <div className="mt-4 border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="max-h-[56vh] overflow-y-auto">
                    {/* ✅ table-fixed to avoid horizontal scroll */}
                    <table className="w-full text-sm table-fixed">
                      <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold text-slate-800 w-[55%]">Item</th>
                          <th className="px-2 py-3 text-center font-bold text-slate-800 w-[10%]">Qty</th>
                          <th className="px-2 py-3 text-center font-bold text-slate-800 w-[12%]">MRP</th>
                          <th className="px-2 py-3 text-center font-bold text-slate-800 w-[12%]">Sale</th>
                          <th className="px-2 py-3 text-center font-bold text-slate-800 w-[8%]">Opt</th>
                          <th className="px-2 py-3 text-center font-bold text-slate-800 w-[3%]"> </th>
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
                              : it.product?.book?.class_name ||
                                it.product?.book?.code ||
                                it.product?.book?.subject ||
                                "";

                          return (
                            <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900 truncate">{title}</div>
                                {meta ? <div className="text-xs text-slate-500 mt-0.5 truncate">{meta}</div> : null}
                                <div className="text-[11px] text-slate-400 mt-1 truncate">
                                  product_id: <b>{it.product_id}</b>
                                </div>
                              </td>

                              <td className="px-2 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.qty}
                                  onChange={(e) =>
                                    updateItemLocal(it.id, { qty: Math.max(0, num(e.target.value)) })
                                  }
                                />
                              </td>

                              <td className="px-2 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.mrp}
                                  onChange={(e) =>
                                    updateItemLocal(it.id, { mrp: Math.max(0, num(e.target.value)) })
                                  }
                                />
                              </td>

                              <td className="px-2 py-3 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  className="w-full border border-slate-300 rounded-xl px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  value={it.sale_price}
                                  onChange={(e) =>
                                    updateItemLocal(it.id, { sale_price: Math.max(0, num(e.target.value)) })
                                  }
                                />
                              </td>

                              <td className="px-2 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => updateItemLocal(it.id, { is_optional: !it.is_optional })}
                                  className={`inline-flex items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold border transition w-full ${
                                    it.is_optional
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                                  }`}
                                >
                                  {it.is_optional ? "Yes" : "No"}
                                </button>
                              </td>

                              <td className="px-2 py-3 text-center">
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
            </div>
          </div>
        </section>

        {/* RIGHT: Picker */}
        <section className="col-span-12 lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold">Add Items</div>
                <div className="text-xs text-slate-500">First school books, then extras</div>
              </div>
              <button
                type="button"
                onClick={refreshAll}
                disabled={!schoolId || pickerLoading || avLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${pickerLoading || avLoading ? "animate-spin" : ""}`} />
                Reload
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPickerTab("SCHOOL_BOOKS")}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition ${
                  pickerTab === "SCHOOL_BOOKS"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <BookOpen className="w-4 h-4" />
                School Books
              </button>
              <button
                type="button"
                onClick={() => setPickerTab("ADD_PRODUCTS")}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition ${
                  pickerTab === "ADD_PRODUCTS"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Boxes className="w-4 h-4" />
                Extras
              </button>
            </div>

            {/* Ensure BOOK products banner */}
            {schoolId && pickerTab === "SCHOOL_BOOKS" && missingBookProductsCount > 0 && (
              <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
                <div className="font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {missingBookProductsCount} books have <b>No BOOK product</b>
                </div>
                <div className="mt-1 text-amber-900/90">
                  Click once to auto-create BOOK products (no manual entry).
                </div>
                <button
                  type="button"
                  onClick={ensureBookProductsNow}
                  disabled={ensuringBooks || pickerLoading}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 text-xs font-bold disabled:opacity-60"
                >
                  <ShieldCheck className={`w-4 h-4 ${ensuringBooks ? "animate-spin" : ""}`} />
                  {ensuringBooks ? "Ensuring…" : "Ensure Book Products"}
                </button>
              </div>
            )}

            {!schoolId ? (
              <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                Select school first.
              </div>
            ) : pickerTab === "SCHOOL_BOOKS" ? (
              <>
                {/* School availability controls */}
                <div className="mt-3 grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        className={`w-full border border-slate-300 rounded-xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                          avQ ? "pr-10" : "pr-4"
                        }`}
                        placeholder="Title / subject / code…"
                        value={avQ}
                        onChange={(e) => setAvQ(e.target.value)}
                      />
                      {avQ && (
                        <button
                          type="button"
                          onClick={() => setAvQ("")}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="col-span-5">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Class</label>
                    <select
                      className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      value={avClass}
                      onChange={(e) => setAvClass(e.target.value)}
                    >
                      {availabilityClassOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {avLoading ? (
                  <div className="mt-3 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : flattenedAvailability.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    No school books found in availability.
                    <div className="text-xs text-slate-500 mt-1">
                      Check: requirements for this school/session OR availability API returning data.
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="max-h-[70vh] overflow-y-auto">
                      <table className="w-full text-sm table-fixed">
                        <thead className="bg-slate-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-3 text-left font-bold text-slate-800 w-[85%]">Book</th>
                            <th className="px-2 py-3 text-center font-bold text-slate-800 w-[15%]">Add</th>
                          </tr>
                        </thead>

                        <tbody>
                          {flattenedAvailability.map((b) => {
                            const bookProd = bookProductByBookId.get(Number(b.book_id));
                            const already = (active?.items || []).some(
                              (it) => num(it.product_id) === num(bookProd?.id)
                            );
                            const canAdd = !!activeId && !!bookProd?.id && !already;

                            return (
                              <tr
                                key={`av:${b.book_id}`}
                                className="border-b border-slate-100 hover:bg-slate-50 transition"
                              >
                                <td className="px-3 py-3">
                                  <div className="font-bold text-slate-900 truncate">{b.title}</div>
                                </td>

                                <td className="px-2 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => addSchoolBookToKit(Number(b.book_id))}
                                    disabled={!canAdd}
                                    className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border transition ${
                                      !activeId
                                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                        : already
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 cursor-not-allowed"
                                        : !bookProd?.id
                                        ? "border-rose-200 bg-rose-50 text-rose-800 cursor-not-allowed"
                                        : "border-slate-300 bg-white hover:bg-slate-100 text-slate-800"
                                    }`}
                                    title={
                                      !activeId
                                        ? "Select bundle first"
                                        : already
                                        ? "Already added"
                                        : !bookProd?.id
                                        ? "No BOOK product"
                                        : "Add"
                                    }
                                  >
                                    {already ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
                  If you see “No BOOK product”, click <b>Ensure Book Products</b> once (auto).
                </div>
              </>
            ) : (
              <>
                {/* ✅ Extras: Manual add button + Search */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">Add manual items (bags, labels, stationery) also.</div>
                  <button
                    type="button"
                    onClick={() => {
                      setExtraErr(null);
                      setExtraCreateOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    New Extra
                  </button>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                      className={`w-full border border-slate-300 rounded-xl pl-10 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
                        pickerQ ? "pr-10" : "pr-4"
                      }`}
                      placeholder="Search direct purchased / manual items…"
                      value={pickerQ}
                      onChange={(e) => setPickerQ(e.target.value)}
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

                {pickerLoading ? (
                  <div className="mt-3 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : filteredProductRows.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    No extras found.
                    <div className="text-xs text-slate-500 mt-1">Add direct purchase receipts OR create manual extras.</div>
                  </div>
                ) : (
                  <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="max-h-[70vh] overflow-y-auto">
                      <table className="w-full text-sm table-fixed">
                        <thead className="bg-slate-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-3 text-left font-bold text-slate-800 w-[70%]">Item</th>
                            <th className="px-3 py-3 text-center font-bold text-slate-800 w-[30%]">Add</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProductRows.map((r) => {
                            const already = (active?.items || []).some((it) => num(it.product_id) === num(r.product_id));
                            const metaLine = [r.class_name, r.subject, r.code].filter(Boolean).join(" • ");

                            return (
                              <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50 transition">
                                <td className="px-3 py-3">
                                  <div className="font-bold text-slate-900 truncate">{r.title}</div>
                                  {metaLine ? (
                                    <div className="text-xs text-slate-500 mt-0.5 truncate">{metaLine}</div>
                                  ) : null}
                                  <div className="text-[11px] text-slate-400 mt-1 truncate">
                                    product_id: <b>{r.product_id}</b>
                                  </div>
                                </td>

                                <td className="px-3 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => addItemLocal(r.product_id)}
                                    disabled={!activeId || already}
                                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition border w-full ${
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
                  Extras shows <b>Direct Purchased</b> items + your <b>Manual Extras</b>.
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* =========================
          Bundles Drawer (small screens)
         ========================= */}
      {bundlesDrawerOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 lg:hidden">
          <div className="absolute inset-y-0 left-0 w-[92%] max-w-[420px] bg-white shadow-2xl border-r border-slate-200">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-bold text-sm">Select Bundle</div>
              <button
                onClick={() => setBundlesDrawerOpen(false)}
                className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <button
                onClick={loadBundles}
                disabled={!schoolId || loadingBundles}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${loadingBundles ? "animate-spin" : ""}`} />
                Reload Bundles
              </button>

              {!schoolId ? (
                <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  Select a school first.
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
                <div className="mt-3 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
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
                          <div className="font-bold text-sm truncate">{b.name || `Bundle #${b.id}`}</div>
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
                          Items: <b>{b.items?.length ?? 0}</b>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================
          Create Bundle Popup
         ========================= */}
      {createBundleOpen && (
        <div className="fixed inset-0 z-[85] bg-black/60">
          <div className="h-full w-full flex items-center justify-center p-3">
            <div className="w-full max-w-[820px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-emerald-50 flex items-center justify-between">
                <div className="text-sm font-bold">Create New Bundle</div>
                <button
                  onClick={() => setCreateBundleOpen(false)}
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                {!schoolId ? (
                  <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    Select school first.
                  </div>
                ) : (
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Bundle Name</label>
                      <input
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        placeholder="e.g., Class 5 Student Kit"
                        value={bundleName}
                        onChange={(e) => setBundleName(e.target.value)}
                      />
                    </div>

                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Class (preferred)</label>
                      <select
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        value={classId}
                        onChange={(e) => {
                          const v = Number(e.target.value) || "";
                          setClassId(v);
                          if (v) {
                            const cls = classes.find((c) => c.id === v);
                            setClassName(cls?.class_name || "");
                          }
                        }}
                      >
                        <option value="">Select Class</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.class_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-6">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Class Name (fallback)</label>
                      <input
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        placeholder="e.g., 5th / UKG / Nursery"
                        value={className}
                        onChange={(e) => {
                          setClassName(e.target.value);
                          setClassId("");
                        }}
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Sort Order</label>
                      <input
                        type="number"
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(num(e.target.value))}
                      />
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Active</label>
                      <select
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        value={isActive ? "1" : "0"}
                        onChange={(e) => setIsActive(e.target.value === "1")}
                      >
                        <option value="1">Active</option>
                        <option value="0">Disabled</option>
                      </select>
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Session</label>
                      <div className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-slate-50 text-sm">
                        {session}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t bg-white flex items-center justify-end gap-2">
                <button
                  onClick={() => setCreateBundleOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={createBundle}
                  disabled={!canCreateBundle}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  <PackagePlus className="w-4 h-4" />
                  {savingBundle ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          Manual Extra Item Modal
         ========================= */}
      {extraCreateOpen && (
        <div className="fixed inset-0 z-[90] bg-black/60">
          <div className="h-full w-full flex items-center justify-center p-3">
            <div className="w-full max-w-[720px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-emerald-50 flex items-center justify-between">
                <div className="text-sm font-bold">Add Manual Extra Item</div>
                <button
                  onClick={() => setExtraCreateOpen(false)}
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                {extraErr && (
                  <div className="mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    {extraErr}
                  </div>
                )}

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Item Name</label>
                    <input
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                      placeholder="e.g., School Bag / Label / Notebook Cover"
                      value={extraName}
                      onChange={(e) => setExtraName(e.target.value)}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-7">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">UOM (optional)</label>
                    <input
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                      placeholder="e.g., pcs / set / pack"
                      value={extraUom}
                      onChange={(e) => setExtraUom(e.target.value)}
                    />
                  </div>

                  <div className="col-span-12 md:col-span-5">
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">Active</label>
                    <select
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                      value={extraActive ? "1" : "0"}
                      onChange={(e) => setExtraActive(e.target.value === "1")}
                    >
                      <option value="1">Active</option>
                      <option value="0">Disabled</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-slate-500">
                  If a bundle is selected, item will be auto-added into kit.
                </div>
              </div>

              <div className="px-4 py-3 border-t bg-white flex items-center justify-end gap-2">
                <button
                  onClick={() => setExtraCreateOpen(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={createExtraProductNow}
                  disabled={extraSaving || !safeStr(extraName)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  <Plus className={`w-4 h-4 ${extraSaving ? "animate-spin" : ""}`} />
                  {extraSaving ? "Saving…" : "Create Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BundlesPageClient;
