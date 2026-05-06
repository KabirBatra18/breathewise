"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Edit3, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  upsertTermAction,
  deleteTermAction,
} from "@/app/(app)/terms/actions";

export interface TermRow {
  id: string;
  title: string;
  body: string;
  category: string;
  appliesTo: string;
  isDefault: boolean;
  sortOrder: number;
}

const APPLIES_TO_OPTIONS = [
  { value: "BOTH", label: "Both rough & precise" },
  { value: "ROUGH", label: "Rough only" },
  { value: "PRECISE", label: "Precise only" },
];

export function TermsList({ rows }: { rows: TermRow[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} clause{rows.length === 1 ? "" : "s"}. Defaults are
          auto-checked when creating a new quote — uncheck per quote if not
          needed.
        </p>
        <TermDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New clause
            </Button>
          }
        />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
          No clauses yet. Add your first one.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <TermCard key={r.id} term={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function TermCard({ term }: { term: TermRow }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{term.title}</p>
            {term.isDefault ? (
              <Badge variant="default" className="text-[10px]">
                <Star className="h-3 w-3" />
                Default
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-[10px]">
              {term.category}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {term.appliesTo === "BOTH"
                ? "Rough + Precise"
                : term.appliesTo === "ROUGH"
                  ? "Rough"
                  : "Precise"}
            </Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {term.body}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <TermDialog
            initial={term}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit clause">
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <form action={deleteTermAction}>
            <input type="hidden" name="id" value={term.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="Delete clause"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TermDialog({
  initial,
  trigger,
}: {
  initial?: TermRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState(initial?.category ?? "General");
  const [appliesTo, setAppliesTo] = useState(initial?.appliesTo ?? "BOTH");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);

  function submit() {
    startTransition(async () => {
      const res = await upsertTermAction({
        id: initial?.id,
        title,
        body,
        category,
        appliesTo: appliesTo as "ROUGH" | "PRECISE" | "BOTH",
        isDefault,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(initial ? "Clause updated." : "Clause added.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit clause" : "New clause"}</DialogTitle>
          <DialogDescription>
            Snapshotted onto the quote when saved — edits here don&apos;t
            change past quotes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Payment terms"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Full clause text — appears verbatim on the PDF."
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="General / Payment / Warranty …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select
                value={appliesTo}
                onValueChange={(v) => setAppliesTo(v ?? "BOTH")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_TO_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Auto-include this clause on every new quote
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : initial ? "Save changes" : "Add clause"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
