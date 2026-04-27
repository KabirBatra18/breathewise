"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createClientAction,
  updateClientAction,
  type ActionResult,
} from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ClientFormValues {
  id?: string;
  name?: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  notes?: string | null;
}

function Submit({ creating }: { creating: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : creating ? "Create client" : "Save changes"}
    </Button>
  );
}

export function ClientForm({ initial }: { initial?: ClientFormValues }) {
  const creating = !initial?.id;
  const router = useRouter();

  const boundAction = creating
    ? createClientAction
    : updateClientAction.bind(null, initial!.id!);

  const [state, action] = useFormState<ActionResult | null, FormData>(
    boundAction,
    null,
  );

  useEffect(() => {
    if (state?.ok && !creating) toast.success("Saved.");
    if (state && !state.ok) toast.error(state.error);
  }, [state, creating]);

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Who you&apos;re quoting.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" defaultValue={initial?.name ?? ""} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">Company</Label>
            <Input id="companyName" name="companyName" defaultValue={initial?.companyName ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              name="gstin"
              defaultValue={initial?.gstin ?? ""}
              placeholder="15 chars, optional"
              maxLength={15}
              autoCapitalize="characters"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site address</CardTitle>
          <CardDescription>
            Used as the install address on quotes. Optional but useful.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine1">Address line 1</Label>
            <Input id="addressLine1" name="addressLine1" defaultValue={initial?.addressLine1 ?? ""} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input id="addressLine2" name="addressLine2" defaultValue={initial?.addressLine2 ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" defaultValue={initial?.state ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">PIN code</Label>
            <Input id="pincode" name="pincode" inputMode="numeric" defaultValue={initial?.pincode ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={3} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={() => router.push("/clients")}>
          Cancel
        </Button>
        <Submit creating={creating} />
      </div>
    </form>
  );
}
