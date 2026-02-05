"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import SalesSummaryPanel from "@/components/SalesSummaryPanel";

import {
  Search,
  RefreshCcw,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Receipt,
  X,
  Minus,
  Plus,
  School as SchoolIcon,
  User,
  IndianRupee,
  Layers,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
  Phone,
  Users,
  BadgeInfo,
  BarChart3,
  ChevronDown,
  ChevronUp,
  KeyRound,
  LogOut,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

/* ================= Types ================= */

type School = { id: number; name: string };
type ClassItem = { id: number; class_name: string; sort_order?: number; is_active?: boolean };

type BundleLite = { id: number; status?: string | null; school_id?: number; class_id?: number };

type BundleItemApi = {
  id: number;
  product_id: number;
  qty: number;

  product?: {
    id: number;
    type?: "BOOK" | "MATERIAL" | string;
    name?: string | null;
    title?: string | null;
    rate?: number | string | null;
    selling_price?: number | string | null;
    mrp?: number | string | null;

    book?: {
      id: number;
      title?: string | null;
      class_name?: string | null;
    } | null;
  } | null;

  sale_price?: number | string | null;
  selling_price?: number | string | null;
  unit_price?: number | string | null;
  rate?: number | string | null;
  mrp?: number | string | null;
};

type BundleFull = {
  id: number;
  status?: string | null;
  school_id?: number | null;
  class_id?: number | null;
  academic_session?: string | null;
  items?: BundleItemApi[];
  school?: { id: number; name: string } | null;
  class?: { id: number; class_name: string } | null;
};

type CartLine = {
  key: string;
  product_id: number;
  kind: "BOOK" | "MATERIAL";
  title: string;
  class_name?: string | null;
  qty: number;
  unit_price: number;
  include: boolean;
  book_id?: number | null;
};

/* ================= Helpers ================= */

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: any) => Math.round(num(v) * 100) / 100;
const money = (v: any) => round2(v).toFixed(2);

function normalizeArray<T>(resData: any): T[] {
  if (Array.isArray(resData?.data)) return resData.data as T[];
  if (Array.isArray(resData?.rows)) return resData.rows as T[];
  if (Array.isArray(resData)) return resData as T[];
  if (Array.isArray(resData?.data?.rows)) return resData.data.rows as T[];
  if (Array.isArray(resData?.data?.data)) return resData.data.data as T[];
  return [];
}

function normalizeObject<T>(resData: any): T | null {
  if (!resData) return null;
  if (resData?.data && typeof resData.data === "object" && !Array.isArray(resData.data)) return resData.data as T;
  if (resData?.bundle && typeof resData.bundle === "object") return resData.bundle as T;
  if (typeof resData === "object") return resData as T;
  return null;
}

function pickTitle(it: BundleItemApi): {
  title: string;
  class_name?: string | null;
  book_id?: number | null;
  kind: "BOOK" | "MATERIAL";
} {
  const p = it.product || null;
  const kind = String(p?.type || "BOOK").toUpperCase() === "MATERIAL" ? "MATERIAL" : "BOOK";

  const book = p?.book || null;
  const title =
    String(book?.title || "").trim() ||
    String(p?.name || "").trim() ||
    String(p?.title || "").trim() ||
    (kind === "BOOK" ? "Book" : "Item");

  const class_name = (book?.class_name || null) ?? null;
  const book_id = book?.id ? num(book.id) : null;

  return { title, class_name, book_id, kind };
}

function resolveUnitPrice(it: BundleItemApi): number {
  const p = it.product || null;
  return (
    num(it.sale_price) ||
    num(it.selling_price) ||
    num(it.unit_price) ||
    num(it.rate) ||
    num(it.mrp) ||
    num(p?.selling_price) ||
    num(p?.rate) ||
    num(p?.mrp) ||
    0
  );
}

function cmpClass(a: ClassItem, b: ClassItem) {
  const sa = num(a.sort_order);
  const sb = num(b.sort_order);
  if (sa !== sb) return sa - sb;

  const na = Number(String(a.class_name).replace(/[^\d]/g, ""));
  const nb = Number(String(b.class_name).replace(/[^\d]/g, ""));
  const fa = Number.isFinite(na) && na > 0;
  const fb = Number.isFinite(nb) && nb > 0;
  if (fa && fb && na !== nb) return na - nb;

  return String(a.class_name || "").localeCompare(String(b.class_name || ""), undefined, { numeric: true });
}

function pickBundleStatus(b: any): string | null {
  const s = String(b?.status ?? "").trim();
  return s ? s.toUpperCase() : null;
}

function hasRole(user: any, role: string) {
  const rs = user?.roles ?? user?.role ?? [];
  const arr = Array.isArray(rs) ? rs : [rs];
  return arr.map((x: any) => String(x).toUpperCase()).includes(String(role).toUpperCase());
}

/* ================= Component ================= */

