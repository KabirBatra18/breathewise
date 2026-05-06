import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { companySettings } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireOwner();

  const row = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1);
  const s = row[0];

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company info on every PDF, plus the defaults pre-filled into new
          quotes. Owner-only.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>One row, drives everything</CardDescription>
          <CardTitle>Company &amp; defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={{
              legalName: s?.legalName ?? "",
              brandName: s?.brandName ?? "",
              tagline: s?.tagline ?? "",
              address: s?.address ?? "",
              phone: s?.phone ?? "",
              email: s?.email ?? "",
              gstin: s?.gstin ?? "",
              defaultRoughDiscountPercent:
                s?.defaultRoughDiscountPercent ?? "5.00",
              defaultValidityDays: s?.defaultValidityDays ?? 15,
              quoteNumberPrefix: s?.quoteNumberPrefix ?? "BW",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
