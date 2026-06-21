"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVerticalAction, type ActionResult } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Add vertical"}
    </Button>
  );
}

export function NewVerticalForm() {
  const [state, action] = useFormState<ActionResult | null, FormData>(
    createVerticalAction,
    null,
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Vertical added.");
      ref.current?.reset();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form
      ref={ref}
      action={action}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="space-y-2">
        <Label htmlFor="brandName">Brand name *</Label>
        <Input id="brandName" name="brandName" placeholder="UTHS Automation" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug *</Label>
        <Input id="slug" name="slug" placeholder="uths_automation" required pattern="[a-z0-9_]{2,40}" />
        <p className="text-xs text-muted-foreground">
          Lowercase, digits, underscores. Cannot be changed later.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input id="tagline" name="tagline" placeholder="Smart Home Integration" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brandColor">Brand colour</Label>
        <Input id="brandColor" name="brandColor" placeholder="#1e3a8a" pattern="#[0-9a-fA-F]{6}" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whatsappSignature">WhatsApp signature *</Label>
        <Input
          id="whatsappSignature"
          name="whatsappSignature"
          placeholder="UTHS Automation · Urban Tech Home Solutions"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="emailFromName">Email From name *</Label>
        <Input
          id="emailFromName"
          name="emailFromName"
          placeholder="UTHS Automation Team"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          placeholder="https://uths.in/automation"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="displayOrder">Display order</Label>
        <Input
          id="displayOrder"
          name="displayOrder"
          type="number"
          min={0}
          defaultValue={10}
        />
      </div>
      <div className="flex items-end">
        <Submit />
      </div>
    </form>
  );
}
