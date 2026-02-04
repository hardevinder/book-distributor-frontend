"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
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
  // ✅ token added (fixes Unauthorized on receipt blob)
  const { user, token } = useAuth() as any;

  const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [token]);

  const isDistributor = useMemo(() => hasRole(user, "DISTRIBUTOR"), [user]);

  // sidebar wrap (desktop) + drawer (mobile)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
  const [paidAmount, setPaidAmount] = useState<number>(0);
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

  const compactSelect =
    "w-full rounded-lg border bg-white px-2 py-1.5 text-[12px] font-semibold leading-5 outline-none focus:ring-2 focus:ring-slate-200";
  const compactInput = "w-full rounded-lg border px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-slate-200";

  const clearBundleAndCart = () => {
    setCart([]);
    setBundleId(null);
    setBundleStatus(null);
    setPaidAmount(0);
    lastSaleIdRef.current = null;
  };

  /* ---------- Receipt ---------- */
  const openReceipt = async (saleId: number, size: "3in" | "a5") => {
    try {
      setErrMsg(null);
      const res = await api.get(`/api/sales/${saleId}/receipt?size=${size}`, {
        responseType: "blob",
        headers: authHeaders, // ✅ important
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
    if (!token) return; // wait for auth

    (async () => {
      try {
        setErrMsg(null);

        // ✅ schools: distributor should see ONLY assigned schools
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

        // ✅ if current selected school is not in allowed list, reset it
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
    return { subtotal: round2(subtotal), total, paid, balance, itemCount: included.length };
  }, [cart, paidAmount]);

  /* ---------- Cart operations ---------- */
  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const incQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: round2(x.qty + 1) } : x)));

  const decQty = (key: string) =>
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty: Math.max(0, round2(x.qty - 1)) } : x)));

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
          const qty = Math.max(0, round2(it.qty));
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
            include: qty > 0,
            book_id: book_id || null,
          };
        })
        .filter((x) => x.product_id > 0);

      setBundleId(num(b?.id) || id);
      setBundleStatus(pickBundleStatus(b) || String(preferred.status || "").toUpperCase() || null);
      setCart(lines);

      const autoTotal = lines.filter((x) => x.include).reduce((s, x) => s + round2(x.qty * x.unit_price), 0);
      setPaidAmount(round2(autoTotal));

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

    setLoading(true);
    try {
      const payload = {
        sold_to_type: soldToType,
        sold_to_id: soldToType === "SCHOOL" ? selectedSchoolId : null,
        bundle_id: bundleId,
        class_name: soldToType === "SCHOOL" ? (selectedClass?.class_name || null) : null,
        payment_mode: paymentMode,
        paid_amount: paidAmount,
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

        {/* ✅ For distributor: no need of search if only few assigned schools */}
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
  disabled={isDistributor && schools.length <= 1} // ✅ lock if only 1 school
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
                      <span className="rounded-lg bg-white px-2 py-0.5 border text-[10px] font-bold">{bundleStatus}</span>
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

      <div className="flex-1 overflow-auto p-2">
        <div className="rounded-2xl border bg-white p-2">
          <div className="text-xs font-extrabold">Payment</div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)} className={compactSelect}>
              <option value="CASH">CASH</option>
              <option value="UPI">UPI</option>
              <option value="CARD">CARD</option>
              <option value="CREDIT">CREDIT</option>
            </select>

            <div className="rounded-lg border px-2 py-1.5">
              <div className="text-[10px] font-bold text-slate-600">Paid</div>
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
      {/* Top bar with wrap button */}
      <div className="shrink-0 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile menu button */}
              <button
                type="button"
                className="md:hidden rounded-xl border bg-white p-2"
                onClick={() => setMobileDrawerOpen(true)}
                title="Open filters"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Desktop collapse button */}
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

      {/* Main workspace */}
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto h-full max-w-6xl px-2 py-2">
          <div className="h-full grid grid-cols-1 md:grid-cols-12 gap-2">
            {/* Desktop Sidebar */}
            <div className={`hidden md:block h-full overflow-hidden ${sidebarCollapsed ? "md:col-span-0" : "md:col-span-3"}`}>
              {!sidebarCollapsed ? <div className="h-full">{SidebarContent}</div> : null}
            </div>

            {/* Cart area */}
            <div className={`${sidebarCollapsed ? "md:col-span-12" : "md:col-span-9"} h-full overflow-hidden`}>
              <div className="h-full rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="shrink-0 flex items-center justify-between border-b px-3 py-2">
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
                    <div className="divide-y">
                      {cart.map((x) => {
                        const lineTotal = round2((x.include ? x.qty : 0) * x.unit_price);
                        return (
                          <div key={x.key} className="p-3">
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => setLine(x.key, { include: !x.include })}
                                className={`mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center ${
                                  x.include ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-400"
                                }`}
                                title="Include/Exclude"
                              >
                                {x.include ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4" />}
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-extrabold">{x.title}</div>
                                    <div className="mt-0.5 text-xs text-slate-500">
                                      {x.kind}
                                      {x.class_name ? <> • {x.class_name}</> : null}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-slate-500">Line</div>
                                    <div className="text-sm font-extrabold">Rs. {money(lineTotal)}</div>
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <div className="rounded-xl border p-2">
                                    <div className="text-[11px] font-extrabold text-slate-600">Qty</div>
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                      <button type="button" onClick={() => decQty(x.key)} className="rounded-lg border bg-white p-2 active:scale-[0.99]">
                                        <Minus className="h-4 w-4" />
                                      </button>

                                      <input
                                        inputMode="decimal"
                                        value={String(x.qty)}
                                        onChange={(e) => setLine(x.key, { qty: Math.max(0, round2(e.target.value)) })}
                                        className="w-full rounded-lg border px-2 py-2 text-center text-sm font-extrabold outline-none focus:ring-2 focus:ring-slate-200"
                                      />

                                      <button type="button" onClick={() => incQty(x.key)} className="rounded-lg border bg-white p-2 active:scale-[0.99]">
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="rounded-xl border p-2">
                                    <div className="text-[11px] font-extrabold text-slate-600">Unit Price</div>
                                    <div className="mt-1 flex items-center gap-2">
                                      <IndianRupee className="h-4 w-4 text-slate-500" />
                                      <input
                                        inputMode="decimal"
                                        value={String(x.unit_price)}
                                        onChange={(e) => setLine(x.key, { unit_price: Math.max(0, round2(e.target.value)) })}
                                        className="w-full rounded-lg border px-2 py-2 text-sm font-extrabold outline-none focus:ring-2 focus:ring-slate-200"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-500">Grand Total</div>
                      <div className="truncate text-lg font-black">Rs. {money(totals.total)}</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loading || totals.total <= 0}
                        onClick={() => submitSale("3in")}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm disabled:opacity-60 active:scale-[0.99]"
                      >
                        <Printer className="h-4 w-4" />
                        3in
                      </button>

                      <button
                        type="button"
                        disabled={loading || totals.total <= 0}
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
            {/* end cart */}
          </div>
        </div>
      </div>
    </div>
  );
}
