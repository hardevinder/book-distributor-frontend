import RequireAuth from "@/components/RequireAuth";
import PublishersPageClient from "@/components/PublishersPageClient";

export default function PublishersPage() {
  return (
    <RequireAuth>
      <PublishersPageClient />
    </RequireAuth>
  );
}
