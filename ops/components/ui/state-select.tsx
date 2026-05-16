"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDIAN_STATES } from "@/lib/gst/state-codes";

/**
 * Canonical Indian-state picker. Always emits exact spellings that
 * deriveStateCode() can map to a 2-digit code, so the user can never
 * type a non-recognised variant (e.g. "Delhi NCR", "U.P.") and have
 * the convert action silently bail.
 *
 * The select shows "State name · code" for clarity. Big NCR states +
 * common destinations appear first; the rest are alphabetical.
 *
 * Pass value as a state NAME (not the code). onChange returns the
 * state name. Use deriveStateCode() at the server to get the code.
 */
export function StateSelect({
  value,
  onChange,
  placeholder = "Select state…",
  disabled,
  allowEmpty = true,
  emptyLabel = "— None —",
  id,
  name,
}: {
  value: string | null;
  onChange: (state: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Whether to include a "None" option to clear the selection. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** For form submission via FormData. The select renders a hidden
   *  input with this name so plain <form action> works. */
  id?: string;
  name?: string;
}) {
  // The Radix-style select expects a non-empty string for "no value".
  // We use the sentinel "__none__" internally and translate at the
  // boundary. Empty string would collide with state names.
  const SENTINEL = "__none__";

  // Case-insensitive normalisation. Legacy rows often have "DELHI" or
  // "delhi" — without this, the Select's value wouldn't match any
  // SelectItem (which use Title-Case names) and Base UI would crash
  // with 'Application error: a client-side exception has occurred'.
  const canonicalValue = (() => {
    if (!value) return null;
    const lower = value.trim().toLowerCase();
    const match = INDIAN_STATES.find((s) => s.name.toLowerCase() === lower);
    return match?.name ?? null;
  })();
  // Pick a select value that's GUARANTEED to exist in the rendered
  // items, otherwise leave it `undefined` (placeholder shown). Passing
  // a value that has no matching SelectItem is what crashes Base UI.
  const currentValue: string | undefined = canonicalValue
    ? canonicalValue
    : allowEmpty
      ? SENTINEL
      : undefined;

  function handleChange(v: string | null) {
    if (v == null || v === SENTINEL) onChange(null);
    else onChange(v);
  }

  return (
    <>
      <Select
        value={currentValue}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value={SENTINEL}>
              <span className="text-muted-foreground">{emptyLabel}</span>
            </SelectItem>
          ) : null}
          {INDIAN_STATES.map((s) => (
            <SelectItem key={s.code} value={s.name}>
              {s.name}{" "}
              <span className="text-muted-foreground">· {s.code}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Hidden input so the value submits with a plain <form action>.
          Always submit the CANONICAL name so legacy "DELHI"/"delhi"
          rows get cleaned to "Delhi" on next save. */}
      {name ? (
        <input
          type="hidden"
          name={name}
          value={canonicalValue ?? value ?? ""}
        />
      ) : null}
    </>
  );
}
