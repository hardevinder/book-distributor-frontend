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
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  rate?: number | string | null;
  mrp?: number | string | null;
  selling_price?: number | string | null;
};

type ProductLite = {
  id: number;
  type: "BOOK" | "MATERIAL";
  book_id?: number | null;
  name?: string | null;
  uom?: string | null;
  is_active?: boolean;

  // ✅ NEW
  category_id?: number | null;
  category?: ProductCategoryLite | null;

  book?: BookLite | null;
  mrp?: number | string | null;
  selling_price?: number | string | null;
  rate?: number | string | null;
};


type ProductCategoryLite = {
  id: number;
  name: string;
};


type BundleItemRow = {
  id: number;
  bundle_id: number;
  product_id: number;
  qty: number;
  mrp: number; // kept for backend compatibility, but NOT shown in UI
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

const pickDefaultSalePrice = (p: ProductLite | null) => {
  if (!p) return 0;

  // ✅ We want RATE first (for books + materials)
  return (
    num((p as any).rate) ||
    num(p.book?.rate) ||
    num((p as any).selling_price) ||
    num(p.book?.selling_price) ||
    num((p as any).mrp) ||
    num(p.book?.mrp) ||
    0
  );
};

const pickDefaultMrp = (p: ProductLite | null) => {
  if (!p) return 0;
  return num(p.book?.mrp) || num((p as any).mrp) || 0;
};

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

const normalizeCategories = (payload: any): ProductCategoryLite[] => {
  if (Array.isArray(payload)) return payload as ProductCategoryLite[];
  if (payload && Array.isArray(payload.data)) return payload.data as ProductCategoryLite[];
  if (payload && Array.isArray(payload.rows)) return payload.rows as ProductCategoryLite[];
  if (payload && Array.isArray(payload.categories)) return payload.categories as ProductCategoryLite[];
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

  // ✅ Mobile bundle drawer
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

  // ✅ NEW: this is the WRAP/COLLAPSE for ALL editable boxes in middle section
  const [metaCollapsed, setMetaCollapsed] = useState(false);

  // ✅ Bundle list expand/collapse (wrap names)
  const [expandedBundles, setExpandedBundles] = useState<Record<number, boolean>>({});
  const toggleBundleExpand = (id: number) =>
    setExpandedBundles((prev) => ({ ...prev, [id]: !prev[id] }));

  // ✅ NEW: Collapse LEFT & RIGHT sidebars (desktop)
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

// ✅ Categories master
const [categories, setCategories] = useState<ProductCategoryLite[]>([]);
const [catLoading, setCatLoading] = useState(false);
const [catApiStatus, setCatApiStatus] = useState<"idle" | "ok" | "missing" | "error">("idle");

// ✅ Extra modal: selected category
const [extraCategoryId, setExtraCategoryId] = useState<number | "">("");


  const chip = (base: string) =>
    `inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none ${base}`;

  const selectedSchool = useMemo(() => {
    const idNum = Number(schoolId);
    return schools.find((s) => s.id === idNum);
  }, [schools, schoolId]);

  const activeClassLabel = useMemo(() => {
    if (!activeId) return "—";
    const fromMaster = classes.find((c) => Number(c.id) === Number(classId))?.class_name;
    return safeStr(fromMaster || className || active?.class?.class_name || active?.class_name) || "Class";
  }, [activeId, classes, classId, className, active]);

  const activeSessionLabel = useMemo(() => safeStr(active?.academic_session || session) || "-", [active, session]);
  const activeSortLabel = useMemo(() => String(num(sortOrder)), [sortOrder]);
  const activeStatusLabel = useMemo(() => (isActive ? "Active" : "Disabled"), [isActive]);

  /* ---------------- Load masters ---------------- */

  const loadCategories = async () => {
  setCatLoading(true);
  setCatApiStatus("idle");

  const endpointsToTry = [
    "/api/product-categories",
    "/api/products/categories",
    "/api/categories/products",
  ];

  try {
    for (const url of endpointsToTry) {
      try {
        const res = await api.get(url);
        const arr = normalizeCategories(res?.data);
        if (arr.length) {
          setCategories(arr.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name))));
          setCatApiStatus("ok");
          return;
        }
      } catch (e: any) {
        // try next
      }
    }

    setCategories([]);
    setCatApiStatus("missing");
  } catch (e) {
    setCategories([]);
    setCatApiStatus("error");
  } finally {
    setCatLoading(false);
  }
};


  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, cRes] = await Promise.all([api.get("/api/schools"), api.get("/api/classes")]);
        setSchools(normalizeSchools(sRes?.data));
        setClasses(
          normalizeClasses(cRes?.data).sort(
            (a, b) => num(a.sort_order) - num(b.sort_order) || safeStr(a.class_name).localeCompare(safeStr(b.class_name))
          )
        );
        await loadCategories(); // ✅ NEW
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

      // auto expand selected bundle card (nice UX)
      if (row?.id) setExpandedBundles((prev) => ({ ...prev, [row.id]: true }));
    } catch (err: any) {
      console.error("Failed to load bundle", err);
      setError(err?.response?.data?.message || "Failed to load bundle.");
    }
  };

  /* ---------------- Load Products ---------------- */

  const loadProducts = async (opts?: { ensure_books?: boolean; section?: "books" | "extras" }) => {
    if (!schoolId) return;

    setPickerLoading(true);
    setProductsApiStatus("idle");

    try {
      const section: "books" | "extras" = opts?.section ?? (pickerTab === "ADD_PRODUCTS" ? "extras" : "books");

      const pRes = await api.get("/api/products", {
        params: {
          section,
          school_id: Number(schoolId),
          academic_session: session || undefined,
          is_active: 1,
          include_book: 1,
           include_category: 1, // ✅ NEW
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
      setMetaCollapsed(false);

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
    setMetaCollapsed(false);


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

      const catName = safeStr(p.category?.name);

        return {
          key: `p:${p.id}`,
          type: p.type,
          product_id: p.id,
          title,
          subject,
          code,
          class_name: cls,

          category: catName, // ✅ ADD
        };

    });

    if (pickerTab !== "ADD_PRODUCTS") {
      if (pickerType !== "ALL") rows = rows.filter((r) => r.type === pickerType);
    }

    if (!q) return rows.slice(0, 140);

    return rows
      .filter((r) => `${r.title} ${r.subject} ${r.code} ${r.class_name} ${r.category}`.toLowerCase().includes(q))
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
      setMetaCollapsed(false);

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

  const addItemLocal = (
    product_id: number,
    defaults?: Partial<Pick<BundleItemRow, "qty" | "sale_price" | "mrp">>
  ) => {
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

    const dQty = Math.max(0, num(defaults?.qty ?? 1));
    const dSale = Math.max(0, num(defaults?.sale_price ?? pickDefaultSalePrice(prod)));
    const dMrp = Math.max(0, num(defaults?.mrp ?? pickDefaultMrp(prod)));

    const row: BundleItemRow = {
      id: tempId,
      bundle_id: activeId,
      product_id,
      qty: dQty,
      mrp: dMrp,
      sale_price: dSale,
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

    const avRow = flattenedAvailability.find((x) => Number(x.book_id) === Number(book_id));
    const kitType: "SCHOOL_BULK" | "STUDENT" = "SCHOOL_BULK";

    const defaultQty = kitType === "SCHOOL_BULK" ? Math.max(1, num(avRow?.required_qty || 0)) : 1;

    addItemLocal(p.id, { qty: defaultQty });
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
      await api.post(`/api/bundles/${activeId}/items`, {
        replace: true,
        items,
        use_defaults: true,
        overwrite_qty: true,
        overwrite_price: true,
        bundle_type: "SCHOOL_BULK",
        academic_session: session || undefined,
      });

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
    if (!extraCategoryId) {
      setExtraErr("Select category.");
      return;
    }


    setExtraErr(null);
    setSuccess(null);
    setError(null);

    try {
      setExtraSaving(true);

      const payload: any = {
        type: "MATERIAL",
        name: safeStr(extraName),
        uom: safeStr(extraUom) || "PCS",
        is_active: extraActive ? 1 : 0,

        category_id: Number(extraCategoryId), // ✅ NEW (required)
      };

      const res = await api.post("/api/products", payload);

      const created: any = res?.data?.data || null;
      if (!created?.id) {
        setExtraErr("Created but response missing product id.");
        return;
      }

    const pickedCat = categories.find((c) => Number(c.id) === Number(extraCategoryId)) || null;

const newProd: ProductLite = {
  id: Number(created.id),
  type: "MATERIAL",
  name: created.name ?? safeStr(extraName),
  uom: created.uom ?? (safeStr(extraUom) || "PCS"),
  is_active: created.is_active ?? (extraActive ? true : false),
        book_id: null,
        book: null,

        // ✅ NEW
        category_id: Number(extraCategoryId),
        category: pickedCat ? { id: pickedCat.id, name: pickedCat.name } : null,
      };


      setProducts((prev) => {
        const exists = prev.some((p) => Number(p.id) === Number(newProd.id));
        if (exists) return prev;
        return [newProd, ...prev];
      });

      if (activeId) addItemLocal(newProd.id);

      setExtraName("");
      setExtraUom("");
      setExtraActive(true);
      setExtraCategoryId(""); // ✅ ADD THIS
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
      {/* ✅ Top Bar */}
 <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
  {/* ✅ tighter padding */}
  <div className="px-2 sm:px-3 py-1.5">
    {/* ✅ ONE ROW ONLY (no wrap) */}
    <div className="flex items-center gap-1.5">
      {/* LEFT: back + icon + title */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition shrink-0"
          title="Back"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Desktop
        </Link>

        <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
          <Layers className="w-4 h-4" />
        </div>

        <div className="min-w-0">
          <div className="text-[12px] font-extrabold leading-none truncate">Bundles / Kits</div>
          <div className="text-[10px] text-slate-500 leading-none truncate">
            {selectedSchool?.name ? (
              <>
                <SchoolIcon className="inline w-3.5 h-3.5 mr-1" />
                {selectedSchool.name}
                {session ? ` • ${session}` : ""}
              </>
            ) : (
              <>Select school to manage kits</>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: controls (single line scroll on small screens) */}
      <div className="ml-auto min-w-0">
        <div
          className="flex items-center gap-1.5 justify-end overflow-x-auto whitespace-nowrap
                     [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* ✅ Desktop collapse controls */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setLeftCollapsed((v) => !v)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
              title={leftCollapsed ? "Expand Left" : "Collapse Left"}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftClose className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setRightCollapsed((v) => !v)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
              title={rightCollapsed ? "Expand Right" : "Collapse Right"}
            >
              {rightCollapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* School */}
          <div className="w-[185px] sm:w-[220px] shrink-0">
            <select
              className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]
                         focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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
          <div className="w-[108px] shrink-0">
            <select
              className="w-full border border-slate-300 rounded-lg px-2 py-1 bg-white text-[11px]
                         focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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

          {/* Mobile bundle selector */}
          <button
            type="button"
            onClick={() => setBundlesDrawerOpen(true)}
            className="lg:hidden inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-[11px] font-bold shrink-0"
            title="Select Bundle"
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="max-w-[120px] truncate">{activeBundleLabel}</span>
          </button>

          {/* ✅ Stats: only Products + (Missing if >0) */}
          <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-700 shrink-0">
            <span>
              Products: <b>{products.length}</b>
            </span>

            {missingBookProductsCount > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-amber-700">
                  Missing: <b>{missingBookProductsCount}</b>
                </span>
              </>
            )}
          </div>

          {/* New */}
          <button
            type="button"
            onClick={() => {
              setExtraErr(null);
              setExtraCategoryId("");
              setExtraCreateOpen(true);
            }}
            disabled={!schoolId}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 shrink-0"
          >
            <PackagePlus className="w-3.5 h-3.5" />
            New
          </button>

          {/* Refresh */}
          <button
            onClick={refreshAll}
            disabled={!schoolId || loadingBundles || pickerLoading || avLoading}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-[11px] font-bold
                       disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm shrink-0"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loadingBundles || pickerLoading || avLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <div className="hidden xl:block text-[11px] text-slate-600 pl-1 shrink-0">
            {user?.name || "User"}
          </div>
        </div>
      </div>
    </div>

    {/* ✅ Messages below (compact) */}
    {error && (
      <div className="mt-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{error}</span>
      </div>
    )}

    {success && (
      <div className="mt-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{success}</span>
      </div>
    )}

    {schoolId && productsApiStatus === "unauthorized" && (
      <div className="mt-1.5 text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">
          Products API is protected (401). Ensure frontend sends JWT Authorization header for <b>/api/products</b>.
        </span>
      </div>
    )}
  </div>
</header>



      {/* ✅ Layout updated: flex on desktop so sidebars can collapse */}
      <main className="p-2 sm:p-3 w-full max-w-none mx-auto">
        <div className="flex flex-col md:flex-row gap-3">
          {/* LEFT: Bundles list (desktop only) */}
          <section className={`hidden lg:block transition-all duration-200 ${leftCollapsed ? "lg:w-[76px]" : "lg:w-[340px]"}`}>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm h-full">
              {/* Left header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                {!leftCollapsed ? (
                  <div>
                    <div className="text-sm font-bold">Bundles</div>
                    <div className="text-xs text-slate-500">Expand to see details, click to select</div>
                  </div>
                ) : (
                  <div className="text-xs font-extrabold text-slate-700">B</div>
                )}

                <div className="flex items-center gap-2">
                  {!leftCollapsed && (
                    <button
                      onClick={loadBundles}
                      disabled={!schoolId || loadingBundles}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold disabled:opacity-50"
                      title="Reload"
                    >
                      <RefreshCcw className={`w-4 h-4 ${loadingBundles ? "animate-spin" : ""}`} />
                      Reload
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setLeftCollapsed((v) => !v)}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-100"
                    title={leftCollapsed ? "Expand" : "Collapse"}
                  >
                    {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Left body */}
              <div className={`p-4 ${leftCollapsed ? "p-3" : ""}`}>
                {!schoolId ? (
                  <div
                    className={`text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl ${
                      leftCollapsed ? "p-3 text-center text-xs" : "p-4"
                    }`}
                  >
                    {leftCollapsed ? "Select" : "Select a school."}
                  </div>
                ) : loadingBundles ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : bundles.length === 0 ? (
                  <div
                    className={`text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl ${
                      leftCollapsed ? "p-3 text-center text-xs" : "p-4"
                    }`}
                  >
                    {leftCollapsed ? "Empty" : "No bundles yet."}
                  </div>
                ) : leftCollapsed ? (
                  <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
                    {bundles.map((b) => {
                      const isSel = b.id === activeId;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => loadBundleById(b.id)}
                          className={`w-full rounded-xl border px-1.5 py-1 text-left transition ${
                            isSel ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                          title={b.name || `Bundle #${b.id}`}
                        >
                          <div className="text-[11px] font-extrabold text-slate-800 truncate">#{b.id}</div>
                          <div className="text-[10px] text-slate-500 truncate">{b.class?.class_name || b.class_name || "Class"}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
                    {bundles.map((b) => {
                      const isSel = b.id === activeId;
                      const isOpen = !!expandedBundles[b.id];

                      return (
                        <div
                          key={b.id}
                          className={`border rounded-2xl transition ${
                            isSel ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          {/* Header row: select + expand */}
                          <div className="flex items-start gap-2 px-3 py-3">
                            <button
                              type="button"
                              onClick={() => loadBundleById(b.id)}
                              className="flex-1 text-left min-w-0"
                              title="Select bundle"
                            >
                              <div className="font-extrabold text-sm text-slate-900 leading-snug whitespace-normal break-words">
                                {b.name || `Bundle #${b.id}`}
                              </div>

                              <div className="mt-1 text-[11px] text-slate-600 truncate">
                                {b.class?.class_name || b.class_name || (b.class_id ? `Class #${b.class_id}` : "Class")}
                                {" • "}
                                {b.academic_session || session}
                              </div>
                            </button>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span
                                className={`text-[11px] px-2 py-1 rounded-full border ${
                                  b.is_active
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : "bg-slate-100 border-slate-200 text-slate-700"
                                }`}
                              >
                                {b.is_active ? "Active" : "Disabled"}
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleBundleExpand(b.id)}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                                title={isOpen ? "Collapse" : "Expand"}
                              >
                                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expand body */}
                          {isOpen && (
                            <div className="px-3 pb-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[11px] text-slate-500">Items</div>
                                  <div className="text-sm font-bold text-slate-900">{b.items?.length ?? 0}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[11px] text-slate-500">Sort</div>
                                  <div className="text-sm font-bold text-slate-900">{num(b.sort_order)}</div>
                                </div>
                              </div>

                              <div className="mt-2 text-[11px] text-slate-500">Tip: click name to select, arrow to collapse.</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

       {/* MIDDLE: Bundle editor */}
<section className="flex-1 min-w-0">
  <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm">
    {/* ✅ Ultra compact header: Title + one-row chips */}
    <div className="flex items-start gap-2">
      {/* LEFT */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-extrabold truncate min-w-0">
            {activeId ? bundleName || `Bundle #${activeId}` : "No Bundle Selected"}
          </div>

          {activeId && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                isActive
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-slate-100 border-slate-200 text-slate-700"
              }`}
              title="Status"
            >
              {isActive ? "Active" : "Disabled"}
            </span>
          )}
        </div>

        {/* ✅ ONE ROW ONLY: compact chips */}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap sm:flex-nowrap min-w-0 overflow-hidden">
          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none bg-white border-slate-200 text-slate-700`}
            title="Class"
          >
            <span className="text-slate-500">Class:</span>
            <span className="font-semibold truncate max-w-[160px] sm:max-w-[220px]">
              {activeClassLabel}
            </span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none bg-white border-slate-200 text-slate-700`}
            title="Session"
          >
            <span className="text-slate-500">Sess:</span>
            <span className="font-semibold">{activeSessionLabel}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none bg-white border-slate-200 text-slate-700`}
            title="Sort order"
          >
            <span className="text-slate-500">Sort:</span>
            <span className="font-semibold tabular-nums">{activeSortLabel}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] leading-none bg-slate-50 border-slate-200 text-slate-700`}
            title="Bundle ID"
          >
            <span className="text-slate-500">ID:</span>
            <span className="font-semibold tabular-nums">{activeId ?? "-"}</span>
          </span>

          {/* ✅ WRAP button: collapses ALL editable boxes */}
          {activeId && (
            <button
              type="button"
              onClick={() => setMetaCollapsed((v) => !v)}
              className={`ml-auto inline-flex items-center justify-center h-7 w-7 rounded-lg border bg-white hover:bg-slate-100 ${
                metaCollapsed ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-300"
              }`}
              title={metaCollapsed ? "Expand details" : "Collapse details"}
            >
              {metaCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* RIGHT actions (tiny) */}
      {activeId ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={saveBundle}
            disabled={!canSaveBundle}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            title={savingBundle ? "Saving…" : "Save Bundle"}
          >
            <Save className="w-4 h-4" />
          </button>

          <button
            onClick={deleteBundle}
            disabled={!activeId}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 disabled:opacity-50"
            title="Delete Bundle"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>

    {/* ✅ Bundle details area (collapsible via metaCollapsed only) */}
    {!schoolId ? (
      <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
        Select school to start.
      </div>
    ) : !activeId ? (
      <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
        No bundle selected. Use <b>New</b> button on top OR select bundle from menu.
      </div>
    ) : metaCollapsed ? (
      <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        Details collapsed. Items remain visible below.
      </div>
    ) : (
      <div className="mt-2 grid grid-cols-12 gap-2">
        <div className="col-span-12">
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Bundle Name</label>
          <input
            className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            placeholder="e.g., Class 5 Student Kit"
            value={bundleName}
            onChange={(e) => setBundleName(e.target.value)}
            disabled={!schoolId}
          />
        </div>

        <div className="col-span-12 md:col-span-6">
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Class (preferred)</label>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Class Name (fallback)</label>
          <input
            className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Sort Order</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            value={sortOrder}
            onChange={(e) => setSortOrder(num(e.target.value))}
            disabled={!schoolId}
          />
        </div>

        <div className="col-span-12 md:col-span-4">
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Active</label>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            value={isActive ? "1" : "0"}
            onChange={(e) => setIsActive(e.target.value === "1")}
            disabled={!schoolId}
          >
            <option value="1">Active</option>
            <option value="0">Disabled</option>
          </select>
        </div>

        <div className="col-span-12 md:col-span-4">
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Session</label>
          <div className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-slate-50 text-sm">
            {session}
          </div>
        </div>
      </div>
    )}

    {/* ✅ Items editor (ALWAYS visible; no editorCollapsed) */}
  
<div className="mt-4 border-t border-slate-100 pt-4">
  <div className="flex items-center justify-between gap-2">
    <div>
      <div className="text-base font-bold">Bundle Items</div>
      <div className="text-xs text-slate-500">POS will use <b>Sale Price</b> only.</div>
    </div>

    <button
      onClick={saveItems}
      disabled={!activeId || savingItems}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-extrabold disabled:opacity-50"
      title={savingItems ? "Saving…" : "Save Items"}
    >
      <Save className="w-4 h-4" />
      {savingItems ? "Saving…" : "Save Items"}
    </button>
  </div>

  {!activeId ? (
    <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
      Select a bundle to edit items.
    </div>
  ) : (active?.items || []).length === 0 ? (
    <div className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4">
      No items yet — add from right side.
    </div>
  ) : (
    <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden bg-white">
      {/* ✅ BOTH scrolls */}
      <div className="max-h-[70vh] overflow-auto">
        {/* min width so columns don’t wrap too much */}
        <table className="min-w-[980px] w-full text-[11px] leading-none table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-slate-100">
            <tr>
              {/* ✅ Sticky first column */}
              <th
                className="sticky left-0 z-30 bg-slate-100 border-b border-slate-200 px-1.5 py-1 text-left font-extrabold text-slate-800 w-[520px]"
              >
                Item
              </th>

              <th className="border-b border-slate-200 px-1.5 py-1 text-center font-extrabold text-slate-800 w-[90px]">
                Qty
              </th>

              <th className="border-b border-slate-200 px-1.5 py-1 text-center font-extrabold text-slate-800 w-[130px]">
                Sale
              </th>

              <th className="border-b border-slate-200 px-1.5 py-1 text-center font-extrabold text-slate-800 w-[90px]">
                Opt
              </th>

              <th className="border-b border-slate-200 px-1.5 py-1 text-center font-extrabold text-slate-800 w-[80px]">
                Sort
              </th>

              <th className="border-b border-slate-200 px-1.5 py-1 text-center font-extrabold text-slate-800 w-[60px]">
                Del
              </th>
            </tr>
          </thead>

          <tbody className="[&>tr:nth-child(even)]:bg-slate-50/40">
            {activeItems.map((it) => {
              const title =
                it.product?.type === "MATERIAL"
                  ? it.product?.name || `Material #${it.product_id}`
                  : it.product?.book?.title || it.product?.name || `Product #${it.product_id}`;

              const meta =
                it.product?.type === "MATERIAL"
                  ? `MATERIAL${it.product?.uom ? ` • ${it.product.uom}` : ""}`
                  : [
                      it.product?.book?.class_name,
                      it.product?.book?.subject,
                      it.product?.book?.code,
                    ]
                      .filter(Boolean)
                      .join(" • ");

              return (
                <tr key={it.id} className="h-7 border-b border-slate-100 hover:bg-slate-100/60">
                  {/* ✅ Sticky first column */}
                  <td className="sticky left-0 z-10 bg-inherit border-b border-slate-100 px-1.5 py-0.5">
                  <div
                    className="font-bold text-slate-900 truncate leading-tight"
                    title={title}
                  >
                    {title}
                  </div>
                </td>


                  {/* Qty */}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="w-full h-7 border border-slate-300 rounded-lg px-2 text-[12px] text-center tabular-nums
                                 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={it.qty}
                      onChange={(e) => updateItemLocal(it.id, { qty: Math.max(0, num(e.target.value)) })}
                    />
                  </td>

                  {/* Sale Price */}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="w-full h-7 border border-slate-300 rounded-lg px-2 text-[12px] text-center tabular-nums
                                 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={it.sale_price}
                      onChange={(e) => updateItemLocal(it.id, { sale_price: Math.max(0, num(e.target.value)) })}
                    />
                  </td>

                  {/* Optional */}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => updateItemLocal(it.id, { is_optional: !it.is_optional })}
                      className={`w-full h-7 rounded-lg border text-[11px] font-extrabold transition
                        ${
                          it.is_optional
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      title="Optional?"
                    >
                      {it.is_optional ? "YES" : "NO"}
                    </button>
                  </td>

                  {/* Sort */}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="w-full h-7 border border-slate-300 rounded-lg px-2 text-[12px] text-center tabular-nums
                                 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      value={it.sort_order}
                      onChange={(e) => updateItemLocal(it.id, { sort_order: Math.max(0, num(e.target.value)) })}
                      title="Sort order"
                    />
                  </td>

                  {/* Delete */}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="w-full h-7 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-100 transition"
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
          <section className={`transition-all duration-200 ${rightCollapsed ? "lg:w-[76px]" : "lg:w-[360px]"}`}>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm h-full overflow-hidden">
              {/* Right header */}
              <div className="p-2 border-b border-slate-100 flex items-center justify-between gap-2">
                {!rightCollapsed ? (
                  <div>
                    <div className="text-[13px] font-bold leading-tight">Add Items</div>
                    <div className="text-[11px] leading-tight text-slate-500">First school books, then extras</div>

                  </div>
                ) : (
                  <div className="text-xs font-extrabold text-slate-700">+</div>
                )}

                <div className="flex items-center gap-2">
                  {!rightCollapsed && (
                    <button
                      type="button"
                      onClick={refreshAll}
                      disabled={!schoolId || pickerLoading || avLoading}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1 text-[11px] font-bold disabled:opacity-50"
                      title="Reload"
                    >
                      <RefreshCcw className={`w-2 h-2 ${pickerLoading || avLoading ? "animate-spin" : ""}`} />
                      Reload
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setRightCollapsed((v) => !v)}
                    className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                    title={rightCollapsed ? "Expand" : "Collapse"}
                  >
                    {rightCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Right body */}
              {rightCollapsed ? (
                <div className="p-3 hidden lg:block">
                  <button
                    type="button"
                    onClick={() => setRightCollapsed(false)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-bold"
                    title="Expand Add Items"
                  >
                    <Plus className="w-4 h-4" />
                    Expand
                  </button>

                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRightCollapsed(false);
                        setPickerTab("SCHOOL_BOOKS");
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Books
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRightCollapsed(false);
                        setPickerTab("ADD_PRODUCTS");
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-bold"
                    >
                      <Boxes className="w-4 h-4" />
                      Extras
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2">
                  {/* (your right picker UI kept same) */}
                  <div className="grid grid-cols-2 gap-2">
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
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold border transition ${
                        pickerTab === "ADD_PRODUCTS"
                          ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Boxes className="w-4 h-4" />
                      Extras
                    </button>
                  </div>

                  {schoolId && pickerTab === "SCHOOL_BOOKS" && missingBookProductsCount > 0 && (
                    <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
                      <div className="font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {missingBookProductsCount} books have <b>No BOOK product</b>
                      </div>
                      <div className="mt-1 text-amber-900/90">Click once to auto-create BOOK products (no manual entry).</div>
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
                    <div className="mt-2 text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl p-4">
                      Select school first.
                    </div>
                  ) : pickerTab === "SCHOOL_BOOKS" ? (
                    <>
                      <div className="mt-2 grid grid-cols-12 gap-1">
                        <div className="col-span-7">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Search</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                            <input
                              className={`w-full border border-slate-300 rounded-xl pl-9 py-1.5 text-[11px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
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
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Class</label>
                          <select
                            className="w-full border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-[12px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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
                          <div className="max-h-[78vh] overflow-y-auto">
                            <table className="w-full text-[12px] leading-none table-fixed">
                              <thead className="bg-slate-100 sticky top-0 z-10">
                                <tr>
                                  <th className="px-2 py-1 text-left text-xs font-bold text-slate-800 w-[85%]">Book</th>
                                  <th className="px-2 py-1 text-center text-xs font-bold text-slate-800 w-[15%]">Add</th>

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
                                    <tr key={`av:${b.book_id}`} className="h-7 border-b border-slate-100 hover:bg-slate-50 transition">
                                   <td className="px-2 py-0.5">
                                      <div className="font-semibold text-[11px] leading-tight text-slate-900 truncate">{b.title}</div>
                                    </td>


                                      <td className="px-2 py-0 text-center">
                                        <button
                                          type="button"
                                          onClick={() => addSchoolBookToKit(Number(b.book_id))}
                                          disabled={!canAdd}
                                        className={`inline-flex items-center justify-center w-3 h-3 rounded-lg transition ${
                                          !activeId
                                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                            : already
                                            ? "bg-emerald-50 text-emerald-700 cursor-not-allowed"
                                            : !bookProd?.id
                                            ? "bg-rose-50 text-rose-700 cursor-not-allowed"
                                            : "bg-transparent hover:bg-slate-100 text-slate-800"
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
                                          {already ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-4 h-4" />}
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
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Search</label>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-400" />
                          <input
                            className={`w-full border border-slate-300 rounded-xl pl-9 py-1.5 text-[12px] bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
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
                              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 transition"
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
                          <div className="max-h-[78vh] overflow-y-auto">
                            <table className="w-full text-[12px] leading-none table-fixed">
                              <thead className="bg-slate-100 sticky top-0 z-10">
                                <tr>
                                 <th className="px-2 py-1 text-left text-xs font-bold text-slate-800 w-[70%]">Item</th>
                                  <th className="px-2 py-1 text-center text-xs font-bold text-slate-800 w-[30%]">Add</th>

                                </tr>
                              </thead>
                              <tbody>
                                {filteredProductRows.map((r) => {
                                  const already = (active?.items || []).some((it) => num(it.product_id) === num(r.product_id));
                                  const metaLine = [r.class_name, r.subject, r.code].filter(Boolean).join(" • ");

                                  return (
                                    <tr key={r.key} className="h-7 border-b border-slate-100 hover:bg-slate-50 transition">
                                     <td className="px-2 py-0.5">
                                        <div className="font-semibold text-[11px] leading-snug text-slate-900 truncate">{r.title}</div>
                                        {r.category && (
                                          <div className="text-[10px] leading-tight text-slate-500 truncate">{r.category}</div>
                                        )}
                                      </td>



                                      <td className="px-2 py-1 text-center">
                                        <button
                                          type="button"
                                          onClick={() => addItemLocal(r.product_id)}
                                          disabled={!activeId || already}
                                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-2 py-0.5 text-[11px] leading-none font-semibold transition border ${
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
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Bundles Drawer (small screens) */}
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
                    const isOpen = !!expandedBundles[b.id];

                    return (
                      <div
                        key={b.id}
                        className={`border rounded-2xl transition ${
                          isSel ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2 px-3 py-3">
                          <button type="button" onClick={() => loadBundleById(b.id)} className="flex-1 text-left min-w-0">
                            <div className="font-extrabold text-sm leading-snug whitespace-normal break-words">
                              {b.name || `Bundle #${b.id}`}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-600 truncate">
                              {b.class?.class_name || b.class_name || (b.class_id ? `Class #${b.class_id}` : "Class")}
                              {" • "}
                              {b.academic_session || session}
                            </div>
                          </button>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`text-[11px] px-2 py-1 rounded-full border ${
                                b.is_active
                                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                  : "bg-slate-100 border-slate-200 text-slate-700"
                              }`}
                            >
                              {b.is_active ? "Active" : "Disabled"}
                            </span>

                            <button
                              type="button"
                              onClick={() => toggleBundleExpand(b.id)}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 transition"
                            >
                              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="px-3 pb-3">
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="text-[11px] text-slate-500">Items</div>
                              <div className="text-sm font-bold text-slate-900">{b.items?.length ?? 0}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Bundle Popup */}
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
                      <div className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-slate-50 text-sm">{session}</div>
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

      {/* Manual Extra Item Modal */}
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

                  {/* ✅ Category (required) */}
                    <div className="col-span-12 md:col-span-5">
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        Category <span className="text-rose-600">*</span>
                      </label>

                      <select
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 bg-white text-sm
                                  focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                        value={extraCategoryId}
                        onChange={(e) => setExtraCategoryId(Number(e.target.value) || "")}
                        disabled={catLoading || catApiStatus !== "ok"}
                      >
                        <option value="">
                          {catLoading
                            ? "Loading categories…"
                            : catApiStatus === "ok"
                            ? "Select Category"
                            : "Categories API missing"}
                        </option>

                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      {catApiStatus !== "ok" && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Categories not available. Check backend route: <b>/api/product-categories</b>
                        </div>
                      )}
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
                  disabled={extraSaving || !safeStr(extraName) || !extraCategoryId}

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
