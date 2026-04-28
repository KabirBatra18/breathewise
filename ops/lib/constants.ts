export const PRODUCT_CATEGORIES = [
  { value: "FRESH_AIR", label: "Fresh air" },
  { value: "EXHAUST", label: "Exhaust" },
  { value: "ACCESSORY", label: "Accessory" },
  { value: "LABOUR", label: "Labour" },
  { value: "CONSUMABLE", label: "Consumable" },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["value"];

export const ROLES = ["OWNER", "EMPLOYEE", "VIEWER"] as const;
export type RoleValue = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleValue, string> = {
  OWNER: "Owner",
  EMPLOYEE: "Employee",
  VIEWER: "Viewer",
};

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  NEGOTIATING: "Negotiating",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  ADVANCE_PAID: "Advance paid",
  SUPERSEDED: "Superseded",
};
