import { ComingSoon } from "@/components/app/coming-soon";
import { requireAuth } from "@/lib/auth/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAuth();
  return (
    <ComingSoon
      title="Settings"
      description="Company details, GSTIN, default discount percentages, quote number prefix."
    />
  );
}
