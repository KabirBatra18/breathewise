"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createProductAction,
  updateProductAction,
  type ActionResult,
} from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRODUCT_CATEGORIES } from "@/lib/constants";

export interface ProductFormValues {
  id?: string;
  sku?: string | null;
  name?: string;
  description?: string;
  category?: string;
  mrp?: string | null;
  defaultUnitPrice?: string;
  defaultGstRate?: string;
  unit?: string;
  isActive?: boolean;
  costPrice?: string | null;
  supplier?: string | null;
  costNotes?: string | null;
}

function Submit({ creating }: { creating: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : creating ? "Create product" : "Save changes"}
    </Button>
  );
}

export function ProductForm({
  initial,
  isOwner,
}: {
  initial?: ProductFormValues;
  isOwner: boolean;
}) {
  const creating = !initial?.id;
  const router = useRouter();

  const boundAction = creating
    ? createProductAction
    : updateProductAction.bind(null, initial!.id!);

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
          <CardTitle>Product details</CardTitle>
          <CardDescription>
            Fields shown on the catalog and inserted into quotes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              name="sku"
              defaultValue={initial?.sku ?? ""}
              placeholder="e.g. AST-ERV-AHE50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select name="category" defaultValue={initial?.category ?? "ACCESSORY"}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" defaultValue={initial?.name ?? ""} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={initial?.description ?? ""}
              rows={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mrp">MRP (₹)</Label>
            <Input
              id="mrp"
              name="mrp"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.mrp ?? ""}
              placeholder="optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultUnitPrice">Selling price (₹) *</Label>
            <Input
              id="defaultUnitPrice"
              name="defaultUnitPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initial?.defaultUnitPrice ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultGstRate">GST % *</Label>
            <Input
              id="defaultGstRate"
              name="defaultGstRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={initial?.defaultGstRate ?? "18.00"}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Unit *</Label>
            <Input
              id="unit"
              name="unit"
              defaultValue={initial?.unit ?? "pcs"}
              required
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              id="isActive"
              type="checkbox"
              name="isActive"
              defaultChecked={initial?.isActive ?? true}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isActive" className="cursor-pointer font-normal">
              Active (available to add to quotes)
            </Label>
          </div>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Cost & supplier</CardTitle>
            <CardDescription>
              Owner only. Used to compute margin in quotes — never appears on
              client-facing PDFs. Leave cost blank to remove the cost record.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost price (₹)</Label>
              <Input
                id="costPrice"
                name="costPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={initial?.costPrice ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                name="supplier"
                defaultValue={initial?.supplier ?? ""}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="costNotes">Notes</Label>
              <Textarea
                id="costNotes"
                name="costNotes"
                defaultValue={initial?.costNotes ?? ""}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
        <Submit creating={creating} />
      </div>
    </form>
  );
}
