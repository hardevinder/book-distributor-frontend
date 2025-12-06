"use client";

import React from "react";
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
} from "lucide-react";

const DashboardContent: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-slate-900 overflow-hidden">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      {/* TOP BAR */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-200/50 shadow-lg">
        <div className="font-bold flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg animate-pulse">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg tracking-tight">
              BookFlow Dashboard
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Streamline Orders, Purchases & Stock
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
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-10 p-6 lg:p-8">
        {/* Heading */}
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
              Welcome Back
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              Module 1 – Order & Purchase Mastery
            </h1>
            <span className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 border border-emerald-200 font-medium">
              Live & Updated
            </span>
          </div>
          <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
            Dive into the heart of book distribution. Seamlessly manage publishers, curate catalogs, fulfill school needs, and keep your inventory in perfect sync—all in one intuitive hub.
          </p>
        </section>

        {/* GRID OF MODULE CARDS */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Publishers */}
            <Link
              href="/publishers"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Publishers</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Discover and onboard top publishers. Link them effortlessly to your catalog and streamline order fulfillment.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-indigo-600 font-medium">Explore Now</span>
                <ChevronRight className="w-4 h-4 text-indigo-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Classes */}
            <Link
              href="/classes"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Classes</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Curate a dynamic class roster. Map textbooks precisely to grades and subjects for seamless requirements.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-blue-600 font-medium">Dive In</span>
                <ChevronRight className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Schools */}
            <Link
              href="/schools"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Schools</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Profile educational institutions. Monitor and forecast their yearly book demands with precision.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-teal-600 font-medium">Manage</span>
                <ChevronRight className="w-4 h-4 text-teal-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Books */}
            <Link
              href="/books"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Books</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Build your ultimate library catalog. Track classes, subjects, publishers, pricing, and more.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-purple-600 font-medium">Catalog</span>
                <ChevronRight className="w-4 h-4 text-purple-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Requirements */}
            <Link
              href="/requirements"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Requirements</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Gather school-specific needs. Leverage Excel imports/exports for bulk efficiency.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-amber-600 font-medium">Track</span>
                <ChevronRight className="w-4 h-4 text-amber-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Publisher Orders */}
            <Link
              href="/publisher-orders"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Publisher Orders</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Consolidate demands into smart POs. Automate emails for swift publisher coordination.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-green-600 font-medium">Order</span>
                <ChevronRight className="w-4 h-4 text-green-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>

            {/* Stock & Inventory */}
            <Link
              href="/stock"
              className="group relative border-0 bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800 mb-1">Stock & Inventory</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Real-time visibility into stock levels. Auto-sync with orders and receipts for accuracy.
                  </p>
                </div>
              </div>
              <div className="relative flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-xs text-emerald-600 font-medium">Monitor</span>
                <ChevronRight className="w-4 h-4 text-emerald-500 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>
        </section>
      </main>

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

export default DashboardContent;