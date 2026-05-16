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
  const currentValue = value ?? (allowEmpty ? SENTINEL : "");

  function handleChange(v: string | null) {
    if (v == null || v === SENTINEL) onChange(null);
    else onChange(v);
  }

  return (
    <>
      <Select
        value={currentValue || undefined}
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
      {/* Hidden input so the value submits with a plain <form action>. */}
      {name ? (
        <input type="hidden" name={name} value={value ?? ""} />
      ) : null}
    </>
  );
}
