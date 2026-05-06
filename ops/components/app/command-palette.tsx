"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, User, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchItem {
  type: "quote" | "client" | "product";
  id: string;
  href: string;
  label: string;
  sublabel?: string;
}

const ICONS: Record<SearchItem["type"], React.ComponentType<{ className?: string }>> = {
  quote: FileText,
  client: User,
  product: Package,
};

const TYPE_LABEL: Record<SearchItem["type"], string> = {
  quote: "Quote",
  client: "Client",
  product: "Product",
};

const MAX_RESULTS = 30;

export function CommandPalette({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd/Ctrl+K toggle (and Esc to close).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show recents-ish (first N) so the palette isn't blank on open.
      return items.slice(0, MAX_RESULTS);
    }
    const scored: { item: SearchItem; score: number }[] = [];
    for (const it of items) {
      const hay = `${it.label} ${it.sublabel ?? ""}`.toLowerCase();
      const i = hay.indexOf(q);
      if (i < 0) continue;
      // Lower score = better. Earlier match + shorter text wins.
      scored.push({ item: it, score: i + hay.length / 1000 });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, MAX_RESULTS).map((s) => s.item);
  }, [items, query]);

  function pick(item: SearchItem) {
    setOpen(false);
    router.push(item.href);
  }

  // Reset highlight when results change.
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlighted];
      if (r) pick(r);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search quotes, clients, products…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            results.map((r, i) => {
              const Icon = ICONS[r.type];
              const isActive = i === highlighted;
              return (
                <button
                  key={`${r.type}:${r.id}`}
                  type="button"
                  onClick={() => pick(r)}
                  onMouseMove={() => setHighlighted(i)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-muted"
                      : "hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.label}</p>
                    {r.sublabel ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.sublabel}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {TYPE_LABEL[r.type]}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
