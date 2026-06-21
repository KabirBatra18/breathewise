"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ClientOption {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
}

/**
 * Searchable client picker — replaces the previous <Select> for picking
 * a client on a quote. The Select was rendering the raw UUID in its
 * trigger (a Base UI quirk in this codebase) AND couldn't scale beyond
 * a few dozen clients before scrolling became unusable.
 *
 * This component:
 *   • Shows the selected client's name in the trigger (not the UUID)
 *   • Pops up a search-as-you-type box on click
 *   • Filters across name / company / phone
 *   • Click outside or press Esc closes
 *   • Selection commits to onChange and closes the popup
 */
export function ClientPicker({
  clients,
  value,
  onChange,
  placeholder = "Choose a client",
}: {
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value],
  );

  const triggerLabel = selected
    ? selected.companyName
      ? `${selected.name} · ${selected.companyName}`
      : selected.name
    : placeholder;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return clients;
    return clients.filter((c) => {
      const hay = `${c.name} ${c.companyName ?? ""} ${c.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clients, q]);

  // Close on outside-click + Esc.
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

  // Auto-focus the search input when opening; clear the query when
  // closing so re-opening starts fresh.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  function handlePick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="h-10 w-full justify-between text-left font-normal"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
          {triggerLabel}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company or phone…"
              className="h-8"
            />
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matches.
              </p>
            ) : (
              filtered.map((c) => {
                const isActive = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handlePick(c.id)}
                    className={
                      "block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted " +
                      (isActive ? "bg-muted/60" : "")
                    }
                  >
                    <p className="truncate font-medium">{c.name}</p>
                    {c.companyName || c.phone ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.companyName, c.phone].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            {filtered.length} match{filtered.length === 1 ? "" : "es"}
            {q ? ` for "${query}"` : ""} · {clients.length} total
          </div>
        </div>
      ) : null}
    </div>
  );
}
