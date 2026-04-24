import { requireAuth } from "@/lib/auth/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi, {user.fullName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {todayString()} · Welcome back.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Draft quotes</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Quotes you haven&apos;t sent yet
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Sent (30 days)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Quotes delivered to clients
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Accepted (30 days)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Quotes converted to deals
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Clients</CardDescription>
            <CardTitle className="text-3xl tabular-nums">0</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Active customer records
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 status</CardTitle>
          <CardDescription>
            You&apos;re logged in. The quote builder, catalog CRUD, and PDF
            generation land next.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function todayString(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}
