"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Pencil, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  toggleVerticalActiveAction,
  updateVerticalAction,
  type ActionResult,
} from "./actions";

type Vertical = {
  id: string;
  slug: string;
  brandName: string;
  tagline: string | null;
  brandColor: string | null;
  whatsappSignature: string;
  emailFromName: string;
  websiteUrl: string | null;
  displayOrder: number;
  isActive: boolean;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function VerticalRowActions({ vertical }: { vertical: Vertical }) {
  const [editOpen, setEditOpen] = useState(false);
  const [editState, editAction] = useFormState<ActionResult | null, FormData>(
    updateVerticalAction,
    null,
  );
  const [isToggling, startToggle] = useTransition();

  useEffect(() => {
    if (editState?.ok) {
      toast.success(`${vertical.brandName} updated.`);
      setEditOpen(false);
    } else if (editState && !editState.ok) {
      toast.error(editState.error);
    }
  }, [editState, vertical.brandName]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          title="Edit branding"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          variant={vertical.isActive ? "outline" : "secondary"}
          size="sm"
          disabled={isToggling}
          title={
            vertical.isActive
              ? "Hide from the quote builder's vertical picker (existing quotes keep their branding)"
              : "Show in the quote builder's vertical picker again"
          }
          onClick={() => {
            startToggle(async () => {
              const fd = new FormData();
              fd.set("id", vertical.id);
              await toggleVerticalActiveAction(fd);
              toast.success(
                vertical.isActive
                  ? `${vertical.brandName} hidden from picker.`
                  : `${vertical.brandName} restored.`,
              );
            });
          }}
        >
          {vertical.isActive ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <Unlock className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {vertical.isActive ? "Hide" : "Restore"}
          </span>
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {vertical.brandName}</DialogTitle>
            <DialogDescription>
              Slug ({vertical.slug}) cannot be changed — it&apos;s referenced
              by archive folder paths and integration URLs.
            </DialogDescription>
          </DialogHeader>
          <form action={editAction} className="space-y-3">
            <input type="hidden" name="id" value={vertical.id} />
            <div className="space-y-2">
              <Label htmlFor={`bn-${vertical.id}`}>Brand name</Label>
              <Input
                id={`bn-${vertical.id}`}
                name="brandName"
                defaultValue={vertical.brandName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tag-${vertical.id}`}>Tagline</Label>
              <Input
                id={`tag-${vertical.id}`}
                name="tagline"
                defaultValue={vertical.tagline ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`color-${vertical.id}`}>Brand colour</Label>
              <Input
                id={`color-${vertical.id}`}
                name="brandColor"
                defaultValue={vertical.brandColor ?? ""}
                placeholder="#1e3a8a"
                pattern="#[0-9a-fA-F]{6}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`wa-${vertical.id}`}>WhatsApp signature</Label>
              <Input
                id={`wa-${vertical.id}`}
                name="whatsappSignature"
                defaultValue={vertical.whatsappSignature}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`efn-${vertical.id}`}>Email From name</Label>
              <Input
                id={`efn-${vertical.id}`}
                name="emailFromName"
                defaultValue={vertical.emailFromName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`url-${vertical.id}`}>Website URL</Label>
              <Input
                id={`url-${vertical.id}`}
                name="websiteUrl"
                type="url"
                defaultValue={vertical.websiteUrl ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`ord-${vertical.id}`}>Display order</Label>
              <Input
                id={`ord-${vertical.id}`}
                name="displayOrder"
                type="number"
                min={0}
                defaultValue={vertical.displayOrder}
              />
            </div>
            <DialogFooter>
              <SaveButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
