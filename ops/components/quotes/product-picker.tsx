"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
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

function formatINR0(s: string | null): string {
  if (!s) return "";
  const n = Number(s);
  if (isNaN(n)) return s;
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

interface Group {
  label: string;
  items: ProductOption[];
}

function groupProducts(products: ProductOption[]): Group[] {
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
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => {
      if (a.label === "Legacy / Other") return 1;
      if (b.label === "Legacy / Other") return -1;
      return a.label.localeCompare(b.label);
    });
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = products.find((p) => p.id === value);

  const allGroups = useMemo(() => groupProducts(products), [products]);
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const visibleGroups = useMemo(() => {
    if (!isSearching) return allGroups;
    return allGroups
      .map((g) => ({
        label: g.label,
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

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
    setExpanded(new Set());
  }, [open]);

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or SKU…"
              className="h-8"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {value ? (
              <button
                type="button"
                onClick={() => handlePick(null)}
                className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                <span>Clear selection</span>
              </button>
            ) : null}
            {visibleGroups.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matches.
              </p>
            ) : null}
            {visibleGroups.map((g) => {
              const isExpanded = isSearching || expanded.has(g.label);
              return (
                <div key={g.label} className="border-t first:border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSearching) toggleGroup(g.label);
                    }}
                    aria-expanded={isExpanded}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-sm transition-colors",
                      isSearching
                        ? "cursor-default"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      )}
                      <span className="truncate font-medium">{g.label}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {g.items.length}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div>
                      {g.items.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePick(p.id)}
                          className="flex w-full items-start gap-2 px-3 py-2 pl-9 text-left text-sm hover:bg-muted"
                        >
                          <Check
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0",
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
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
