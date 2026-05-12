"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, RotateCcw, Trash2, X } from "lucide-react";
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
  ZERO,
  computeFinancials,
  computeLineAmount,
  computeQuoteTotals,
  computeQuoteTotalsForTarget,
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

type PriceMode = "DP" | "MRP";

interface LineState {
  id: string;
  productId: string | null;
  description: string;
  mrp: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  costPriceSnapshot: string | null;
  // Snapshots from the picker so the user can flip between Astberg DP
  // and MRP without re-fetching. Empty string if unavailable (e.g. line
  // loaded from an existing quote, or product has no MRP).
  dpRate: string;
  mrpRate: string;
  priceMode: PriceMode;
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
  dpRate: "",
  mrpRate: "",
  priceMode: "DP",
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
    /** Null for new model in auto mode; a string "₹X" when user has
        overridden. New-model quotes load this from the DB column
        discount_target_saving. */
    discountTargetSaving: string | null;
    sections: SectionState[];
    selectedTermIds: string[];
    showSavingsOnPdf: boolean;
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
  // The discount field is "live total" semantics: what the user sees
  // = autoSaving (line-mode driven) + discountExtra (user's manual add).
  // Toggling DP→MRP changes autoSaving → the displayed value AND the
  // grand total move together. The extra is what we *actually* store
  // (the absolute target written to the DB is autoSaving + extra at
  // save time). ZERO = no manual addition.
  const [discountExtra, setDiscountExtra] = useState<Decimal>(() => {
    // Recover extra from a saved absolute target. We re-derive
    // autoSaving from the initial sections (with 0% blanket, since the
    // new model uses 0%) and subtract.
    if (!initial?.discountTargetSaving) return ZERO;
    const initCalcNew: SectionInput[] = initial.sections.map((s) => ({
      discountPercent: "0",
      gstRate: s.gstRate,
      isLabourStyle: s.isLabourStyle,
      appliesDiscount: s.appliesDiscount,
      lines: s.lines.map((l) => ({
        qty: l.quantity,
        unitPrice: l.unitPrice,
        mrp: l.mrp ? l.mrp : null,
      })),
    }));
    const initAuto = computeQuoteTotalsForTarget(initCalcNew, null)
      .totalSavingsVsMrp;
    const extra = new Decimal(initial.discountTargetSaving).minus(initAuto);
    return extra.gt(0) ? extra : ZERO;
  });
  // Tracks whether the user has typed in the discount field. For new
  // quotes and quotes-already-on-the-new-model, this stays implicit
  // (isNewModel derives from initial state). For LEGACY quotes
  // (initial.discountTargetSaving == null but discountPercent > 0),
  // we keep the legacy %-blanket engine until the user touches the
  // field — then we migrate.
  const [hasOverridden, setHasOverridden] = useState<boolean>(false);
  // Raw input buffer for the discount field so keystrokes don't get
  // clobbered by the derived display (which snaps to autoSaving +
  // extra each render). Reset to null on blur.
  const [discountRawInput, setDiscountRawInput] = useState<string | null>(
    null,
  );
  const [sections, setSections] = useState<SectionState[]>(
    initial?.sections ?? [newSection(0), newSection(1), newSection(2)],
  );
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>(
    initial?.selectedTermIds ?? termsClauses.filter((t) => t.isDefault).map((t) => t.id),
  );
  // Whether the "You save vs list price" bar renders on the PDF.
  // Default off — small percentage savings (≤ a couple of percent)
  // look silly on a client-facing document. Toggle on when the
  // saving is meaningful enough to advertise.
  const [showSavingsOnPdf, setShowSavingsOnPdf] = useState(
    initial?.showSavingsOnPdf ?? false,
  );

  // ── Autosave to localStorage ─────────────────────────────────
  // Persists the entire builder state under a quote-id-keyed slot every
  // ~1s after a change. On reopen we offer to restore the unsaved draft
  // if anything is there. Cleared on successful Save.
  const draftKey = `bw:quote-draft:${initial?.id ?? "new"}`;
  const [restoreOffer, setRestoreOffer] = useState<
    | {
        savedAt: number;
        state: {
          clientId: string;
          issueDate: string;
          validityDays: number;
          discountPercent: string;
          sections: SectionState[];
          selectedTermIds: string[];
          showSavingsOnPdf?: boolean;
        };
      }
    | null
  >(null);
  const skipFirstAutosave = useRef(true);

