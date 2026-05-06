import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { auditLog } from "@/db/schema";

/**
 * Append a single audit-log entry. Safe to call from any server action;
 * never blocks the calling action even if the audit insert fails.
 *
 * Conventions:
 *   action: "QUOTE_SAVE" | "QUOTE_SEND" | "QUOTE_ACCEPT" |
 *           "QUOTE_REJECT" | "QUOTE_DUPLICATE" | "QUOTE_ADDENDUM" |
 *           "PAYMENT_ADD" | "PAYMENT_DELETE" | "SETTINGS_SAVE" |
 *           "TERM_UPSERT" | "TERM_DELETE"
 *   entityType: "quote" | "payment" | "term" | "settings" …
 */
export async function audit(input: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      const h = headers();
      const fwd = h.get("x-forwarded-for");
      ip = fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip");
      ua = h.get("user-agent");
    } catch {
      // headers() may throw if called outside a request context; ignore.
    }

    await db.insert(auditLog).values({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      ipAddress: ip ?? undefined,
      userAgent: ua ?? null,
    });
  } catch (err) {
    // Audit must never break the user-facing action.
    console.error("[audit] failed:", err);
  }
}
