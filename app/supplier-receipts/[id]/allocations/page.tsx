// app/supplier-receipts/[id]/allocations/page.tsx
// ✅ Page to render SupplierReceiptAllocationsModal (standalone page)
// URL example: /supplier-receipts/123/allocations

import SupplierReceiptAllocationsModal from "@/components/SupplierReceiptAllocationsModal";

type PageProps = {
  params: { id: string };
};

export default function SupplierReceiptAllocationsPage({ params }: PageProps) {
  const receiptId = Number(params.id);

  // Modal needs props, but on a page we can keep it open always
  // We'll pass empty arrays here; the modal will still render,
  // but to make it fully functional you should load schools+receipt items in this page or parent.
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-lg font-semibold">Receipt Allocations</div>
          <div className="mt-1 text-sm text-slate-600">
            Receipt ID: <b>{isNaN(receiptId) ? params.id : receiptId}</b>
          </div>

          {/* Render modal "open" in page mode */}
          <SupplierReceiptAllocationsModal
            open={true}
            onClose={() => {
              // in page mode, you can route back (optional)
              // e.g. useRouter().push("/supplier-receipts");
              history.back();
            }}
            receiptId={receiptId}
            receiptNo={`#${receiptId}`}
            receiptStatus={"received"} // ideally load real status
            postedAt={new Date().toISOString()} // ideally load real postedAt (or null)
            schools={[]} // ✅ load from /api/schools
            items={[]} // ✅ load receipt items from /api/supplier-receipts/:id
            onSaved={() => {
              // optional: refresh page data
            }}
          />
        </div>
      </div>
    </div>
  );
}
