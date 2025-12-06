import RequireAuth from "@/components/RequireAuth";
import DashboardContent from "@/components/DashboardContent";

export default function HomePage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