export default function SalesPosPageClient() {
  // ✅ If your AuthContext already has logout(), we will use it. Otherwise we fallback to localStorage clear.
  const auth = useAuth() as any;
  const user = auth?.user;
  const token = auth?.token;
  const logoutFromContext = auth?.logout;

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [token]);

  const isDistributor = useMemo(() => hasRole(user, "DISTRIBUTOR"), [user]);

  // sidebar wrap (desktop) + drawer (mobile)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // ✅ NEW: Summary wrap (more space for sale items)
  const [summaryCollapsed, setSummaryCollapsed] = useState<boolean>(true);

  // ✅ Account menu
  const [accountOpen, setAccountOpen] = useState(false);

  // ✅ Change password modal
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdShowOld, setPwdShowOld] = useState(false);
  const [pwdShowNew, setPwdShowNew] = useState(false);
  const [pwdShowConfirm, setPwdShowConfirm] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [pwdOk, setPwdOk] = useState<string | null>(null);

  // Customer selection
  const [soldToType, setSoldToType] = useState<"SCHOOL" | "WALKIN">("SCHOOL");

  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [schoolQuery, setSchoolQuery] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Bundle/cart
  const [loading, setLoading] = useState(false);
  const [bundleId, setBundleId] = useState<number | null>(null);
  const [bundleStatus, setBundleStatus] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  // Payment
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT">("CASH");

  // Student name always (default)
  const [billToName, setBillToName] = useState<string>("Student");

  // Credit-only fields (popup)
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [parentName, setParentName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [referenceBy, setReferenceBy] = useState<string>("");
  const [referencePhone, setReferencePhone] = useState<string>("");

  // Paid / Given / Return
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [givenAmount, setGivenAmount] = useState<number>(0);

  const [notes, setNotes] = useState<string>("");

  // UI feedback
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // receipt
  const lastSaleIdRef = useRef<number | null>(null);

  // auto-load guards
  const autoLoadTimerRef = useRef<any>(null);
  const lastAutoKeyRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // close account menu on outside click / ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const compactSelect =
    "w-full rounded-lg border bg-white px-2 py-1.5 text-[12px] font-semibold leading-5 outline-none focus:ring-2 focus:ring-slate-200";
  const compactInput = "w-full rounded-lg border px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-slate-200";

  const compactBtn = "h-7 w-7 rounded-md border bg-white inline-flex items-center justify-center active:scale-[0.98]";
  const compactNumInput =
    "h-7 w-16 rounded-md border px-1 text-[12px] font-bold text-center outline-none focus:ring-2 focus:ring-slate-200";
  const compactPriceInput =
    "h-7 w-20 rounded-md border px-1 text-[12px] font-bold text-right outline-none focus:ring-2 focus:ring-slate-200";

  const clearBundleAndCart = () => {
    setCart([]);
    setBundleId(null);
    setBundleStatus(null);
    setPaidAmount(0);
    setGivenAmount(0);
    lastSaleIdRef.current = null;
  };

  /* ================= Auth actions ================= */

  const doLogout = async () => {
    try {
      setErrMsg(null);
      setOkMsg(null);

      // optional backend logout (does nothing except OK message)
      try {
        await api.post("/api/auth/logout", {}, { headers: authHeaders });
      } catch {}

      // If your AuthContext has logout() use it; else fallback
      if (typeof logoutFromContext === "function") {
        await logoutFromContext();
      } else {
        // common fallbacks
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        } catch {}
        window.location.href = "/login";
      }
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Logout failed");
    } finally {
      setAccountOpen(false);
    }
  };

  const openChangePassword = () => {
    setPwdErr(null);
    setPwdOk(null);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwdShowOld(false);
    setPwdShowNew(false);
    setPwdShowConfirm(false);
    setPwdModalOpen(true);
    setAccountOpen(false);
  };

  const canSavePassword = useMemo(() => {
    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) return false;
    if (newPassword.trim().length < 6) return false;
    if (newPassword.trim() !== confirmPassword.trim()) return false;
    return true;
  }, [oldPassword, newPassword, confirmPassword]);

  const savePassword = async () => {
    setPwdErr(null);
    setPwdOk(null);

    if (!canSavePassword) {
      if (newPassword.trim() !== confirmPassword.trim()) setPwdErr("New password and confirm password must match.");
      else if (newPassword.trim().length < 6) setPwdErr("Password must be at least 6 characters.");
      else setPwdErr("Please fill all fields.");
      return;
    }

    setPwdLoading(true);
    try {
      await api.post(
        "/api/auth/change-password",
        {
          old_password: oldPassword.trim(),
          new_password: newPassword.trim(),
          confirm_password: confirmPassword.trim(),
        },
        { headers: authHeaders }
      );

      setPwdOk("Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // optional: auto close after success
      setTimeout(() => {
        setPwdModalOpen(false);
        setPwdOk(null);
      }, 700);
    } catch (e: any) {
      setPwdErr(e?.response?.data?.error || e?.response?.data?.message || e?.message || "Change password failed");
    } finally {
      setPwdLoading(false);
    }
  };

  /* ---------- Receipt ---------- */
  const openReceipt = async (saleId: number, size: "3in" | "a5") => {
    try {
      setErrMsg(null);
      const res = await api.get(`/api/sales/${saleId}/receipt?size=${size}`, {
        responseType: "blob",
        headers: authHeaders,
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) setErrMsg("Popup blocked. Please allow popups to print receipt.");
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Failed to open receipt");
    }
  };

  /* ---------- Load masters ---------- */
  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setErrMsg(null);

        const schoolsUrl = "/api/schools/my/schools";
        const [sRes, cRes] = await Promise.all([
          api.get(schoolsUrl, { headers: authHeaders }),
          api.get("/api/classes?limit=500", { headers: authHeaders }),
        ]);

        const sList = normalizeArray<School>(sRes.data)
          .filter((s) => num(s.id) > 0 && String(s.name || "").trim())
          .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));

        const cList = normalizeArray<ClassItem>(cRes.data)
          .filter((c) => num(c.id) > 0 && String(c.class_name || "").trim())
          .sort(cmpClass);

        setSchools(sList);
        setClasses(cList);

        setSelectedSchoolId((prev) => {
          const ok = prev && sList.some((x) => num(x.id) === num(prev));
          return ok ? prev : sList.length ? num(sList[0].id) : null;
        });

        setSelectedClassId((prev) => (prev ? prev : cList.length ? num(cList[0].id) : null));
      } catch (e: any) {
        setErrMsg(e?.response?.data?.message || e?.message || "Failed to load masters");
      }
    })();
  }, [token, authHeaders, isDistributor]);

  /* ---------- Derived ---------- */
  const filteredSchools = useMemo(() => {
    const q = schoolQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [schools, schoolQuery]);

  const selectedSchool = useMemo(
    () => schools.find((s) => num(s.id) === num(selectedSchoolId)) || null,
    [schools, selectedSchoolId]
  );

  const selectedClass = useMemo(
    () => classes.find((c) => num(c.id) === num(selectedClassId)) || null,
    [classes, selectedClassId]
  );

  const totals = useMemo(() => {
    const included = cart.filter((x) => x.include);
    const subtotal = included.reduce((s, x) => s + round2(x.qty * x.unit_price), 0);
    const total = round2(subtotal);

    const paid = round2(Math.min(total, Math.max(0, paidAmount)));
    const balance = round2(Math.max(0, total - paid));

    const canReturn = paymentMode === "CASH" || paymentMode === "UPI" || paymentMode === "CARD";
    const returnAmount = canReturn ? round2(Math.max(0, round2(givenAmount) - total)) : 0;

    return { subtotal: round2(subtotal), total, paid, balance, itemCount: included.length, returnAmount };
  }, [cart, paidAmount, givenAmount, paymentMode]);

  // When paymentMode changes, handle defaults + credit popup
  useEffect(() => {
    if (paymentMode === "CREDIT") {
      setPaidAmount(0);
      setGivenAmount(0);
      setCreditModalOpen(true);
      return;
    }

    // non-credit defaults
    setCreditModalOpen(false);
    setParentName("");
    setPhone("");
    setReferenceBy("");
    setReferencePhone("");

    setPaidAmount((prev) => (prev > 0 ? prev : totals.total));
    setGivenAmount((prev) => (prev > 0 ? prev : totals.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMode]);

  // When total changes, keep paid/given sane (unless CREDIT)
  useEffect(() => {
    if (paymentMode === "CREDIT") return;
    setPaidAmount((prev) => (prev > 0 ? Math.min(prev, totals.total) : totals.total));
    setGivenAmount((prev) => (prev > 0 ? prev : totals.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.total]);

  /* ---------- Cart operations ---------- */
  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const incQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: round2(x.qty + 1) } : x)));

  const decQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: Math.max(1, round2(x.qty - 1)) } : x)));

  /* ---------- Load bundle into cart ---------- */
  const loadBundleForSchoolClass = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);

    if (!silent) {
      setErrMsg(null);
      setOkMsg(null);
    }

    if (soldToType !== "SCHOOL") {
      if (!silent) setErrMsg("Select SCHOOL mode to load bundle items.");
      return;
    }
    if (!selectedSchoolId || !selectedClassId) {
      if (!silent) setErrMsg("Select School and Class first.");
      return;
    }

    try {
      abortRef.current?.abort();
    } catch {}
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const bRes = await api.get(`/api/bundles?school_id=${selectedSchoolId}&class_id=${selectedClassId}&limit=5`, {
        signal: controller.signal as any,
        headers: authHeaders,
      });
      const rows = normalizeArray<BundleLite>(bRes.data);

      if (!rows.length) {
        clearBundleAndCart();
        if (!silent) setErrMsg("No bundle found for this school/class.");
        return;
      }

      const preferred =
        rows.find((r) => ["ISSUED", "PARTIAL", "RESERVED"].includes(String(r.status || "").toUpperCase())) || rows[0];

      const id = num(preferred.id);
      if (!id) {
        clearBundleAndCart();
        if (!silent) setErrMsg("Invalid bundle id returned.");
        return;
      }

      const fullRes = await api.get(`/api/bundles/${id}`, {
        signal: controller.signal as any,
        headers: authHeaders,
      });

      const bundle = normalizeObject<BundleFull>(fullRes.data);
      const realBundle =
        bundle && (bundle as any)?.items !== undefined ? bundle : normalizeObject<BundleFull>(fullRes.data?.data);

      const b =
        realBundle ||
        (fullRes.data?.data as BundleFull) ||
        (fullRes.data?.bundle as BundleFull) ||
        (fullRes.data as BundleFull);

      const items = Array.isArray(b?.items) ? b.items : [];
      const fallbackClassName = b?.class?.class_name || selectedClass?.class_name || null;

      const lines: CartLine[] = items
        .map((it) => {
          const { title, class_name, book_id, kind } = pickTitle(it);
          const qty = 1;
          const unit_price = Math.max(0, round2(resolveUnitPrice(it)));
          const product_id = num(it.product_id || it.product?.id);
          const key = `${product_id}:${book_id || 0}:${title}`;

          return {
            key,
            product_id,
            kind,
            title,
            class_name: class_name || fallbackClassName,
            qty,
            unit_price,
            include: true,
            book_id: book_id || null,
          };
        })
        .filter((x) => x.product_id > 0);

      setBundleId(num(b?.id) || id);
      setBundleStatus(pickBundleStatus(b) || String(preferred.status || "").toUpperCase() || null);
      setCart(lines);

      const autoTotal = lines.filter((x) => x.include).reduce((s, x) => s + round2(x.qty * x.unit_price), 0);

      if (paymentMode === "CREDIT") {
        setPaidAmount(0);
        setGivenAmount(0);
      } else {
        setPaidAmount(round2(autoTotal));
        setGivenAmount(round2(autoTotal));
      }

      setBillToName((prev) => (prev?.trim() ? prev : "Student"));

      if (!silent) {
        if (!lines.length) setErrMsg("Bundle loaded but items list is empty.");
        else setOkMsg(`Loaded bundle #${id}`);
      }
    } catch (e: any) {
      const msg =
        e?.name === "CanceledError" || e?.code === "ERR_CANCELED" ? null : e?.response?.data?.message || e?.message;
      if (msg && !silent) setErrMsg(msg || "Failed to load bundle");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Auto load (real-time) ---------- */
  useEffect(() => {
    if (autoLoadTimerRef.current) clearTimeout(autoLoadTimerRef.current);

    if (soldToType !== "SCHOOL") return;
    if (!selectedSchoolId || !selectedClassId) return;

    const key = `${selectedSchoolId}:${selectedClassId}`;
    if (lastAutoKeyRef.current === key && cart.length > 0) return;

    autoLoadTimerRef.current = setTimeout(async () => {
      lastAutoKeyRef.current = key;
      await loadBundleForSchoolClass({ silent: true });
    }, 250);

    return () => {
      if (autoLoadTimerRef.current) clearTimeout(autoLoadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soldToType, selectedSchoolId, selectedClassId]);

  /* ---------- Credit modal validation ---------- */
  const creditValid = useMemo(() => {
    if (paymentMode !== "CREDIT") return true;
    return Boolean(billToName.trim() && parentName.trim() && phone.trim());
  }, [paymentMode, billToName, parentName, phone]);

  const closeCreditModalIfOk = () => {
    if (paymentMode !== "CREDIT") {
      setCreditModalOpen(false);
      return;
    }
    if (!creditValid) {
      setErrMsg("For CREDIT sale: Student, Parent and Phone are required.");
      return;
    }
    setCreditModalOpen(false);
  };

  /* ---------- Submit sale ---------- */
  const submitSale = async (printSize: "3in" | "a5") => {
    setErrMsg(null);
    setOkMsg(null);

    const included = cart.filter((x) => x.include && x.qty > 0);
    if (!included.length) return setErrMsg("No items selected.");

    if (soldToType === "SCHOOL") {
      if (!selectedSchoolId) return setErrMsg("Select a school.");
      if (!selectedClassId) return setErrMsg("Select a class.");
    }

    if (!billToName.trim()) return setErrMsg("Student name is required.");

    if (paymentMode === "CREDIT") {
      if (!parentName.trim()) return setErrMsg("Parent name is required for CREDIT sale.");
      if (!phone.trim()) return setErrMsg("Phone is required for CREDIT sale.");
      if (!creditValid) return setErrMsg("Please fill Credit Details (Student/Parent/Phone).");
    }

    const paid = round2(Math.max(0, paidAmount));
    if (paid > totals.total + 0.0001) return setErrMsg("Paid amount cannot exceed total.");

    setLoading(true);
    try {
      const payload: any = {
        sold_to_type: soldToType,
        sold_to_id: soldToType === "SCHOOL" ? selectedSchoolId : null,
        bundle_id: bundleId,
        class_name: soldToType === "SCHOOL" ? (selectedClass?.class_name || null) : null,

        payment_mode: paymentMode,
        paid_amount: paid,

        bill_to_name: billToName.trim(),
        parent_name: paymentMode === "CREDIT" ? parentName.trim() : null,
        phone: paymentMode === "CREDIT" ? phone.trim() : null,
        reference_by: paymentMode === "CREDIT" ? (referenceBy.trim() || null) : null,
        reference_phone: paymentMode === "CREDIT" ? (referencePhone.trim() || null) : null,

        notes: notes || null,
        items: included.map((x) => ({
          product_id: x.product_id,
          qty: x.qty,
          unit_price: x.unit_price,
          include: x.include,
        })),
      };

      const res = await api.post("/api/sales", payload, { headers: authHeaders });
      const saleId = num(res.data?.sale_id);
      lastSaleIdRef.current = saleId;
      setOkMsg(res.data?.message || "Sale saved");
      if (saleId) await openReceipt(saleId, printSize);
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message || e?.message || "Sale failed");
    } finally {
      setLoading(false);
    }
  };

  const resetCart = () => {
    setSchoolQuery("");
    setNotes("");
    setOkMsg(null);
    setErrMsg(null);
    setBillToName("Student");
    setParentName("");
    setPhone("");
    setReferenceBy("");
    setReferencePhone("");
    setCreditModalOpen(false);
    clearBundleAndCart();
    lastAutoKeyRef.current = "";
  };

  /* ---------- Sidebar content (reuse for desktop + mobile drawer) ---------- */
  const SidebarContent = (
    <div className="h-full rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="p-2 border-b">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSoldToType("SCHOOL")}
            className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-extrabold ${
              soldToType === "SCHOOL" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
          >
            <SchoolIcon className="h-4 w-4" />
            School
          </button>

          <button
            type="button"
            onClick={() => {
              setSoldToType("WALKIN");
              setSelectedSchoolId(null);
              setSelectedClassId(null);
              resetCart();
              setMobileDrawerOpen(false);
            }}
            className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2 text-xs font-extrabold ${
              soldToType === "WALKIN" ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"
            }`}
          >
            <User className="h-4 w-4" />
            Walk-in
          </button>
        </div>

        {soldToType === "SCHOOL" && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Search className="h-3.5 w-3.5" /> School
              </div>
              <div className="text-[10px] text-slate-500">{schools.length}</div>
            </div>

            {!isDistributor && (
              <input
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Search…"
                className={compactInput}
              />
            )}

            <select
              value={selectedSchoolId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setSelectedSchoolId(id);
                clearBundleAndCart();
                setOkMsg(null);
                setErrMsg(null);
                lastAutoKeyRef.current = "";
              }}
              className={compactSelect}
              disabled={isDistributor && schools.length <= 1}
            >
              <option value="">{schools.length ? "Select school…" : "No assigned schools"}</option>
              {(isDistributor ? schools : filteredSchools).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-slate-600">Class</div>
              <div className="text-[10px] text-slate-500">{classes.length}</div>
            </div>

            <select
              value={selectedClassId ?? ""}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setSelectedClassId(id);
                clearBundleAndCart();
                setOkMsg(null);
                setErrMsg(null);
                lastAutoKeyRef.current = "";
              }}
              className={compactSelect}
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-2 py-2">
              <div className="text-[11px] text-slate-600">
                {selectedSchool && selectedClass ? (
                  <>
                    <span className="font-bold">{selectedSchool.name}</span>
                    <span className="mx-1">•</span>
                    <span className="font-bold">{selectedClass.class_name}</span>
                  </>
                ) : (
                  <span>Select school & class</span>
                )}
              </div>

              <div className="text-[11px] text-slate-600 flex items-center gap-2">
                {bundleId ? (
                  <>
                    <span className="font-extrabold">#{bundleId}</span>
                    {bundleStatus ? (
                      <span className="rounded-lg bg-white px-2 py-0.5 border text-[10px] font-bold">
                        {bundleStatus}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-slate-400">{loading ? "Loading…" : "—"}</span>
                )}
              </div>
            </div>

            <button
              type="button"
              disabled={loading || soldToType !== "SCHOOL" || !selectedSchoolId || !selectedClassId}
              onClick={() => {
                lastAutoKeyRef.current = "";
                loadBundleForSchoolClass({ silent: false });
                setMobileDrawerOpen(false);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-2 py-2 text-xs font-extrabold shadow-sm disabled:opacity-60 active:scale-[0.99]"
            >
              <Layers className="h-4 w-4" />
              Refresh Items
            </button>
          </div>
        )}

        {soldToType === "WALKIN" && (
          <div className="mt-2 rounded-xl border bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
            Walk-in mode (no bundle auto-load).
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {/* Bill To */}
        <div className="rounded-2xl border bg-white p-2">
          <div className="text-xs font-extrabold flex items-center gap-2">
            <BadgeInfo className="h-4 w-4" /> Bill To (Student)
          </div>
          <input
            value={billToName}
            onChange={(e) => setBillToName(e.target.value)}
            placeholder="Student name…"
            className="mt-2 w-full rounded-lg border px-2 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
          />
          <div className="mt-1 text-[10px] text-slate-500">
            Default is <span className="font-bold">Student</span>. Change if needed.
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-2xl border bg-white p-2">
          <div className="text-xs font-extrabold">Payment</div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)} className={compactSelect}>
              <option value="CASH">CASH</option>
              <option value="UPI">UPI</option>
              <option value="CARD">CARD</option>
              <option value="CREDIT">CREDIT (Udhaar)</option>
            </select>

            <div className="rounded-lg border px-2 py-1.5">
              <div className="text-[10px] font-bold text-slate-600">Paid (Recorded)</div>
              <div className="mt-1 flex items-center gap-1">
                <IndianRupee className="h-3.5 w-3.5 text-slate-500" />
                <input
                  inputMode="decimal"
                  value={String(paidAmount)}
                  onChange={(e) => setPaidAmount(Math.max(0, round2(e.target.value)))}
                  className="w-full rounded-md border px-2 py-1 text-[12px] font-bold outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
          </div>

          {paymentMode !== "CREDIT" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border px-2 py-1.5">
                <div className="text-[10px] font-bold text-slate-600">Given</div>
                <div className="mt-1 flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5 text-slate-500" />
                  <input
                    inputMode="decimal"
                    value={String(givenAmount)}
                    onChange={(e) => {
                      const v = Math.max(0, round2(e.target.value));
                      setGivenAmount(v);
                      setPaidAmount(round2(Math.min(v, totals.total)));
                    }}
                    className="w-full rounded-md border px-2 py-1 text-[12px] font-bold outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                <div className="text-[10px] font-bold text-slate-600">Return</div>
                <div className="mt-1 flex items-center gap-1">
                  <IndianRupee className="h-3.5 w-3.5 text-slate-500" />
                  <div className="text-[12px] font-black">{money(totals.returnAmount)}</div>
                </div>
              </div>
            </div>
          )}

          {paymentMode === "CREDIT" && (
            <button
              type="button"
              onClick={() => setCreditModalOpen(true)}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-2 py-2 text-xs font-extrabold shadow-sm active:scale-[0.99]"
            >
              <CreditCard className="h-4 w-4" />
              Credit Details (Required)
            </button>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes…"
            className="mt-2 w-full rounded-lg border p-2 text-[12px] outline-none focus:ring-2 focus:ring-slate-200"
            rows={2}
          />

          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Total</div>
              <div className="mt-1 font-extrabold">Rs. {money(totals.total)}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Paid</div>
              <div className="mt-1 font-extrabold">Rs. {money(totals.paid)}</div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Bal</div>
              <div className="mt-1 font-extrabold">Rs. {money(totals.balance)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 p-2 border-t text-[10px] text-slate-500">Auto-load on school/class change</div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-64px)] bg-slate-50 flex flex-col overflow-hidden">
      {/* ===================== Change Password Modal ===================== */}
      {pwdModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPwdModalOpen(false)} />
          <div className="relative w-full max-w-[520px] rounded-2xl border bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-extrabold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Change Password
              </div>
              <button
                type="button"
                className="rounded-xl border bg-white p-2"
                onClick={() => setPwdModalOpen(false)}
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              {(pwdErr || pwdOk) && (
                <div className="space-y-2">
                  {pwdErr && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                      {pwdErr}
                    </div>
                  )}
                  {pwdOk && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
                      {pwdOk}
                    </div>
                  )}
                </div>
              )}

              <label className="block text-[11px] font-bold text-slate-600">
                Old Password *
                <div className="mt-1 flex items-center gap-2 rounded-xl border px-2 py-2">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  <input
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    type={pwdShowOld ? "text" : "password"}
                    className="w-full text-[12px] font-semibold outline-none"
                    placeholder="Old password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwdShowOld((v) => !v)}
                    className="rounded-lg border bg-white p-1.5"
                    title={pwdShowOld ? "Hide" : "Show"}
                  >
                    {pwdShowOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <label className="block text-[11px] font-bold text-slate-600">
                New Password *
                <div className="mt-1 flex items-center gap-2 rounded-xl border px-2 py-2">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type={pwdShowNew ? "text" : "password"}
                    className="w-full text-[12px] font-semibold outline-none"
                    placeholder="New password (min 6)"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwdShowNew((v) => !v)}
                    className="rounded-lg border bg-white p-1.5"
                    title={pwdShowNew ? "Hide" : "Show"}
                  >
                    {pwdShowNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <label className="block text-[11px] font-bold text-slate-600">
                Confirm Password *
                <div className="mt-1 flex items-center gap-2 rounded-xl border px-2 py-2">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  <input
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type={pwdShowConfirm ? "text" : "password"}
                    className="w-full text-[12px] font-semibold outline-none"
                    placeholder="Confirm password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setPwdShowConfirm((v) => !v)}
                    className="rounded-lg border bg-white p-1.5"
                    title={pwdShowConfirm ? "Hide" : "Show"}
                  >
                    {pwdShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <div className="text-[11px] text-slate-500">
                Tip: keep strong password. New must match Confirm.
              </div>
            </div>

            <div className="border-t p-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="rounded-xl border bg-white px-3 py-2 text-xs font-extrabold"
                disabled={pwdLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={savePassword}
                disabled={!canSavePassword || pwdLoading}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50 inline-flex items-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                {pwdLoading ? "Saving..." : "Save Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Credit Modal ===================== */}
      {creditModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreditModalOpen(false)} />
          <div className="relative w-full max-w-[520px] rounded-2xl border bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-extrabold flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Credit (Udhaar) Details
              </div>
              <button
                type="button"
                className="rounded-xl border bg-white p-2"
                onClick={() => setCreditModalOpen(false)}
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              <div className="rounded-xl border bg-slate-50 p-2 text-[12px] text-slate-700 flex items-start gap-2">
                <BadgeInfo className="h-4 w-4 mt-0.5" />
                <div>
                  Required only for <span className="font-black">CREDIT</span> sales.
                  <div className="text-[11px] text-slate-500">Student, Parent, Phone must be filled.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[11px] font-bold text-slate-600">
                  Student Name *
                  <input
                    value={billToName}
                    onChange={(e) => setBillToName(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Student…"
                  />
                </label>

                <label className="text-[11px] font-bold text-slate-600">
                  Parent Name *
                  <input
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Parent…"
                  />
                </label>

                <label className="text-[11px] font-bold text-slate-600">
                  Phone *
                  <div className="mt-1 flex items-center gap-2 rounded-lg border px-2 py-2">
                    <Phone className="h-4 w-4 text-slate-500" />
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-[12px] font-semibold outline-none"
                      placeholder="Mobile…"
                      inputMode="tel"
                    />
                  </div>
                </label>

                <label className="text-[11px] font-bold text-slate-600">
                  Referenced By (optional)
                  <div className="mt-1 flex items-center gap-2 rounded-lg border px-2 py-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <input
                      value={referenceBy}
                      onChange={(e) => setReferenceBy(e.target.value)}
                      className="w-full text-[12px] font-semibold outline-none"
                      placeholder="Person name…"
                    />
                  </div>
                </label>

                <label className="text-[11px] font-bold text-slate-600 sm:col-span-2">
                  Reference Phone (optional)
                  <input
                    value={referencePhone}
                    onChange={(e) => setReferencePhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-[12px] font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                    placeholder="Reference mobile…"
                    inputMode="tel"
                  />
                </label>
              </div>
            </div>

            <div className="border-t p-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCreditModalOpen(false)}
                className="rounded-xl border bg-white px-3 py-2 text-xs font-extrabold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={closeCreditModalIfOk}
                disabled={!creditValid}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
              >
                Save Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Top bar ===================== */}
      <div className="shrink-0 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="md:hidden rounded-xl border bg-white p-2"
                onClick={() => setMobileDrawerOpen(true)}
                title="Open filters"
              >
                <Menu className="h-5 w-5" />
              </button>

              <button
                type="button"
                className="hidden md:inline-flex rounded-xl border bg-white p-2"
                onClick={() => setSidebarCollapsed((v) => !v)}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              </button>

              <div className="rounded-xl bg-slate-900 p-2 text-white">
                <ShoppingCart className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-semibold leading-5">POS Sales</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {user?.name ? `Hi, ${user.name}` : "Logged in"}
                  {loading ? " • loading…" : ""}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* ✅ Account dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold shadow-sm active:scale-[0.99]"
                  title="Account"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{user?.name ? user.name : "Account"}</span>
                  {accountOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {accountOpen && (
                  <div className="absolute right-0 mt-2 w-[220px] rounded-2xl border bg-white shadow-xl overflow-hidden z-50">
                    <div className="p-2 border-b">
                      <div className="text-[12px] font-extrabold text-slate-900 truncate">
                        {user?.name || "User"}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{user?.email || ""}</div>
                    </div>

                    <div className="p-1">
                      <button
                        type="button"
                        onClick={openChangePassword}
                        className="w-full flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] font-bold hover:bg-slate-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Change Password
                      </button>

                      <button
                        type="button"
                        onClick={doLogout}
                        className="w-full flex items-center gap-2 rounded-xl px-2 py-2 text-[12px] font-bold hover:bg-rose-50 text-rose-700"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}

                {/* overlay click to close */}
                {accountOpen && (
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setAccountOpen(false)}
                    aria-label="Close account menu"
                  />
                )}
              </div>

              {/* Summary wrap button */}
              <button
                type="button"
                onClick={() => setSummaryCollapsed((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold shadow-sm active:scale-[0.99]"
                title={summaryCollapsed ? "Show Summary" : "Hide Summary"}
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">{summaryCollapsed ? "Show Summary" : "Hide Summary"}</span>
                {summaryCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>

              <button
                onClick={resetCart}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-2.5 py-2 text-xs font-semibold shadow-sm active:scale-[0.99]"
                title="Reset"
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>

          {(errMsg || okMsg) && (
            <div className="mt-2 space-y-2">
              {errMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div className="flex-1">{errMsg}</div>
                  <button onClick={() => setErrMsg(null)} className="p-1" type="button">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {okMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  <div className="flex-1">{okMsg}</div>
                  <button onClick={() => setOkMsg(null)} className="p-1" type="button">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[86%] max-w-[360px] bg-slate-50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-extrabold">Filters</div>
              <button className="rounded-xl border bg-white p-2" onClick={() => setMobileDrawerOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-6xl px-2 py-2">
          <div className="h-full grid grid-cols-1 md:grid-cols-12 gap-2">
            {/* Desktop Sidebar */}
            <div className={`hidden md:block h-full overflow-hidden ${sidebarCollapsed ? "md:col-span-0" : "md:col-span-3"}`}>
              {!sidebarCollapsed ? <div className="h-full">{SidebarContent}</div> : null}
            </div>

            {/* Cart area */}
            <div className={`${sidebarCollapsed ? "md:col-span-12" : "md:col-span-9"} h-full overflow-hidden`}>
              <div className="h-full flex flex-col gap-2 overflow-hidden">
                {!summaryCollapsed ? (
                  <div className="shrink-0">
                    <SalesSummaryPanel />
                  </div>
                ) : null}

                <div className="flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm flex flex-col">
                  <div className="shrink-0 flex items-center justify-between border-b px-2 py-1">
                    <div className="text-sm font-extrabold">Cart</div>
                    <div className="text-xs text-slate-500">
                      Included: <span className="font-extrabold">{totals.itemCount}</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {cart.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">
                        {soldToType === "SCHOOL" ? (
                          <>
                            Select school & class — items will load automatically.
                            {loading ? <div className="mt-2 text-xs text-slate-400">Loading…</div> : null}
                          </>
                        ) : (
                          <>Walk-in mode: no bundle items.</>
                        )}
                      </div>
                    ) : (
                      <div className="h-full">
                        <div className="min-w-[520px]">
                          <div className="sticky top-0 z-10 border-b bg-white">
                            <div className="grid grid-cols-[32px_1fr_160px_120px] items-center gap-1 px-2 py-1 text-[11px] font-extrabold text-slate-600">
                              <div className="text-center">Sel</div>
                              <div>Book</div>
                              <div className="text-center">Qty</div>
                              <div className="text-right pr-1">Price</div>
                            </div>
                          </div>

                          <div className="divide-y">
                            {cart.map((x) => (
                              <div
                                key={x.key}
                                className={`grid grid-cols-[32px_1fr_160px_120px] items-center gap-1 px-2 py-1 ${
                                  x.include ? "bg-white" : "bg-slate-50"
                                }`}
                              >
                                <div className="flex justify-center">
                                  <input
                                    type="checkbox"
                                    checked={x.include}
                                    onChange={() => setLine(x.key, { include: !x.include })}
                                    className="h-4 w-4 accent-slate-900"
                                    title="Select/Unselect"
                                  />
                                </div>

                                <div className="min-w-0">
                                  <div className="truncate text-[12px] font-extrabold leading-4 text-slate-900">{x.title}</div>
                                </div>

                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" onClick={() => decQty(x.key)} className={compactBtn} title="Minus">
                                    <Minus className="h-4 w-4" />
                                  </button>

                                  <input
                                    inputMode="decimal"
                                    value={String(x.qty)}
                                    onChange={(e) => setLine(x.key, { qty: Math.max(1, round2(e.target.value)) })}
                                    className={compactNumInput}
                                  />

                                  <button type="button" onClick={() => incQty(x.key)} className={compactBtn} title="Plus">
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>

                                <div className="flex items-center justify-end gap-1 pr-1">
                                  <span className="text-[11px] font-bold text-slate-500">₹</span>
                                  <input
                                    inputMode="decimal"
                                    value={String(x.unit_price)}
                                    onChange={(e) => setLine(x.key, { unit_price: Math.max(0, round2(e.target.value)) })}
                                    className={compactPriceInput}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 border-t bg-white p-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500">Grand Total</div>
                        <div className="truncate text-lg font-black">Rs. {money(totals.total)}</div>

                        {paymentMode !== "CREDIT" && totals.returnAmount > 0 ? (
                          <div className="mt-1 text-[12px] font-black text-emerald-700">Return: Rs. {money(totals.returnAmount)}</div>
                        ) : null}

                        {paymentMode === "CREDIT" && totals.balance > 0 ? (
                          <div className="mt-1 text-[12px] font-black text-rose-700">Udhaar Balance: Rs. {money(totals.balance)}</div>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={
                            loading ||
                            totals.total <= 0 ||
                            !billToName.trim() ||
                            (paymentMode === "CREDIT" && (!parentName.trim() || !phone.trim()))
                          }
                          onClick={() => submitSale("3in")}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm disabled:opacity-60 active:scale-[0.99]"
                        >
                          <Printer className="h-4 w-4" />
                          3in
                        </button>

                        <button
                          type="button"
                          disabled={
                            loading ||
                            totals.total <= 0 ||
                            !billToName.trim() ||
                            (paymentMode === "CREDIT" && (!parentName.trim() || !phone.trim()))
                          }
                          onClick={() => submitSale("a5")}
                          className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-extrabold shadow-sm disabled:opacity-60 active:scale-[0.99]"
                        >
                          <Receipt className="h-4 w-4" />
                          A5
                        </button>
                      </div>
                    </div>

                    {bundleId ? (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Using bundle #{bundleId}
                        {bundleStatus ? <span className="ml-2 rounded-lg bg-slate-100 px-2 py-0.5">{bundleStatus}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {/* end cart */}
          </div>
        </div>
      </div>
    </div>
  );
}
