import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import { ClientForm } from "@/components/clients/client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireEmployeeOrAbove();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New client</h1>
      </div>
      <ClientForm />
    </div>
  );
}
