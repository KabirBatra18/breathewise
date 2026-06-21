/**
 * Phase 5 — T&C auto-assembly engine.
 * Architecture: memory/project_uths_verticals_architecture.md
 *
 * Given a quote's primary vertical + the set of verticals present in its
 * line items, return the ordered list of terms_clauses ids that should
 * be auto-included on the quote.
 *
 * Rule set:
 *   • verticalId IS NULL + isDefault=true  → universal (always include)
 *   • verticalId=primary    + isDefault=true → primary-vertical default
 *   • verticalId IN lineSet + isDefault=true → additional-vertical
 *                                              default (combined offers)
 *   • Manual opt-in clauses (isDefault=false) are NEVER auto-included
 *     by this helper — they're user-driven only.
 *
 * Order:
 *   1. Universal clauses, by sort_order
 *   2. Primary vertical's clauses, by sort_order
 *   3. Each additional vertical's clauses in alphabetical order of
 *      vertical brand name, by sort_order within each
 *
 * The caller (quote builder / server save action) then preserves
 * snapshots of title+body in quote_terms so historical quotes never
 * change wording when the underlying clause is edited.
 */

export interface AutoAssembleClause {
  id: string;
  title: string;
  isDefault: boolean;
  verticalId: string | null;
  sortOrder: number;
}

export interface AutoAssembleVertical {
  id: string;
  brandName: string;
}

export interface AutoAssembleInput {
  primaryVerticalId: string;
  // The set of distinct vertical ids referenced by the quote's line
  // items. Always includes primaryVerticalId; callers that haven't
  // computed per-line yet can pass [primaryVerticalId].
  lineVerticalIds: string[];
  clauses: AutoAssembleClause[];
  verticals: AutoAssembleVertical[];
}

export function assembleDefaultTermIds(input: AutoAssembleInput): string[] {
  const presentVerticalSet = new Set<string>([
    input.primaryVerticalId,
    ...input.lineVerticalIds,
  ]);

  // Bucket the default clauses by scope.
  const universal: AutoAssembleClause[] = [];
  const primary: AutoAssembleClause[] = [];
  const byOtherVertical = new Map<string, AutoAssembleClause[]>();

  for (const c of input.clauses) {
    if (!c.isDefault) continue;
    if (c.verticalId == null) {
      universal.push(c);
    } else if (c.verticalId === input.primaryVerticalId) {
      primary.push(c);
    } else if (presentVerticalSet.has(c.verticalId)) {
      const arr = byOtherVertical.get(c.verticalId) ?? [];
      arr.push(c);
      byOtherVertical.set(c.verticalId, arr);
    }
  }

  // Sort each bucket by sortOrder.
  const bySortOrder = (a: AutoAssembleClause, b: AutoAssembleClause) =>
    a.sortOrder - b.sortOrder;
  universal.sort(bySortOrder);
  primary.sort(bySortOrder);

  // Order the "other verticals" buckets by the vertical's brand name
  // (stable, predictable for combined-offer T&Cs).
  const verticalById = new Map(input.verticals.map((v) => [v.id, v]));
  const orderedOtherVerticals = Array.from(byOtherVertical.keys()).sort(
    (a, b) => {
      const an = verticalById.get(a)?.brandName ?? a;
      const bn = verticalById.get(b)?.brandName ?? b;
      return an.localeCompare(bn);
    },
  );

  const result: string[] = [];
  for (const c of universal) result.push(c.id);
  for (const c of primary) result.push(c.id);
  for (const vId of orderedOtherVerticals) {
    const bucket = byOtherVertical.get(vId)!;
    bucket.sort(bySortOrder);
    for (const c of bucket) result.push(c.id);
  }
  return result;
}
