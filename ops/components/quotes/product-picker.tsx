"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  mrp: string | null;
}

// Subcategory → top-level Astberg PDF section. Mirrors
// db/data/astberg-catalog.json `categories[].name`. Anything not listed
// falls into "Other" (e.g. legacy AST-prefixed products).
const SUB_TO_TOP: Record<string, string> = {
  // Inline Fans
  "AF Series — Mix Flow Inline Fan": "Inline Fans",
  "ASMK Series — Mixed Flow with Silencer": "Inline Fans",
  "ATMK Series — Mixed Flow Fan": "Inline Fans",
  "AFB Series — Black Mix Flow Inline Fan": "Inline Fans",
  "AEE Series — Circular Duct Fan": "Inline Fans",
  "Typhoon Series": "Inline Fans",
  "AEC Series — Inline Fan with Speed Controller": "Inline Fans",
  // Specialty Fans
  "Micro Jet Fan": "Specialty Fans",
  "ADD Series — Mix Flow Silent Fan": "Specialty Fans",
  "AHT Series — Kitchen Fan": "Specialty Fans",
  "ASP/ASE Series — Ceiling Mount Fan": "Specialty Fans",
  "ASP Series — Ceiling Mount Fan (Alternative)": "Specialty Fans",
  "APT Series — Ceiling Mount Cassette Type Fan": "Specialty Fans",
  "ASL Series — Ceiling Mounted Exhaust with Light": "Specialty Fans",
  "AHA Series — Propeller Fan": "Specialty Fans",
  "AHI Series — Booster Fan": "Specialty Fans",
  "AFP Series — 2-IN-1 Fresh Air Box": "Specialty Fans",
  "AFV Series — Fresh Air Purifier": "Specialty Fans",
  "ASF — Ultra Slim Fan": "Specialty Fans",
  "AFV-DP Series — Cabinet Fan with Pre-Filter": "Specialty Fans",
  "ABF Series — Air Box Fan": "Specialty Fans",
  "ASHT Series — Portable Blower Fan with Duct": "Specialty Fans",
  "ARMD Series — Roof and Wall Exhaust Fan": "Specialty Fans",
  "AL Series — Exhaust Fan with Light": "Specialty Fans",
  // Domestic
  "Domestic Fans": "Domestic Fans",
  // Accessories
  "ADD — ABS Disk Diffuser with Volume Controller Valve": "Accessories",
  "APP — Round Air Outlet": "Accessories",
  "ASD — 3-Step Diffuser": "Accessories",
  "ARD — Rotating Grill Diffuser": "Accessories",
  "ARG — Round Grill": "Accessories",
  "AYJ — Y Joint PVC": "Accessories",
  "ASC — Outer Steel Cowl (Steel Finish, SS304)": "Accessories",
  "ASC-P — Outer Steel Cowl (Powder Coated SUS304, premium line)": "Accessories",
  "AWC — ABS Wall Cowl / PVC Long Pipe Cowl": "Accessories",
  "ASG — Outer Flat Grill Steel": "Accessories",
  "AVG — Varanda Grill": "Accessories",
  "APF — ABS Pre Filter": "Accessories",
  "AEB — ABS Ball Jet Nozzle": "Accessories",
  "AGD — Astberg Gravity Damper / Air Fresh Pipeline Check Valve": "Accessories",
  "APB — Air Purification Box (UV Light Filter Box)": "Accessories",
  "AVC — ABS Air Volume Control Valve": "Accessories",
  "ABC — Beam Crosser Lantel Device Adaptor": "Accessories",
  "ALM — Aluminium Flexible Duct (3 metres)": "Accessories",
  "AFD — Insulated PVC Flexible Duct": "Accessories",
  "ARD — ABS Reducer": "Accessories",
  "ANR — Noise Reducer": "Accessories",
  "ACL — PVC Clamps": "Accessories",
  "ASL — Steel Grip Clamp": "Accessories",
  "AOG — ABS Oblique Air Grill": "Accessories",
  "AFG — ABS Fancy Air Grill": "Accessories",
  "APE — Double Wall Corrugated Flexible Duct (Pipe)": "Accessories",
  "ABB — Branch Box": "Accessories",
  "PE — Pipe Connectors": "Accessories",
  // ERV / HRV
  "ASF / AT Series": "ERV / HRV",
  "AHE-D Series — Pre-Filter ERV (compact)": "ERV / HRV",
  "AHE-THP Series — HEPA + Carbon ERV": "ERV / HRV",
  "AHE-TH Series — Pre-Filter ERV (mid)": "ERV / HRV",
  "AHE-THB Series — Pre-Filter ERV (large)": "ERV / HRV",
  "AHC Series — With Return Air Filter": "ERV / HRV",
  "Darwin Series — IFD Filters": "ERV / HRV",
};

