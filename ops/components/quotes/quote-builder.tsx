"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ProductPicker, type ProductOption } from "./product-picker";
import { TotalsPanel } from "./totals-panel";
import { saveRoughQuoteAction, type SaveQuoteInput } from "@/app/(app)/quotes/actions";
import {
  Decimal,
  computeFinancials,
  computeLineAmount,
  computeQuoteTotals,
  formatIndianNumber,
  type SectionInput,
} from "@/lib/pricing";

type Role = "OWNER" | "EMPLOYEE" | "VIEWER";

export interface ClientOption {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
}

export interface TermsOption {
  id: string;
  title: string;
  isDefault: boolean;
}

interface LineState {
  id: string;
  productId: string | null;
  description: string;
  mrp: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  costPriceSnapshot: string | null;
}

interface SectionState {
  id: string;
  letter: string;
  title: string;
  gstRate: string;
  isLabourStyle: boolean;
  appliesDiscount: boolean;
  lines: LineState[];
}

const todayIST = (): string => {
  const d = new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const newId = () => Math.random().toString(36).slice(2);
const blankLine = (): LineState => ({
  id: newId(),
  productId: null,
  description: "",
  mrp: "",
  quantity: "1",
  unitPrice: "",
  unit: "pcs",
  costPriceSnapshot: null,
});

const sectionLetterAt = (i: number) => String.fromCharCode("A".charCodeAt(0) + i);

const newSection = (i: number): SectionState => ({
  id: newId(),
  letter: sectionLetterAt(i),
  title: i === 0 ? "Equipment" : i === 1 ? "Accessories" : i === 2 ? "Labour" : "",
  gstRate: i === 2 ? "0.00" : "18.00",
  isLabourStyle: i === 2,
  appliesDiscount: i !== 2,
  lines: [blankLine()],
});

export function QuoteBuilder({
  role,
  clients,
  products,
  defaultDiscount,
  defaultValidityDays,
  termsClauses,
  initial,
}: {
  role: Role;
  clients: ClientOption[];
  products: ProductOption[];
  defaultDiscount: string;
  defaultValidityDays: number;
  termsClauses: TermsOption[];
  initial?: {
    id: string;
    quoteNumber: string;
    clientId: string;
    issueDate: string;
    validityDays: number;
    discountPercent: string;
    sections: SectionState[];
    selectedTermIds: string[];
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isOwner = role === "OWNER";

  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayIST());
  const [validityDays, setValidityDays] = useState(
    initial?.validityDays ?? defaultValidityDays,
  );
  const [discountPercent, setDiscountPercent] = useState(
    initial?.discountPercent ?? defaultDiscount,
  );
  const [sections, setSections] = useState<SectionState[]>(
    initial?.sections ?? [newSection(0), newSection(1), newSection(2)],
  );
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>(
    initial?.selectedTermIds ?? termsClauses.filter((t) => t.isDefault).map((t) => t.id),
  );

  const calcInput = useMemo<SectionInput[]>(
    () =>
      sections.map((s) => ({
        discountPercent,
        gstRate: s.gstRate || "0",
        isLabourStyle: s.isLabourStyle,
        appliesDiscount: s.appliesDiscount,
        lines: s.lines.map((l) => ({
          qty: numericOrZero(l.quantity),
          unitPrice: numericOrZero(l.unitPrice),
          costPriceSnapshot: isOwner ? l.costPriceSnapshot : null,
        })),
      })),
    [sections, discountPercent, isOwner],
  );

  const totals = useMemo(() => computeQuoteTotals(calcInput), [calcInput]);
  const financials = useMemo(
    () => (isOwner ? computeFinancials(calcInput) : null),
    [calcInput, isOwner],
  );

  function patchSection(idx: number, patch: Partial<SectionState>) {
    setSections((curr) =>
      curr.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  function patchLine(
    sectionIdx: number,
    lineIdx: number,
    patch: Partial<LineState>,
  ) {
    setSections((curr) =>
      curr.map((s, i) =>
        i !== sectionIdx
          ? s
          : {
              ...s,
              lines: s.lines.map((l, li) => (li === lineIdx ? { ...l, ...patch } : l)),
            },
      ),
    );
  }

  function addLine(sectionIdx: number) {
    setSections((curr) =>
      curr.map((s, i) =>
        i !== sectionIdx ? s : { ...s, lines: [...s.lines, blankLine()] },
      ),
    );
  }

  function removeLine(sectionIdx: number, lineIdx: number) {
    setSections((curr) =>
      curr.map((s, i) =>
        i !== sectionIdx
          ? s
          : { ...s, lines: s.lines.filter((_, li) => li !== lineIdx) },
      ),
    );
  }

  function addSection() {
    setSections((curr) => [...curr, newSection(curr.length)]);
  }

  function removeSection(idx: number) {
    setSections((curr) =>
      curr
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, letter: sectionLetterAt(i) })),
    );
  }

  function toggleTerm(id: string) {
    setSelectedTermIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  function buildPayload(): SaveQuoteInput | null {
    if (!clientId) {
      toast.error("Pick a client.");
      return null;
    }
    if (sections.length === 0) {
      toast.error("Add at least one section.");
      return null;
    }
    for (const s of sections) {
      if (s.lines.length === 0) {
        toast.error(`Section ${s.letter} has no line items.`);
        return null;
      }
      for (const l of s.lines) {
        if (!l.description.trim()) {
          toast.error(`Section ${s.letter}: every line needs a description.`);
          return null;
        }
        if (!l.quantity || Number(l.quantity) <= 0) {
          toast.error(`Section ${s.letter}: quantity must be > 0.`);
          return null;
        }
        if (l.unitPrice === "" || Number(l.unitPrice) < 0) {
          toast.error(`Section ${s.letter}: unit price required.`);
          return null;
        }
      }
    }

    return {
      id: initial?.id,
      clientId,
      quoteType: "ROUGH",
      issueDate,
      validityDays: Number(validityDays) || defaultValidityDays,
      discountPercent: numericOrZero(discountPercent),
      sections: sections.map((s) => ({
        letter: s.letter,
        title: s.title.trim() || `Section ${s.letter}`,
        gstRate: numericOrZero(s.gstRate),
        isLabourStyle: s.isLabourStyle,
        appliesDiscount: s.appliesDiscount && !s.isLabourStyle,
        lines: s.lines.map((l, i) => ({
          productId: l.productId,
          sno: i + 1,
          description: l.description.trim(),
          mrp: l.mrp ? numericOrZero(l.mrp) : null,
          quantity: numericOrZero(l.quantity),
          unitPrice: numericOrZero(l.unitPrice),
          unit: l.unit.trim() || "pcs",
        })),
      })),
      termsClauseIds: selectedTermIds,
    };
  }

  function save() {
    const payload = buildPayload();
    if (!payload) return;
    startTransition(async () => {
      const res = await saveRoughQuoteAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved ${res.quoteNumber}.`);
      router.push(`/quotes/${res.id}`);
    });
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
            <CardDescription>Who, when, and the discount across this quote.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.companyName ? ` · ${c.companyName}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedClient ? null : (
                <p className="text-xs text-muted-foreground">
                  Don&apos;t see them?{" "}
                  <a href="/clients/new" className="underline">
                    Add a client
                  </a>{" "}
                  first.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue date</Label>
              <Input
                id="issueDate"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validityDays">Validity (days)</Label>
              <Input
                id="validityDays"
                type="number"
                min={1}
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discountPercent">Discount %</Label>
              <Input
                id="discountPercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Applied to every section below where &ldquo;applies discount&rdquo; is on.
              </p>
            </div>
          </CardContent>
        </Card>

        {sections.map((section, sIdx) => (
          <SectionCard
            key={section.id}
            section={section}
            products={products}
            isOwner={isOwner}
            onPatch={(patch) => patchSection(sIdx, patch)}
            onRemove={sections.length > 1 ? () => removeSection(sIdx) : undefined}
            onPatchLine={(lIdx, patch) => patchLine(sIdx, lIdx, patch)}
            onAddLine={() => addLine(sIdx)}
            onRemoveLine={(lIdx) => removeLine(sIdx, lIdx)}
          />
        ))}

        <Button variant="outline" type="button" onClick={addSection} className="w-full">
          <Plus className="h-4 w-4" />
          Add section {sectionLetterAt(sections.length)}
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Terms &amp; conditions</CardTitle>
            <CardDescription>Snapshotted on save — edits to the library don&apos;t change past quotes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {termsClauses.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTermIds.includes(c.id)}
                  onChange={() => toggleTerm(c.id)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>{c.title}</span>
              </label>
            ))}
            {termsClauses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No T&amp;C clauses configured. Default ones are seeded with the database; if this list is empty something is off with the seed.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <TotalsPanel
          totals={totals}
          financials={financials}
          isOwner={isOwner}
          quoteNumber={initial?.quoteNumber}
        />
        <div className="mt-4 space-y-2">
          <Button onClick={save} disabled={pending} className="w-full">
            {pending ? "Saving…" : initial ? "Save changes" : "Save as draft"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Send to client (PDF) lands next.
          </p>
        </div>
      </div>
    </div>
  );
}

type SectionType = "GOODS" | "LABOUR" | "CUSTOM";

function deriveSectionType(s: SectionState): SectionType {
  if (s.isLabourStyle) return "LABOUR";
  if (Number(s.gstRate) === 18 && s.appliesDiscount) return "GOODS";
  return "CUSTOM";
}

function applySectionType(type: SectionType): Partial<SectionState> | null {
  if (type === "GOODS") {
    return { gstRate: "18.00", appliesDiscount: true, isLabourStyle: false };
  }
  if (type === "LABOUR") {
    return { gstRate: "0.00", appliesDiscount: false, isLabourStyle: true };
  }
  return null;
}

function SectionCard({
  section,
  products,
  isOwner,
  onPatch,
  onRemove,
  onPatchLine,
  onAddLine,
  onRemoveLine,
}: {
  section: SectionState;
  products: ProductOption[];
  isOwner: boolean;
  onPatch: (patch: Partial<SectionState>) => void;
  onRemove?: () => void;
  onPatchLine: (lineIdx: number, patch: Partial<LineState>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineIdx: number) => void;
}) {
  const sectionType = deriveSectionType(section);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Section {section.letter}
            </Label>
            <Input
              value={section.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder="Section title"
              className="text-base font-medium"
            />
          </div>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              aria-label={`Remove section ${section.letter}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label>Section type</Label>
            <Select
              value={sectionType}
              onValueChange={(v) => {
                const patch = applySectionType(v as SectionType);
                if (patch) onPatch(patch);
                else onPatch({}); // Custom: keep current values, just exposes the raw controls below
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GOODS">
                  Goods · 18% GST · applies discount
                </SelectItem>
                <SelectItem value="LABOUR">
                  Labour / Services · no GST · no discount
                </SelectItem>
                <SelectItem value="CUSTOM">Custom (manual controls)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sectionType === "CUSTOM" ? (
            <div className="grid gap-4 rounded-md border border-dashed p-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">GST %</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={section.gstRate}
                  onChange={(e) => onPatch({ gstRate: e.target.value })}
                  disabled={section.isLabourStyle}
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:mt-7">
                <input
                  type="checkbox"
                  checked={section.appliesDiscount}
                  onChange={(e) => onPatch({ appliesDiscount: e.target.checked })}
                  disabled={section.isLabourStyle}
                  className="h-4 w-4 rounded border-input"
                />
                Apply discount
              </label>
              <label className="flex items-center gap-2 text-sm md:mt-7">
                <input
                  type="checkbox"
                  checked={section.isLabourStyle}
                  onChange={(e) =>
                    onPatch({
                      isLabourStyle: e.target.checked,
                      gstRate: e.target.checked ? "0.00" : section.gstRate,
                      appliesDiscount: e.target.checked
                        ? false
                        : section.appliesDiscount,
                    })
                  }
                  className="h-4 w-4 rounded border-input"
                />
                Lump sum (no GST/discount)
              </label>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.lines.map((line, lIdx) => (
          <LineRow
            key={line.id}
            line={line}
            products={products}
            isOwner={isOwner}
            canRemove={section.lines.length > 1}
            onPatch={(patch) => onPatchLine(lIdx, patch)}
            onRemove={() => onRemoveLine(lIdx)}
          />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={onAddLine}>
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </CardContent>
    </Card>
  );
}

function LineRow({
  line,
  products,
  isOwner,
  canRemove,
  onPatch,
  onRemove,
}: {
  line: LineState;
  products: ProductOption[];
  isOwner: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<LineState>) => void;
  onRemove: () => void;
}) {
  const lineTotal = useMemo(
    () =>
      computeLineAmount({
        qty: numericOrZero(line.quantity),
        unitPrice: numericOrZero(line.unitPrice),
      }),
    [line.quantity, line.unitPrice],
  );

  return (
    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_80px_110px_60px_28px]">
      <div className="space-y-2 md:col-span-5">
        <ProductPicker
          products={products}
          value={line.productId}
          onPick={async (productId) => {
            if (!productId) {
              onPatch({ productId: null });
              return;
            }
            const res = await fetch(`/api/products/${productId}`);
            if (!res.ok) return;
            const data: {
              description: string;
              mrp: string | null;
              unitPrice: string;
              unit: string;
              costPrice: string | null;
            } = await res.json();
            onPatch({
              productId,
              description: data.description,
              mrp: data.mrp ?? "",
              unitPrice: data.unitPrice,
              unit: data.unit,
              costPriceSnapshot: data.costPrice,
            });
          }}
        />
        <Textarea
          value={line.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Description"
          rows={2}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Qty</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={line.quantity}
          onChange={(e) => onPatch({ quantity: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Unit price</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={line.unitPrice}
          onChange={(e) => onPatch({ unitPrice: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Unit</Label>
        <Input
          value={line.unit}
          onChange={(e) => onPatch({ unit: e.target.value })}
        />
      </div>
      <div className="flex items-end justify-end">
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remove line"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="md:col-span-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-dashed pt-2 text-xs tabular-nums">
        <span className="text-muted-foreground">
          {isOwner && line.costPriceSnapshot ? (
            <>
              Cost ₹{formatIndianNumber(new Decimal(line.costPriceSnapshot))} / {line.unit || "pcs"}
            </>
          ) : null}
        </span>
        <span>
          <span className="text-muted-foreground">
            {line.quantity || "0"} × ₹{line.unitPrice || "0"} ={" "}
          </span>
          <span className="font-semibold">
            ₹{formatIndianNumber(lineTotal)}
          </span>
        </span>
      </div>
    </div>
  );
}

function numericOrZero(s: string): string {
  if (!s || isNaN(Number(s))) return "0";
  return s;
}
