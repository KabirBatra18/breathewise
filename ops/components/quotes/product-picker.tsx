"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface ProductOption {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  mrp: string | null;
}

const FAMILY_LABELS: Record<string, string> = {
  AEE: "Inline Round Fans",
  AEB: "Inline Box Fans",
  AAF: "Axial Flow Fans",
  AHI: "Boosters",
  AFP: "Fresh Air Boxes",
  AFV: "Fresh Air Purifiers",
  ABF: "Air Box Fans",
  ASF: "Ultra Slim Fans",
  ASC: "Centrifugal Cabinet Fans",
  AOG: "Range Hoods",
  AGD: "Grilles",
  AAFD: "Aerofin Dampers",
  ABB: "Branch Boxes",
  ABC: "Beam Crossers",
  ASHT: "Portable Blowers",
  ASHTDUCT: "Portable Blower Ducts",
  ERV: "ERV / HRV (Energy Recovery)",
  HRV: "ERV / HRV (Energy Recovery)",
  AST: "Legacy / Custom",
};

function familyLabel(sku: string | null): string {
  if (!sku) return "Other";
  const upper = sku.toUpperCase();
  if (upper.startsWith("ASHT-DUCT")) return FAMILY_LABELS.ASHTDUCT;
  if (upper.startsWith("AFV-DP")) return FAMILY_LABELS.AFV;
  if (upper.startsWith("ERVRX") || upper.startsWith("ERV-")) return FAMILY_LABELS.ERV;
  const prefix = upper.split("-")[0];
  return FAMILY_LABELS[prefix] ?? "Other";
}

interface Group {
  label: string;
  items: ProductOption[];
}

function groupProducts(products: ProductOption[]): Group[] {
  const map = new Map<string, ProductOption[]>();
  for (const p of products) {
    const label = familyLabel(p.sku);
    const list = map.get(label) ?? [];
    list.push(p);
    map.set(label, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.sku ?? "").localeCompare(b.sku ?? ""));
  }
  return [...map.entries()]
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => {
      if (a.label === "Other") return 1;
      if (b.label === "Other") return -1;
      return a.label.localeCompare(b.label);
    });
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = products.find((p) => p.id === value);
  const groups = useMemo(() => groupProducts(products), [products]);

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

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <Command shouldFilter>
            <CommandInput ref={inputRef} placeholder="Search by name or SKU…" />
            <CommandList className="max-h-80">
              <CommandEmpty>No matches.</CommandEmpty>
              {value ? (
                <CommandGroup>
                  <CommandItem
                    value="__clear"
                    onSelect={() => {
                      onPick(null);
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">Clear selection</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {groups.map((g) => (
                <CommandGroup key={g.label} heading={g.label}>
                  {g.items.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.sku ?? ""}`}
                      onSelect={() => {
                        onPick(p.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === p.id ? "opacity-100" : "opacity-0",
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
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  );
}