const TOP_ORDER = [
  "Inline Fans",
  "Specialty Fans",
  "Domestic Fans",
  "Accessories",
  "ERV / HRV",
  "Other",
] as const;

// Each top-level category has a distinct hue so the user can recognise
// the section at a glance — the inactive chip shows that hue as a tiny
// dot, the active chip uses it as a solid background, and the selected
// subcategory in the left pane gets a matching coloured left-border.
// Class names must be full literals so Tailwind's JIT picks them up.
const TOP_STYLE: Record<
  string,
  { active: string; dot: string; borderL: string }
> = {
  "Inline Fans": {
    active: "bg-sky-600 text-white border-sky-600",
    dot: "bg-sky-500",
    borderL: "border-l-sky-500",
  },
  "Specialty Fans": {
    active: "bg-violet-600 text-white border-violet-600",
    dot: "bg-violet-500",
    borderL: "border-l-violet-500",
  },
  "Domestic Fans": {
    active: "bg-rose-600 text-white border-rose-600",
    dot: "bg-rose-500",
    borderL: "border-l-rose-500",
  },
  Accessories: {
    active: "bg-slate-700 text-white border-slate-700",
    dot: "bg-slate-500",
    borderL: "border-l-slate-500",
  },
  "ERV / HRV": {
    active: "bg-emerald-600 text-white border-emerald-600",
    dot: "bg-emerald-500",
    borderL: "border-l-emerald-500",
  },
  Other: {
    active: "bg-zinc-700 text-white border-zinc-700",
    dot: "bg-zinc-400",
    borderL: "border-l-zinc-400",
  },
};

function topOf(sub: string | null): string {
  if (!sub) return "Other";
  return SUB_TO_TOP[sub] ?? "Other";
}

interface SubGroup {
  sub: string;
  top: string;
  items: ProductOption[];
}