  // Look for a saved draft on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        version?: number;
        savedAt?: number;
        state?: typeof restoreOffer extends { state: infer S } | null
          ? S
          : never;
      };
      if (parsed.version === 1 && parsed.savedAt && parsed.state) {
        setRestoreOffer({
          savedAt: parsed.savedAt,
          state: parsed.state as NonNullable<typeof restoreOffer>["state"],
        });
      }
    } catch {
      // localStorage unavailable / parse failure → ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on change (debounced). Skip the very first effect run so the
  // unchanged initial state doesn't immediately register as a draft.
  useEffect(() => {
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      try {
        const payload = {
          version: 1 as const,
          savedAt: Date.now(),
          state: {
            clientId,
            issueDate,
            validityDays,
            discountPercent,
            sections,
            selectedTermIds,
            showSavingsOnPdf,
          },
        };
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        // localStorage may be full or disabled — no-op.
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [
    clientId,
    issueDate,
    validityDays,
    discountPercent,
    sections,
    selectedTermIds,
    showSavingsOnPdf,
    draftKey,
  ]);

  function applyRestore() {
    if (!restoreOffer) return;
    const s = restoreOffer.state;
    setClientId(s.clientId);
    setIssueDate(s.issueDate);
    setValidityDays(s.validityDays);
    setDiscountPercent(s.discountPercent);
    setSections(s.sections);
    setSelectedTermIds(s.selectedTermIds);
    if (typeof s.showSavingsOnPdf === "boolean")
      setShowSavingsOnPdf(s.showSavingsOnPdf);
    setRestoreOffer(null);
    toast.success("Draft restored.");
  }

  function discardRestore() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setRestoreOffer(null);
  }

  function clearAutosave() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }

  // Are we on the new model?
  //   - Brand new quote (no `initial`)            → yes
  //   - Quote saved with target_saving set        → yes
  //   - Legacy quote where user has overridden    → yes (migrates on save)
  //   - Legacy quote, untouched                   → no (preserve legacy %)
  const isNewModel =
    !initial || initial.discountTargetSaving != null || hasOverridden;
  const effectiveSectionDiscountPct = isNewModel
    ? "0"
    : numericOrZero(discountPercent);

  // Two calc inputs so we can show the legacy display while still
  // knowing what the new-mode auto would be (needed to compute extra
  // correctly when the user types on a legacy quote and the engine
  // switches modes underneath).
  const calcInput = useMemo<SectionInput[]>(
    () =>
      sections.map((s) => ({
        discountPercent: effectiveSectionDiscountPct,
        gstRate: numericOrZero(s.gstRate),
        isLabourStyle: s.isLabourStyle,
        appliesDiscount: s.appliesDiscount,
        lines: s.lines.map((l) => ({
          qty: numericOrZero(l.quantity),
          unitPrice: numericOrZero(l.unitPrice),
          costPriceSnapshot: isOwner ? l.costPriceSnapshot : null,
          mrp: l.mrp ? l.mrp : null,
        })),
      })),
    [sections, effectiveSectionDiscountPct, isOwner],
  );
  const calcInputNew = useMemo<SectionInput[]>(
    () =>
      sections.map((s) => ({
        discountPercent: "0",
        gstRate: numericOrZero(s.gstRate),
        isLabourStyle: s.isLabourStyle,
        appliesDiscount: s.appliesDiscount,
        lines: s.lines.map((l) => ({
          qty: numericOrZero(l.quantity),
          unitPrice: numericOrZero(l.unitPrice),
          costPriceSnapshot: isOwner ? l.costPriceSnapshot : null,
          mrp: l.mrp ? l.mrp : null,
        })),
      })),
    [sections, isOwner],
  );
  // autoSavingNew = what the lines give with 0% blanket. This is the
  // "auto" baseline for the new model's offset semantics. autoSaving
  // (current-mode) is what the customer sees as natural saving and
  // drives the display when in legacy mode.
  const autoSavingNew = useMemo(
    () => computeQuoteTotalsForTarget(calcInputNew, null).totalSavingsVsMrp,
    [calcInputNew],
  );
  const autoSaving = useMemo(
    () => computeQuoteTotalsForTarget(calcInput, null).totalSavingsVsMrp,
    [calcInput],
  );

  // Engine target when in new mode: autoSavingNew + extra. The engine
  // re-derives its own autoSaving from sections — passing the absolute
  // target means delta = extra (independent of internal rounding).
  const engineTarget = useMemo(
    () => (isNewModel ? autoSavingNew.plus(discountExtra) : null),
    [isNewModel, autoSavingNew, discountExtra],
  );

  // What the user sees in the "Total saving from MRP" field. Live —
  // moves when DP/MRP toggles change autoSaving. When in legacy mode,
  // shows the legacy.saving (with %-blanket included).
  const displayedDiscount = useMemo(
    () => (isNewModel ? autoSavingNew.plus(discountExtra) : autoSaving),
    [isNewModel, autoSavingNew, discountExtra, autoSaving],
  );

  const totals = useMemo(
    () =>
      isNewModel
        ? computeQuoteTotalsForTarget(calcInputNew, engineTarget)
        : computeQuoteTotals(calcInput),
    [calcInput, calcInputNew, isNewModel, engineTarget],
  );
  const hasGoods = useMemo(
    () => calcInput.some((s) => !s.isLabourStyle),
    [calcInput],
  );
  const financials = useMemo(
    () =>
      isOwner
        ? computeFinancials(
            isNewModel ? calcInputNew : calcInput,
            isNewModel ? engineTarget : null,
          )
        : null,
    [calcInput, calcInputNew, isOwner, isNewModel, engineTarget],
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
      showSavingsOnPdf,
      // Server contract is the ABSOLUTE target saving from MRP. With
      // offset semantics in the UI we send autoSavingNew + extra so
      // the server's engine reproduces the displayed grand total
      // exactly. Legacy mode (user hasn't touched a legacy quote)
      // sends null so the server stays on the %-blanket path.
      discountTargetSaving: isNewModel
        ? autoSavingNew.plus(discountExtra).toFixed(2)
        : null,
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
      clearAutosave();
      toast.success(`Saved ${res.quoteNumber}.`);
      router.push(`/quotes/${res.id}`);
    });
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {restoreOffer ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-2">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Unsaved draft from {minutesAgo(restoreOffer.savedAt)}
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                  Your last changes were auto-saved locally. Restore them or
                  start fresh from what&apos;s on the server.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={discardRestore}
                aria-label="Discard auto-saved draft"
              >
                <X className="h-3.5 w-3.5" />
                Discard
              </Button>
              <Button size="sm" onClick={applyRestore}>
                Restore
              </Button>
            </div>
          </div>
        ) : null}
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
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="discountTargetSaving">
                Total discount from MRP (₹)
              </Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="discountTargetSaving"
                    type="number"
                    step="0.01"
                    min={0}
                    disabled={!hasGoods}
                    // While the user is mid-type we show their raw
                    // keystrokes; otherwise we show the derived live
                    // total (autoSavingNew + extra in new mode, or the
                    // legacy auto saving in legacy mode).
                    value={
                      discountRawInput !== null
                        ? discountRawInput
                        : displayedDiscount.toFixed(2)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setDiscountRawInput(raw);
                      setHasOverridden(true);
                      // Commit live so totals + grand total update on
                      // every keystroke. extra is the offset above the
                      // new-mode auto saving.
                      if (raw === "") {
                        setDiscountExtra(ZERO);
                        return;
                      }
                      const v = new Decimal(numericOrZero(raw));
                      const newExtra = v.minus(autoSavingNew);
                      setDiscountExtra(newExtra.gt(0) ? newExtra : ZERO);
                    }}
                    onBlur={() => {
                      // Release the raw input so the field re-binds to
                      // the derived display (which will reflect the
                      // committed extra, clamped to >= autoSavingNew).
                      setDiscountRawInput(null);
                    }}
                    className="pl-7"
                  />
                </div>
                {hasOverridden || discountExtra.gt(0) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDiscountExtra(ZERO);
                      setHasOverridden(false);
                      setDiscountRawInput(null);
                    }}
                    title="Reset to auto-computed savings"
                  >
                    Reset to auto
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasGoods ? (
                  <>
                    Lives at ₹{formatIndianNumber(autoSavingNew)} from your
                    current DP / MRP line modes
                    {discountExtra.gt(0) ? (
                      <>
                        {" "}
                        + ₹{formatIndianNumber(discountExtra)} extra you added
                      </>
                    ) : null}
                    . Toggling a line between DP and MRP shifts the auto
                    portion live — the grand total moves with it. Type a
                    higher number to give a bigger concession; the engine
                    allocates the extra pre-GST across goods sections.
                  </>
                ) : (
                  <>
                    No goods sections yet — there&apos;s no MRP to discount
                    from. Add a goods section first.
                  </>
                )}
              </p>
            </div>
            <label className="md:col-span-2 flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={showSavingsOnPdf}
                onChange={(e) => setShowSavingsOnPdf(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">
                  Show &ldquo;You save vs list price&rdquo; on the PDF
                </span>
                <span className="block text-xs text-muted-foreground">
                  Off by default — small savings (a couple of percent) read as
                  silly on a client document. Turn on when the discount is
                  meaningful enough to advertise.
                </span>
              </span>
            </label>
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
            {initial
              ? "After saving, use Download PDF in the header."
              : "After saving, you'll land on the draft page where you can Download PDF and Send to client."}
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
  // Coloured top border + subtle body tint give each section its own
  // visual identity — Goods sky, Labour amber, Custom slate — so the
  // user can tell at a glance which is which without reading the type.
  const sectionTone =
    sectionType === "GOODS"
      ? "border-t-sky-500"
      : sectionType === "LABOUR"
        ? "border-t-amber-500"
        : "border-t-slate-400";
  return (
    <Card className={`border-t-4 ${sectionTone}`}>
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
      <CardContent className="space-y-3 rounded-b-xl bg-muted/30 p-4">
        {section.lines.map((line, lIdx) => (
          <LineRow
            key={line.id}
            line={line}
            products={products}
            isOwner={isOwner}
            isLabourSection={section.isLabourStyle}
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
  isLabourSection,
  canRemove,
  onPatch,
  onRemove,
}: {
  line: LineState;
  products: ProductOption[];
  isOwner: boolean;
  isLabourSection: boolean;
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

  const hasModeChoice =
    line.dpRate !== "" &&
    line.mrpRate !== "" &&
    Number(line.mrpRate) - Number(line.dpRate) > 0.5;

  function bumpQty(delta: number) {
    const next = Math.max(0, Math.floor(Number(line.quantity || "0")) + delta);
    onPatch({ quantity: String(next) });
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow md:grid-cols-[1fr_140px_120px_60px_28px]">
      <div className="space-y-2 md:col-span-5">
        {isLabourSection ? null : (
          <ProductPicker
            products={products}
            value={line.productId}
            onPick={async (productId) => {
              if (!productId) {
                onPatch({
                  productId: null,
                  dpRate: "",
                  mrpRate: "",
                  priceMode: "DP",
                });
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
                dpRate: string;
                mrpRate: string | null;
                hasMrpUplift: boolean;
              } = await res.json();
              // Default to ASTBERG_LED (safe): DP rate. User can flip to MRP
              // for line items Astberg hasn't pre-quoted.
              onPatch({
                productId,
                description: data.description,
                mrp: data.mrp ?? "",
                unitPrice: data.unitPrice,
                unit: data.unit,
                costPriceSnapshot: data.costPrice,
                dpRate: data.dpRate,
                mrpRate: data.mrpRate ?? "",
                priceMode: "DP",
              });
            }}
          />
        )}
        <Textarea
          value={line.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder={
            isLabourSection
              ? "e.g. Installation, ducting labour, electrical work…"
              : "Description"
          }
          rows={2}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Qty</Label>
        <div className="flex items-stretch gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => bumpQty(-1)}
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            step="1"
            min={0}
            inputMode="numeric"
            value={line.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value })}
            className="text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => bumpQty(1)}
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Unit price (ex-GST)</Label>
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
      {hasModeChoice && !isLabourSection ? (
        <div className="md:col-span-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quoted at:</span>
          <div className="inline-flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() =>
                onPatch({ priceMode: "DP", unitPrice: line.dpRate })
              }
              className={
                "px-2 py-1 transition-colors " +
                (line.priceMode === "DP"
                  ? "bg-sky-600 text-white"
                  : "text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40")
              }
            >
              Astberg DP · ₹{formatIndianNumber(new Decimal(line.dpRate))}
            </button>
            <button
              type="button"
              onClick={() =>
                onPatch({ priceMode: "MRP", unitPrice: line.mrpRate })
              }
              className={
                "border-l px-2 py-1 transition-colors " +
                (line.priceMode === "MRP"
                  ? "bg-amber-500 text-white"
                  : "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40")
              }
            >
              MRP · ₹{formatIndianNumber(new Decimal(line.mrpRate))}
            </button>
          </div>
          <span
            className={
              line.priceMode === "DP"
                ? "text-sky-700 dark:text-sky-300"
                : "text-amber-700 dark:text-amber-400"
            }
          >
            {line.priceMode === "DP"
              ? "Astberg-quoted — keep at DP."
              : "Self-added — quoting up to MRP for max margin."}
          </span>
        </div>
      ) : null}
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

function minutesAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.max(0, Math.round(diffMs / 60_000));
  if (min < 1) return "just now";
  if (min === 1) return "1 minute ago";
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.round(min / 60);
  if (hr === 1) return "1 hour ago";
  if (hr < 24) return `${hr} hours ago`;
  const days = Math.round(hr / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
