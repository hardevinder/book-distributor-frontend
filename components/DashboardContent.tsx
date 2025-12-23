"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import {
  Building2,
  BookOpen,
  GraduationCap,
  Receipt,
  Package,
  Layers,
  ChevronRight,
  Sparkles,
  Truck,
  Users,
  ClipboardList,
  Boxes,
  PackageCheck,
  FileText, // ✅ Bundle Dispatches
  ScrollText, // ✅ Supplier Receipts
  IndianRupee, // ✅ Supplier Payments
} from "lucide-react";

/* ---------------- UI Helpers ---------------- */

type DashCard = {
  title: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
  pill: string;
  accent:
    | "emerald"
    | "amber"
    | "indigo"
    | "cyan"
    | "blue"
    | "teal"
    | "purple"
    | "sky"
    | "slate"
    | "fuchsia"
    | "rose";
};

const accentMap: Record<
  DashCard["accent"],
  {
    bg: string;
    glow: string;
    pillBg: string;
    pillText: string;
    chevron: string;
    iconBg: string;
  }
> = {
  emerald: {
    bg: "from-emerald-500/10 to-teal-500/10",
    glow: "from-emerald-500/20 to-teal-500/20",
    pillBg: "from-emerald-100 to-teal-100",
    pillText: "text-emerald-700 border-emerald-200",
    chevron: "text-emerald-600",
    iconBg: "from-emerald-500 to-teal-600",
  },
  amber: {
    bg: "from-amber-500/10 to-orange-500/10",
    glow: "from-amber-500/20 to-orange-500/20",
    pillBg: "from-amber-100 to-orange-100",
    pillText: "text-amber-700 border-amber-200",
    chevron: "text-amber-600",
    iconBg: "from-amber-500 to-orange-600",
  },
  indigo: {
    bg: "from-indigo-500/10 to-purple-500/10",
    glow: "from-indigo-500/20 to-purple-500/20",
    pillBg: "from-indigo-100 to-purple-100",
    pillText: "text-indigo-700 border-indigo-200",
    chevron: "text-indigo-600",
    iconBg: "from-indigo-500 to-purple-600",
  },
  cyan: {
    bg: "from-cyan-500/10 to-sky-500/10",
    glow: "from-cyan-500/20 to-sky-500/20",
    pillBg: "from-cyan-100 to-sky-100",
    pillText: "text-cyan-700 border-cyan-200",
    chevron: "text-cyan-700",
    iconBg: "from-cyan-500 to-sky-600",
  },
  blue: {
    bg: "from-blue-500/10 to-sky-500/10",
    glow: "from-blue-500/20 to-sky-500/20",
    pillBg: "from-blue-100 to-sky-100",
    pillText: "text-blue-700 border-blue-200",
    chevron: "text-blue-700",
    iconBg: "from-blue-500 to-sky-600",
  },
  teal: {
    bg: "from-teal-500/10 to-emerald-500/10",
    glow: "from-teal-500/20 to-emerald-500/20",
    pillBg: "from-teal-100 to-emerald-100",
    pillText: "text-teal-700 border-teal-200",
    chevron: "text-teal-700",
    iconBg: "from-teal-500 to-emerald-600",
  },
  purple: {
    bg: "from-purple-500/10 to-violet-500/10",
    glow: "from-purple-500/20 to-violet-500/20",
    pillBg: "from-purple-100 to-violet-100",
    pillText: "text-purple-700 border-purple-200",
    chevron: "text-purple-700",
    iconBg: "from-purple-500 to-violet-600",
  },
  sky: {
    bg: "from-sky-500/10 to-cyan-500/10",
    glow: "from-sky-500/20 to-cyan-500/20",
    pillBg: "from-sky-100 to-cyan-100",
    pillText: "text-sky-700 border-sky-200",
    chevron: "text-sky-700",
    iconBg: "from-sky-500 to-cyan-600",
  },
  slate: {
    bg: "from-slate-500/10 to-indigo-500/10",
    glow: "from-slate-500/20 to-indigo-500/20",
    pillBg: "from-slate-100 to-indigo-100",
    pillText: "text-slate-700 border-slate-200",
    chevron: "text-slate-700",
    iconBg: "from-slate-700 to-indigo-700",
  },
  fuchsia: {
    bg: "from-fuchsia-500/10 to-indigo-500/10",
    glow: "from-fuchsia-500/20 to-indigo-500/20",
    pillBg: "from-fuchsia-100 to-indigo-100",
    pillText: "text-fuchsia-700 border-fuchsia-200",
    chevron: "text-fuchsia-700",
    iconBg: "from-fuchsia-600 to-indigo-700",
  },
  rose: {
    bg: "from-rose-500/10 to-red-500/10",
    glow: "from-rose-500/20 to-red-500/20",
    pillBg: "from-rose-100 to-red-100",
    pillText: "text-rose-700 border-rose-200",
    chevron: "text-rose-700",
    iconBg: "from-rose-500 to-red-600",
  },
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200/60 px-4 py-3 shadow-sm">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function DashCardUI({ card }: { card: DashCard }) {
  const a = accentMap[card.accent];

  return (
    <Link
      href={card.href}
      className="group relative rounded-2xl border border-slate-200/60 bg-white/75 backdrop-blur-md p-6 shadow-lg hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden"
    >
      {/* soft gradient wash */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${a.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />
      {/* corner glow */}
      <div
        className={`absolute -top-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-br ${a.glow} blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
      />

      <div className="relative flex items-start gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${a.iconBg} text-white shadow-lg group-hover:rotate-6 transition-transform duration-300`}
        >
          {card.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-bold text-lg text-slate-900 tracking-tight">
              {card.title}
            </h3>
            <span
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border bg-gradient-to-r ${a.pillBg} ${a.pillText} font-semibold`}
            >
              {card.pill}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-600 leading-relaxed line-clamp-3">
            {card.desc}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
              Open
            </span>
            <ChevronRight
              className={`w-4 h-4 ${a.chevron} group-hover:translate-x-1 transition-transform`}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ---------------- Page ---------------- */

const DashboardContent: React.FC = () => {
  const { user, logout } = useAuth();

  const cards = useMemo<DashCard[]>(
    () => [
      // Masters / Setup
      {
        title: "Company Profile",
        desc: "Maintain company name, address, GST, logo & contact. Used across PDFs (POs, invoices, delivery notes).",
        href: "/company-profile",
        icon: <Building2 className="w-6 h-6" />,
        pill: "Setup",
        accent: "emerald",
      },
      {
        title: "Suppliers",
        desc: "Manage your supplier directory with contacts and business details to streamline procurement.",
        href: "/suppliers",
        icon: <Users className="w-6 h-6" />,
        pill: "Master",
        accent: "amber",
      },
      {
        title: "Publishers",
        desc: "Onboard publishers and connect them with your catalog for cleaner purchase workflows.",
        href: "/publishers",
        icon: <Building2 className="w-6 h-6" />,
        pill: "Master",
        accent: "indigo",
      },
      {
        title: "Transports",
        desc: "Maintain transporter/courier list for purchase orders and delivery documentation.",
        href: "/transports",
        icon: <Truck className="w-6 h-6" />,
        pill: "Master",
        accent: "cyan",
      },
      {
        title: "Classes",
        desc: "Define classes and mapping structure for precise textbook requirements and kits.",
        href: "/classes",
        icon: <GraduationCap className="w-6 h-6" />,
        pill: "Master",
        accent: "blue",
      },
      {
        title: "Schools",
        desc: "Manage school profiles and track yearly demand for accurate planning and distribution.",
        href: "/schools",
        icon: <Building2 className="w-6 h-6" />,
        pill: "Master",
        accent: "teal",
      },
      {
        title: "Distributors",
        desc: "Create distributor records and manage distribution partners for issuing and dispatch tracking.",
        href: "/distributors",
        icon: <Users className="w-6 h-6" />,
        pill: "Module 2",
        accent: "rose",
      },

      // Catalog / Demand
      {
        title: "Books",
        desc: "Maintain catalog with class/subject/publisher/supplier + pricing for accurate totals and reports.",
        href: "/books",
        icon: <BookOpen className="w-6 h-6" />,
        pill: "Catalog",
        accent: "purple",
      },
      {
        title: "Requirements",
        desc: "Capture school-wise requirements with Excel import/export for fast bulk entry.",
        href: "/requirements",
        icon: <Receipt className="w-6 h-6" />,
        pill: "Demand",
        accent: "amber",
      },

      // Orders
      {
        title: "Publisher Orders",
        desc: "Generate consolidated POs from requirements and coordinate quickly with publishers.",
        href: "/publisher-orders",
        icon: <Package className="w-6 h-6" />,
        pill: "Orders",
        accent: "emerald",
      },
      {
        title: "School Orders",
        desc: "Generate school-wise orders, share order emails and track received vs pending.",
        href: "/school-orders",
        icon: <Package className="w-6 h-6" />,
        pill: "Orders",
        accent: "sky",
      },

      // ✅ Supplier Receipts
      {
        title: "Supplier Receipts",
        desc: "Track supplier-wise receipts created on receiving stock. Review items, rates, discounts and receipt totals.",
        href: "/supplier-receipts",
        icon: <ScrollText className="w-6 h-6" />,
        pill: "Receipts",
        accent: "teal",
      },

      // ✅ NEW: Supplier Payments
      {
        title: "Supplier Payments",
        desc: "Record supplier payments (CASH/BANK/UPI/NEFT etc), view supplier-wise ledger, and track outstanding balance.",
        href: "/supplier-payments",
        icon: <IndianRupee className="w-6 h-6" />,
        pill: "Payments",
        accent: "emerald",
      },

      // Inventory / Bundles
      {
        title: "Availability",
        desc: "View school-wise required vs available with reserved/issued breakdown to plan distribution.",
        href: "/school-orders/availability",
        icon: <ClipboardList className="w-6 h-6" />,
        pill: "Stock",
        accent: "slate",
      },
      {
        title: "Bundles (Kits)",
        desc: "Create class/school-wise kits with pricing. Reserve stock, then issue bundles to deduct inventory.",
        href: "/bundles",
        icon: <Boxes className="w-6 h-6" />,
        pill: "Module 2",
        accent: "fuchsia",
      },
      {
        title: "Issue Bundles",
        desc: "Issue reserved bundles to school/distributor and generate clean inventory deductions with issue slip.",
        href: "/issue-bundles",
        icon: <PackageCheck className="w-6 h-6" />,
        pill: "Dispatch",
        accent: "cyan",
      },

      // Bundle Dispatches
      {
        title: "Bundle Dispatches",
        desc: "Create & track dispatch entries for issued bundles. Generate Dispatch Challan / Delivery Note PDFs and manage status.",
        href: "/bundle-dispatches",
        icon: <FileText className="w-6 h-6" />,
        pill: "Dispatch",
        accent: "indigo",
      },

      {
        title: "Stock & Inventory",
        desc: "Track real-time stock levels and inventory movements for accurate reporting and control.",
        href: "/stock",
        icon: <Layers className="w-6 h-6" />,
        pill: "Inventory",
        accent: "emerald",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000" />
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000" />
      </div>

      {/* TOP BAR */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
            <BookOpen className="w-5 h-5" />
          </div>

          <div className="flex flex-col leading-tight">
            <span className="text-base sm:text-lg font-extrabold tracking-tight">
              Book Distribution Panel
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Orders • Inventory • Bundles • Dispatch
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="hidden sm:flex flex-col items-end">
            <span className="font-semibold text-slate-800">
              {user?.name || "User"}
            </span>
            {user?.role && (
              <span className="mt-0.5 text-xs rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 border border-indigo-200 text-indigo-700 font-semibold">
                {user.role}
              </span>
            )}
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:shadow-lg hover:scale-[1.03] transition-all duration-200"
          >
            Logout
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 p-6 lg:p-8">
        {/* Hero */}
        <section className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                  Welcome back, {user?.name?.split(" ")?.[0] || "Gurman"}
                </h2>
              </div>

              <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
                Manage masters, build requirements, generate orders, maintain inventory, create bundles (kits),
                and issue/dispatch — all from one clean dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-[520px]">
              <StatPill label="Module-1" value="Orders & Masters" />
              <StatPill label="Module-2" value="Inventory & Bundles" />
              <StatPill label="Status" value="Live & Updated" />
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mb-6">
          <div className="rounded-3xl border border-slate-200/60 bg-white/70 backdrop-blur-md shadow-sm p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Quick Actions
                </h3>
                <p className="text-xs text-slate-500">
                  Jump to the most used screens.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/requirements"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Requirements
                </Link>
                <Link
                  href="/school-orders"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  School Orders
                </Link>
                <Link
                  href="/supplier-receipts"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Supplier Receipts
                </Link>
                <Link
                  href="/supplier-payments"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Supplier Payments
                </Link>
                <Link
                  href="/bundles"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Bundles
                </Link>
                <Link
                  href="/issue-bundles"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Issue Bundles
                </Link>
                <Link
                  href="/bundle-dispatches"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Bundle Dispatches
                </Link>
                <Link
                  href="/stock"
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition"
                >
                  Stock
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* GRID */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Modules & Masters
            </h3>
            <span className="text-xs text-slate-500">{cards.length} sections</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {cards.map((c) => (
              <DashCardUI key={c.href} card={c} />
            ))}
          </div>
        </section>
      </main>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.08);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.92);
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

export default DashboardContent;
