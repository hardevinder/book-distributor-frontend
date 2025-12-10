// app/transports/page.tsx
"use client";

import React from "react";
import RequireAuth from "@/components/RequireAuth";
import TransportsPageClient from "@/components/TransportsPageClient";

const TransportsPage = () => {
  return (
    <RequireAuth>
      <TransportsPageClient />
    </RequireAuth>
  );
};

export default TransportsPage;