function formatINR0(s: string | null): string {
  if (!s) return "";
  const n = Number(s);
  if (isNaN(n)) return s;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function ProductPicker({
  products,
  value,
  onPick,
}: {
  products: ProductOption[];
  value: string | null;
  onPick: (productId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [topFilter, setTopFilter] = useState<string>("Inline Fans");
  const [selectedSubcat, setSelectedSubcat] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = products.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const allGroups: SubGroup[] = useMemo(() => {
    const map = new Map<string, ProductOption[]>();
    for (const p of products) {
      const key = p.subcategory ?? "Legacy / Other";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? ""));
    }
    return [...map.entries()]
      .map(([sub, items]) => ({ sub, top: topOf(sub), items }))
      .sort((a, b) => a.sub.localeCompare(b.sub));
  }, [products]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of allGroups) counts[g.top] = (counts[g.top] ?? 0) + g.items.length;
    return counts;
  }, [allGroups]);

  const visibleChips = useMemo(
    () => TOP_ORDER.filter((t) => (chipCounts[t] ?? 0) > 0),
    [chipCounts],
  );

  const subsInChip = useMemo(
    () => allGroups.filter((g) => g.top === topFilter),
    [allGroups, topFilter],
  );

  useEffect(() => {
    if (!open || isSearching) return;
    if (!selectedSubcat || !subsInChip.find((g) => g.sub === selectedSubcat)) {
      setSelectedSubcat(subsInChip[0]?.sub ?? null);
    }
  }, [open, isSearching, subsInChip, selectedSubcat]);

  const detailItems =
    subsInChip.find((g) => g.sub === selectedSubcat)?.items ?? [];

  const searchGroups = useMemo(() => {
    if (!isSearching) return [];
    return allGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((p) =>
          `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [allGroups, isSearching, q]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When the picker opens, scroll its trigger into view so the popup
  // (which absolutely-positions below the trigger) doesn't hang off
  // the visible page area. Without this, picking a product on a line
  // near the bottom of the page would put half the popup offscreen
  // and wheel events would scroll the page instead of the items pane.
  useEffect(() => {
    if (open) {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  function handlePick(productId: string | null) {
    onPick(productId);
    setOpen(false);
  }

  const triggerLabel = selected
    ? selected.sku
      ? `${selected.sku} — ${selected.name}`
      : selected.name
    : "Pick a product (or type to search)";

  return (
    <div ref={containerRef} className="relative w-full">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full justify-between text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
      </Button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          {/* Search */}
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or SKU…"
              className="h-8"
            />
          </div>
          {value ? (
            <button
              type="button"
              onClick={() => handlePick(null)}
              className="block w-full border-b px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Clear selection
            </button>
          ) : null}

          {isSearching ? (
            <div className="h-[min(420px,60vh)] overflow-y-auto overscroll-contain">
              {searchGroups.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches.
                </p>
              ) : (
                searchGroups.map((g) => {
                  const sty = TOP_STYLE[g.top] ?? TOP_STYLE.Other;
                  return (
                    <div key={g.sub}>
                      <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <span
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sty.dot)}
                          aria-hidden
                        />
                        <span className="truncate">{g.sub}</span>
                      </div>
                      {g.items.map((p) => (
                        <ItemRow
                          key={p.id}
                          p={p}
                          active={value === p.id}
                          onPick={() => handlePick(p.id)}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
              {/* Chips */}
              <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
                {visibleChips.map((t) => {
                  const sty = TOP_STYLE[t] ?? TOP_STYLE.Other;
                  const isActive = t === topFilter;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTopFilter(t)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                        isActive
                          ? sty.active
                          : "border-transparent bg-muted/40 hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          isActive ? "bg-white/80" : sty.dot,
                        )}
                        aria-hidden
                      />
                      <span>{t}</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          isActive ? "opacity-80" : "opacity-60",
                        )}
                      >
                        {chipCounts[t]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Master-detail body — fixed pixel heights via inline style
                  so overflow-y-auto absolutely engages. CSS grid gives
                  predictable two-column layout on md+ and stacked on
                  mobile, with no flex-stretch surprises. */}
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
                <div className="h-[min(140px,25vh)] overflow-y-auto overscroll-contain border-b md:h-[min(360px,55vh)] md:border-b-0 md:border-r">
                  {subsInChip.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No subcategories.
                    </p>
                  ) : (
                    subsInChip.map((g) => {
                      const isSel = selectedSubcat === g.sub;
                      const sty = TOP_STYLE[g.top] ?? TOP_STYLE.Other;
                      return (
                        <button
                          key={g.sub}
                          type="button"
                          onClick={() => setSelectedSubcat(g.sub)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2 text-left text-xs transition-colors",
                            isSel
                              ? cn("bg-muted font-medium", sty.borderL)
                              : "border-l-transparent hover:bg-muted/40",
                          )}
                        >
                          <span className="truncate">{g.sub}</span>
                          <span className="shrink-0 tabular-nums opacity-60">
                            {g.items.length}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="h-[min(360px,55vh)] overflow-y-auto overscroll-contain">
                  {detailItems.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Pick a series on the left.
                    </p>
                  ) : (
                    detailItems.map((p) => (
                      <ItemRow
                        key={p.id}
                        p={p}
                        active={value === p.id}
                        onPick={() => handlePick(p.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  p,
  active,
  onPick,
}: {
  p: ProductOption;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
          : "hover:bg-muted",
      )}
    >
      <Check
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <span className="truncate text-sm">{p.name}</span>
        {p.sku ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {p.sku}
          </span>
        ) : null}
      </div>
      {p.mrp ? (
        <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
          MRP ₹{formatINR0(p.mrp)}
        </span>
      ) : null}
    </button>
  );
}
