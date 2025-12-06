import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthProviderWrapper from "@/components/AuthProviderWrapper";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Book Distribution Panel",
  description: "Book Distributor Admin Panel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} bg-gray-50 text-slate-900 antialiased`}
      >
        <AuthProviderWrapper>
          <div className="min-h-screen">
            {children}
          </div>
          {/* Global toast notifications */}
          <Toaster position="top-right" />
        </AuthProviderWrapper>
      </body>
    </html>
  );
}
