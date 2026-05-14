"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { saveSettingsAction } from "@/app/(app)/settings/actions";

export interface SettingsFormValues {
  legalName: string;
  brandName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  // Tax-invoice fields
  state: string;
  stateCode: string;
  pan: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  defaultRoughDiscountPercent: string;
  defaultValidityDays: number;
  quoteNumberPrefix: string;
}

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<SettingsFormValues>(initial);

  function patch<K extends keyof SettingsFormValues>(
    k: K,
    val: SettingsFormValues[K],
  ) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  function submit() {
    startTransition(async () => {
      const res = await saveSettingsAction({
        legalName: v.legalName,
        brandName: v.brandName,
        tagline: v.tagline,
        address: v.address || null,
        phone: v.phone || null,
        email: v.email || null,
        gstin: v.gstin || null,
        state: v.state || null,
        stateCode: v.stateCode || null,
        pan: v.pan || null,
        bankName: v.bankName || null,
        bankAccount: v.bankAccount || null,
        bankIfsc: v.bankIfsc || null,
        bankBranch: v.bankBranch || null,
        defaultRoughDiscountPercent: v.defaultRoughDiscountPercent,
        defaultValidityDays: v.defaultValidityDays,
        quoteNumberPrefix: v.quoteNumberPrefix,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-base font-medium">Company</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Legal name" required>
            <Input
              value={v.legalName}
              onChange={(e) => patch("legalName", e.target.value)}
            />
          </Field>
          <Field label="Brand name" required>
            <Input
              value={v.brandName}
              onChange={(e) => patch("brandName", e.target.value)}
            />
          </Field>
          <Field label="Tagline" required hint="Shown on quote PDFs.">
            <Input
              value={v.tagline}
              onChange={(e) => patch("tagline", e.target.value)}
            />
          </Field>
          <Field
            label="GSTIN"
            hint="15-char company GSTIN for compliant tax invoices."
          >
            <Input
              value={v.gstin}
              onChange={(e) => patch("gstin", e.target.value.toUpperCase())}
              placeholder="07ABCDE1234F1Z5"
            />
          </Field>
          <Field label="Address" hint="Used in the PDF footer / header.">
            <Textarea
              value={v.address}
              onChange={(e) => patch("address", e.target.value)}
              rows={2}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Phone">
              <Input
                value={v.phone}
                onChange={(e) => patch("phone", e.target.value)}
                placeholder="+91 …"
              />
            </Field>
            <Field label="Email">
              <Input
                value={v.email}
                onChange={(e) => patch("email", e.target.value)}
                type="email"
              />
            </Field>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-base font-medium">Tax-invoice details</h2>
        <p className="text-xs text-muted-foreground">
          Required on every GST tax invoice (Rule 46). Bank details print on
          the invoice payment block so the customer can pay you directly.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Supplier state"
            hint="The state where your GSTIN is registered."
          >
            <Input
              value={v.state}
              onChange={(e) => patch("state", e.target.value)}
              placeholder="Delhi"
            />
          </Field>
          <Field
            label="State code"
            hint="2-digit GST state code. Delhi=07, Haryana=06, UP=09 …"
          >
            <Input
              value={v.stateCode}
              onChange={(e) =>
                patch("stateCode", e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="07"
              maxLength={2}
            />
          </Field>
          <Field label="PAN" hint="Customary on Indian invoices.">
            <Input
              value={v.pan}
              onChange={(e) => patch("pan", e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              maxLength={10}
            />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Bank name">
            <Input
              value={v.bankName}
              onChange={(e) => patch("bankName", e.target.value)}
              placeholder="HDFC Bank"
            />
          </Field>
          <Field label="Account number">
            <Input
              value={v.bankAccount}
              onChange={(e) => patch("bankAccount", e.target.value)}
              placeholder="50100XXXXXXXX"
            />
          </Field>
          <Field label="IFSC code">
            <Input
              value={v.bankIfsc}
              onChange={(e) => patch("bankIfsc", e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
              maxLength={11}
            />
          </Field>
          <Field label="Branch">
            <Input
              value={v.bankBranch}
              onChange={(e) => patch("bankBranch", e.target.value)}
              placeholder="Connaught Place"
            />
          </Field>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-base font-medium">Quote defaults</h2>
        <p className="text-xs text-muted-foreground">
          Pre-filled into every new rough quote. You can still override per
          quote.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Default discount %"
            hint="Extra concession on top of Astberg DP/MRP rate."
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={v.defaultRoughDiscountPercent}
              onChange={(e) =>
                patch("defaultRoughDiscountPercent", e.target.value)
              }
            />
          </Field>
          <Field label="Default validity (days)">
            <Input
              type="number"
              min={1}
              max={365}
              value={v.defaultValidityDays}
              onChange={(e) =>
                patch("defaultValidityDays", Number(e.target.value))
              }
            />
          </Field>
          <Field
            label="Quote number prefix"
            hint="Prefix on auto-generated quote numbers (e.g. BW → BW-2026-0001)."
          >
            <Input
              value={v.quoteNumberPrefix}
              onChange={(e) =>
                patch("quoteNumberPrefix", e.target.value.toUpperCase())
              }
              maxLength={8}
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
