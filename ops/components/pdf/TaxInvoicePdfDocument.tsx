import * as React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { Decimal } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";
import { amountInWords } from "@/lib/pricing/words";
import {
  INVOICE_TERMS,
  INVOICE_TERMS_HEADER,
} from "@/lib/invoice-terms";

/**
 * Tax-invoice PDF — Rule 46 / Section 31 of CGST Act compliant.
 *
 * Renders 3 pages with the same content, each marked with one of:
 *   ORIGINAL FOR RECIPIENT   ·   DUPLICATE FOR TRANSPORTER   ·   TRIPLICATE FOR SUPPLIER
 *
 * This is a SEPARATE file from QuotePdfDocument — the PI generator is
 * not touched. Visual styling intentionally matches the PI (same brand
 * navy accent, same column proportions) so a returning customer sees a
 * familiar document.
 *
 * Per-line GST breakdown:
 *   - Intra-state (supplier.state = buyer.state) → CGST + SGST columns
 *   - Inter-state                                → single IGST column
 */

// One source of truth for column widths (sums to 100%). Two layouts —
// intra-state shows CGST+SGST, inter-state collapses to one IGST col.
const COLS_INTRA = {
  sno: "4%",
  description: "26%",
  hsn: "7%",
  qty: "6%",
  unit: "5%",
  unitPrice: "10%",
  taxable: "12%",
  cgst: "10%",
  sgst: "10%",
  total: "10%",
};
const COLS_INTER = {
  sno: "4%",
  description: "29%",
  hsn: "7%",
  qty: "7%",
  unit: "5%",
  unitPrice: "11%",
  taxable: "13%",
  igst: "12%",
  total: "12%",
};

// Brand navy theme — matches PI's "PI" theme so the visual family
// holds.
const C = {
  text: "#0f172a",
  muted: "#6b7280",
  border: "#cbd5e1",
  accent: "#1e3a8a", // blue-900 navy
  accentSoft: "#dbeafe", // blue-100
  greyHeader: "#eff6ff",
  greyTotal: "#dbeafe",
  grandTotal: "#1e3a8a",
  grandTotalText: "#ffffff",
  copyTagBg: "#fef3c7", // amber-100, distinguishes invoice from PI
  copyTagText: "#92400e", // amber-800
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    paddingTop: "12mm",
    paddingBottom: "12mm",
    paddingLeft: "12mm",
    paddingRight: "12mm",
    color: C.text,
  },
  copyTag: {
    position: "absolute",
    top: "8mm",
    right: "12mm",
    backgroundColor: C.copyTagBg,
    color: C.copyTagText,
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    borderWidth: 0.5,
    borderColor: C.copyTagText,
  },
  brand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    textAlign: "center",
    letterSpacing: 1,
    color: C.accent,
  },
  brandLine2: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    textAlign: "center",
    color: C.muted,
    marginTop: 2,
  },
  docLabelBar: {
    backgroundColor: C.accentSoft,
    borderWidth: 0.5,
    borderColor: C.accent,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 8,
  },
  docLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "center",
    color: C.accent,
    letterSpacing: 0.5,
  },
  ruleAfterBrand: {
    borderBottomWidth: 1,
    borderBottomColor: C.accent,
    marginTop: 6,
    marginBottom: 6,
  },
  // Diagonal CANCELED stamp. react-pdf's transform support is limited
  // — rotate works on a positioned View. Sized + offset so the word
  // lands across the line table on A4 portrait without colliding with
  // the copy-tag in the top-right or the footer at the bottom.
  cancelStampWrap: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    alignItems: "center",
    transform: "rotate(-22deg)",
  },
  cancelStamp: {
    fontFamily: "Helvetica-Bold",
    fontSize: 88,
    letterSpacing: 8,
    color: "#dc2626", // red-600
    opacity: 0.18,
    borderWidth: 6,
    borderColor: "#dc2626",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  cancelBanner: {
    borderWidth: 0.5,
    borderColor: "#dc2626",
    backgroundColor: "#fee2e2", // red-100
    color: "#7f1d1d", // red-900
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    textAlign: "center",
  },
  partyRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  partyBox: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 5,
    marginRight: 3,
  },
  partyBoxLast: { marginRight: 0, marginLeft: 3 },
  partyTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: C.accent,
    marginBottom: 2,
  },
  partyLine: { marginBottom: 1 },
  partyMuted: { color: C.muted },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    borderLeftWidth: 0.5,
    borderLeftColor: C.border,
    marginBottom: 6,
  },
  metaCell: {
    width: "25%",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
    padding: 4,
  },
  metaLabel: { fontSize: 7, color: C.muted, marginBottom: 1 },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  table: {
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    borderLeftWidth: 0.5,
    borderLeftColor: C.border,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
  },
  rowHeader: {
    flexDirection: "row",
    backgroundColor: C.greyHeader,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  cell: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
  },
  cellNoBorder: { paddingVertical: 3, paddingHorizontal: 3 },
  cellHeader: { fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  rightAlign: { textAlign: "right" },
  centerAlign: { textAlign: "center" },
  totalsBar: {
    flexDirection: "row",
    backgroundColor: C.greyTotal,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  totalsLabel: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: C.accent,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
  },
  totalsAmount: {
    width: "12%",
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    color: C.accent,
  },
  grandBar: {
    flexDirection: "row",
    backgroundColor: C.grandTotal,
    borderWidth: 0.5,
    borderColor: C.accent,
    marginTop: 4,
  },
  grandLabel: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "right",
    color: C.grandTotalText,
  },
  grandAmount: {
    width: "20%",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    textAlign: "right",
    color: C.grandTotalText,
  },
  inWords: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: "Helvetica-Oblique",
    fontSize: 8.5,
  },
  declarationBox: {
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 4,
    marginBottom: 6,
    fontSize: 7.5,
  },
  signRow: {
    flexDirection: "row",
    marginTop: 16,
    justifyContent: "space-between",
  },
  signCol: { width: "45%" },
  signRule: {
    borderTopWidth: 0.5,
    borderTopColor: C.text,
    paddingTop: 3,
  },
  bankBox: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 4,
    marginBottom: 6,
  },
  bankCol: { flex: 1, paddingRight: 6 },
  bankLabel: { fontSize: 7, color: C.muted, marginBottom: 1 },
  bankValue: { fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  // T&Cs section — printed on the client copy only. Mirrors the PI's
  // terms styling so the customer sees a familiar layout.
  termsBlock: {
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  termsHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.accent,
    marginBottom: 4,
  },
  termsSubHeader: {
    fontSize: 7,
    color: C.muted,
    marginBottom: 6,
    fontStyle: "italic",
  },
  termsRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  termsNum: {
    width: 14,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  termsBodyCol: { flex: 1 },
  termsTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
  },
  termsText: {
    fontSize: 7.5,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    bottom: "8mm",
    left: "12mm",
    right: "12mm",
    textAlign: "center",
    fontSize: 7,
    color: C.muted,
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
});

export interface TaxInvoicePdfLine {
  sno: number;
  sectionLetter: string | null;
  sectionTitle: string | null;
  isLabourStyle: boolean;
  skuSnapshot: string | null;
  description: string;
  hsnCode: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxableValue: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  igstRate: string;
  igstAmount: string;
  lineTotal: string;
}

export interface TaxInvoicePdfData {
  copyLabel?: "ORIGINAL FOR RECIPIENT" | "DUPLICATE FOR TRANSPORTER" | "TRIPLICATE FOR SUPPLIER";
  invoiceNumber: string;
  issueDate: string; // formatted, e.g. "14 May 2026"
  /** Rule 46(c) date of removal. Set only when goods are dispatched
   *  on a date different from the invoice date. */
  dateOfRemoval?: string | null;
  placeOfSupply: string; // buyer's state
  placeOfSupplyCode: string;
  isInterState: boolean;
  reverseCharge: boolean;
  supplier: {
    legalName: string;
    brandName?: string | null;
    address?: string | null;
    state?: string | null;
    stateCode?: string | null;
    gstin?: string | null;
    pan?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  buyer: {
    name: string;
    company?: string | null;
    address?: string | null;
    state?: string | null;
    stateCode?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  /** Ship-to / delivery address when distinct from billing. When set,
   *  the PDF prints a "Ship To" block beside "Bill To" and the place
   *  of supply uses this state (driven by the convert action — engine
   *  has already flipped intra↔inter accordingly). */
  shipTo?: {
    address?: string | null;
    state?: string | null;
    stateCode?: string | null;
  } | null;
  lines: TaxInvoicePdfLine[];
  totals: {
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    /** Pre-round-off invoice value (sum of taxable + tax). */
    invoiceValue: string;
    /** ± adjustment so the printed grand total is a whole rupee. */
    roundOff?: string | null;
    /** Whole-rupee figure printed in the GRAND TOTAL bar. When unset,
     *  the PDF falls back to invoiceValue (legacy behaviour for any
     *  callers that haven't updated yet). */
    grandTotalRounded?: string | null;
  };
  bank?: {
    name?: string | null;
    account?: string | null;
    ifsc?: string | null;
    branch?: string | null;
  };
  notes?: string | null;
  /** Source quote number, printed as a reference for audit. */
  sourceQuoteNumber?: string | null;
  /** When true, every copy gets a diagonal CANCELED stamp + a small
   *  note above the lines that this invoice has been canceled. The
   *  invoice number stays printed (no gaps in the sequence). */
  canceled?: boolean;
  /** Optional formatted date string for the canceled-on line. */
  canceledOn?: string | null;
}

function fmt(value: string | undefined | null): string {
  if (value == null || value === "") return "—";
  const d = new Decimal(value);
  if (d.isZero()) return "—";
  return formatIndianNumber(d);
}

function trimQty(qty: string): string {
  const n = new Decimal(qty);
  if (n.isInt()) return n.toFixed(0);
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function InvoicePage({
  data,
  copyLabel,
  showTerms,
}: {
  data: TaxInvoicePdfData;
  copyLabel: NonNullable<TaxInvoicePdfData["copyLabel"]>;
  /** Render the legal T&Cs block at the bottom (after signatures,
   *  before footer). Only true for the single-copy client variant. */
  showTerms?: boolean;
}) {
  const isInter = data.isInterState;
  const COLS = isInter ? COLS_INTER : COLS_INTRA;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.copyTag}>{copyLabel}</Text>

      {/* ── Brand + doc label ───────────────────────────────────────── */}
      <View>
        <Text style={styles.brand}>
          {(data.supplier.brandName ?? "BREATHEWISE").toUpperCase()}
        </Text>
        <Text style={styles.brandLine2}>by {data.supplier.legalName}</Text>
      </View>
      <View style={styles.ruleAfterBrand} />
      <View style={styles.docLabelBar}>
        <Text style={styles.docLabel}>TAX INVOICE</Text>
      </View>

      {data.canceled ? (
        <Text style={styles.cancelBanner}>
          THIS INVOICE HAS BEEN CANCELED
          {data.canceledOn ? ` ON ${data.canceledOn.toUpperCase()}` : ""}
          . NUMBER PRESERVED FOR AUDIT.
        </Text>
      ) : null}

      {/* ── Supplier + Buyer ────────────────────────────────────────── */}
      <View style={styles.partyRow}>
        <View style={styles.partyBox}>
          <Text style={styles.partyTitle}>Supplier (Seller)</Text>
          <Text style={[styles.partyLine, { fontFamily: "Helvetica-Bold" }]}>
            {data.supplier.legalName}
          </Text>
          {data.supplier.address ? (
            <Text style={styles.partyLine}>{data.supplier.address}</Text>
          ) : null}
          {data.supplier.state ? (
            <Text style={styles.partyLine}>
              State: <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.supplier.state}</Text>
              {data.supplier.stateCode
                ? ` (Code: ${data.supplier.stateCode})`
                : ""}
            </Text>
          ) : null}
          {data.supplier.gstin ? (
            <Text style={styles.partyLine}>
              GSTIN: <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.supplier.gstin}</Text>
            </Text>
          ) : null}
          {data.supplier.pan ? (
            <Text style={styles.partyLine}>PAN: {data.supplier.pan}</Text>
          ) : null}
          {data.supplier.phone ? (
            <Text style={styles.partyLine}>Phone: {data.supplier.phone}</Text>
          ) : null}
          {data.supplier.email ? (
            <Text style={styles.partyLine}>{data.supplier.email}</Text>
          ) : null}
        </View>

        <View style={[styles.partyBox, styles.partyBoxLast]}>
          <Text style={styles.partyTitle}>
            {data.shipTo && (data.shipTo.address || data.shipTo.state)
              ? "Bill To"
              : "Recipient (Buyer)"}
          </Text>
          <Text style={[styles.partyLine, { fontFamily: "Helvetica-Bold" }]}>
            {data.buyer.name}
            {data.buyer.company ? ` · ${data.buyer.company}` : ""}
          </Text>
          {data.buyer.address ? (
            <Text style={styles.partyLine}>{data.buyer.address}</Text>
          ) : null}
          {data.buyer.state ? (
            <Text style={styles.partyLine}>
              State: <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.buyer.state}</Text>
              {data.buyer.stateCode ? ` (Code: ${data.buyer.stateCode})` : ""}
            </Text>
          ) : null}
          {data.buyer.gstin ? (
            <Text style={styles.partyLine}>
              GSTIN: <Text style={{ fontFamily: "Helvetica-Bold" }}>{data.buyer.gstin}</Text>
            </Text>
          ) : (
            <Text style={[styles.partyLine, styles.partyMuted]}>
              GSTIN: Unregistered
            </Text>
          )}
          {data.buyer.phone ? (
            <Text style={styles.partyLine}>Phone: {data.buyer.phone}</Text>
          ) : null}
        </View>
      </View>

      {/* ── Ship To block (only when delivery differs from billing) ─── */}
      {data.shipTo && (data.shipTo.address || data.shipTo.state) ? (
        <View
          style={{
            borderWidth: 0.5,
            borderColor: C.border,
            padding: 5,
            marginBottom: 6,
          }}
        >
          <Text style={styles.partyTitle}>Ship To (Place of Delivery)</Text>
          {data.shipTo.address ? (
            <Text style={styles.partyLine}>{data.shipTo.address}</Text>
          ) : null}
          {data.shipTo.state ? (
            <Text style={styles.partyLine}>
              State:{" "}
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                {data.shipTo.state}
              </Text>
              {data.shipTo.stateCode
                ? ` (Code: ${data.shipTo.stateCode})`
                : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Invoice meta grid ───────────────────────────────────────── */}
      <View style={styles.metaGrid}>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Invoice No.</Text>
          <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Invoice Date</Text>
          <Text style={styles.metaValue}>{data.issueDate}</Text>
        </View>
        {data.dateOfRemoval ? (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Date of Removal</Text>
            <Text style={styles.metaValue}>{data.dateOfRemoval}</Text>
          </View>
        ) : null}
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Place of Supply</Text>
          <Text style={styles.metaValue}>
            {data.placeOfSupply} ({data.placeOfSupplyCode})
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Supply Type</Text>
          <Text style={styles.metaValue}>
            {isInter ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Reverse Charge</Text>
          <Text style={styles.metaValue}>
            {data.reverseCharge ? "Yes" : "No"}
          </Text>
        </View>
        {data.sourceQuoteNumber ? (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Reference Quote</Text>
            <Text style={styles.metaValue}>{data.sourceQuoteNumber}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Line table ──────────────────────────────────────────────── */}
      <View style={styles.table}>
        <View style={styles.rowHeader}>
          <Text style={[styles.cell, styles.cellHeader, styles.centerAlign, { width: COLS.sno }]}>SNo</Text>
          <Text style={[styles.cell, styles.cellHeader, { width: COLS.description }]}>Description</Text>
          <Text style={[styles.cell, styles.cellHeader, styles.centerAlign, { width: COLS.hsn }]}>HSN/SAC</Text>
          <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS.qty }]}>Qty</Text>
          <Text style={[styles.cell, styles.cellHeader, styles.centerAlign, { width: COLS.unit }]}>Unit</Text>
          <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS.unitPrice }]}>Rate</Text>
          <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS.taxable }]}>Taxable</Text>
          {isInter ? (
            <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS_INTER.igst }]}>
              IGST{"\n"}<Text style={{ fontFamily: "Helvetica", fontSize: 6.5, color: C.muted }}>(rate/amt)</Text>
            </Text>
          ) : (
            <>
              <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS_INTRA.cgst }]}>
                CGST{"\n"}<Text style={{ fontFamily: "Helvetica", fontSize: 6.5, color: C.muted }}>(rate/amt)</Text>
              </Text>
              <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COLS_INTRA.sgst }]}>
                SGST{"\n"}<Text style={{ fontFamily: "Helvetica", fontSize: 6.5, color: C.muted }}>(rate/amt)</Text>
              </Text>
            </>
          )}
          <Text style={[styles.cellNoBorder, styles.cellHeader, styles.rightAlign, { width: COLS.total }]}>Total</Text>
        </View>

        {data.lines.map((line) => (
          <View key={line.sno} style={styles.row} wrap={false}>
            <Text style={[styles.cell, styles.centerAlign, { width: COLS.sno }]}>{line.sno}</Text>
            <Text style={[styles.cell, { width: COLS.description }]}>
              {line.skuSnapshot ? (
                <Text style={{ fontFamily: "Helvetica-Bold", color: C.accent }}>
                  {line.skuSnapshot}
                  {"\n"}
                </Text>
              ) : null}
              {line.description}
              {line.sectionTitle && !line.isLabourStyle ? (
                <Text style={{ color: C.muted, fontSize: 7 }}>
                  {"\n"}— {line.sectionTitle}
                </Text>
              ) : null}
            </Text>
            <Text style={[styles.cell, styles.centerAlign, { width: COLS.hsn }]}>
              {line.hsnCode ?? "—"}
            </Text>
            <Text style={[styles.cell, styles.rightAlign, { width: COLS.qty }]}>{trimQty(line.quantity)}</Text>
            <Text style={[styles.cell, styles.centerAlign, { width: COLS.unit }]}>{line.unit}</Text>
            <Text style={[styles.cell, styles.rightAlign, { width: COLS.unitPrice }]}>{fmt(line.unitPrice)}</Text>
            <Text style={[styles.cell, styles.rightAlign, { width: COLS.taxable }]}>{fmt(line.taxableValue)}</Text>
            {isInter ? (
              <Text style={[styles.cell, styles.rightAlign, { width: COLS_INTER.igst }]}>
                {Number(line.igstRate).toFixed(0)}%{"\n"}
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(line.igstAmount)}</Text>
              </Text>
            ) : (
              <>
                <Text style={[styles.cell, styles.rightAlign, { width: COLS_INTRA.cgst }]}>
                  {Number(line.cgstRate).toFixed(1)}%{"\n"}
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(line.cgstAmount)}</Text>
                </Text>
                <Text style={[styles.cell, styles.rightAlign, { width: COLS_INTRA.sgst }]}>
                  {Number(line.sgstRate).toFixed(1)}%{"\n"}
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{fmt(line.sgstAmount)}</Text>
                </Text>
              </>
            )}
            <Text style={[styles.cellNoBorder, styles.rightAlign, { width: COLS.total, fontFamily: "Helvetica-Bold" }]}>
              {fmt(line.lineTotal)}
            </Text>
          </View>
        ))}

        {/* Sub-totals row */}
        <View style={styles.totalsBar}>
          <Text style={styles.totalsLabel}>Sub-totals</Text>
          <Text style={styles.totalsAmount}>{fmt(data.totals.taxableValue)}</Text>
        </View>
        {isInter ? (
          <View style={styles.totalsBar}>
            <Text style={styles.totalsLabel}>Total IGST</Text>
            <Text style={styles.totalsAmount}>{fmt(data.totals.igst)}</Text>
          </View>
        ) : (
          <>
            <View style={styles.totalsBar}>
              <Text style={styles.totalsLabel}>Total CGST</Text>
              <Text style={styles.totalsAmount}>{fmt(data.totals.cgst)}</Text>
            </View>
            <View style={styles.totalsBar}>
              <Text style={styles.totalsLabel}>Total SGST</Text>
              <Text style={styles.totalsAmount}>{fmt(data.totals.sgst)}</Text>
            </View>
          </>
        )}
        {/* Round-off row — only when there's a non-zero adjustment. */}
        {data.totals.roundOff &&
        !new Decimal(data.totals.roundOff).isZero() ? (
          <View style={styles.totalsBar}>
            <Text style={styles.totalsLabel}>Round Off</Text>
            <Text style={styles.totalsAmount}>
              {new Decimal(data.totals.roundOff).gte(0) ? "+" : ""}
              {new Decimal(data.totals.roundOff).toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Grand total bar ─────────────────────────────────────────── */}
      <View style={styles.grandBar}>
        {/* Helvetica (PDF default) lacks the ₹ glyph, which renders as
            "¹" on print. Spell "INR" instead — matches formatRupees() and
            is the auditor-friendly form. */}
        <Text style={styles.grandLabel}>GRAND TOTAL (INR)</Text>
        <Text style={styles.grandAmount}>
          {fmt(data.totals.grandTotalRounded ?? data.totals.invoiceValue)}
        </Text>
      </View>
      <Text style={styles.inWords}>
        {amountInWords(
          new Decimal(data.totals.grandTotalRounded ?? data.totals.invoiceValue),
        )}
      </Text>

      {/* ── Bank details (only if any field is set) ─────────────────── */}
      {data.bank &&
      (data.bank.name || data.bank.account || data.bank.ifsc) ? (
        <View style={styles.bankBox} wrap={false}>
          <View style={styles.bankCol}>
            <Text style={styles.bankLabel}>Bank Name</Text>
            <Text style={styles.bankValue}>{data.bank.name ?? "—"}</Text>
          </View>
          <View style={styles.bankCol}>
            <Text style={styles.bankLabel}>Account No.</Text>
            <Text style={styles.bankValue}>{data.bank.account ?? "—"}</Text>
          </View>
          <View style={styles.bankCol}>
            <Text style={styles.bankLabel}>IFSC</Text>
            <Text style={styles.bankValue}>{data.bank.ifsc ?? "—"}</Text>
          </View>
          <View style={styles.bankCol}>
            <Text style={styles.bankLabel}>Branch</Text>
            <Text style={styles.bankValue}>{data.bank.branch ?? "—"}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Declarations ────────────────────────────────────────────── */}
      <View style={styles.declarationBox}>
        <Text>
          1. Whether tax is payable on reverse charge basis:{" "}
          <Text style={{ fontFamily: "Helvetica-Bold" }}>
            {data.reverseCharge ? "Yes" : "No"}
          </Text>
          .
        </Text>
        <Text>
          2. Certified that the particulars given above are true and correct.
        </Text>
        <Text>
          3. All disputes are subject to {data.supplier.state ?? "Delhi"}{" "}
          jurisdiction only. Goods once sold will not be taken back.
        </Text>
        {data.notes ? <Text>{"\n"}Note: {data.notes}</Text> : null}
      </View>

      {/* ── Signatures ──────────────────────────────────────────────── */}
      <View style={styles.signRow} wrap={false}>
        <View style={styles.signCol}>
          <View style={styles.signRule}>
            <Text style={{ fontSize: 7.5, color: C.muted }}>
              Customer signature &amp; seal
            </Text>
          </View>
        </View>
        <View style={styles.signCol}>
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: 8.5,
                fontFamily: "Helvetica-Bold",
                marginBottom: 18,
              }}
            >
              For {data.supplier.legalName}
            </Text>
            <View style={[styles.signRule, { width: "100%" }]}>
              <Text style={{ fontSize: 7.5, color: C.muted, textAlign: "right" }}>
                Authorised Signatory
              </Text>
            </View>
          </View>
        </View>
      </View>

      {showTerms ? (
        <View style={styles.termsBlock} wrap>
          <Text style={styles.termsHeader}>Terms &amp; Conditions</Text>
          <Text style={styles.termsSubHeader}>{INVOICE_TERMS_HEADER}</Text>
          {INVOICE_TERMS.map((t, i) => (
            <View key={t.title} style={styles.termsRow} wrap={false}>
              <Text style={styles.termsNum}>{i + 1}.</Text>
              <View style={styles.termsBodyCol}>
                <Text style={styles.termsText}>
                  <Text style={styles.termsTitle}>{t.title}.</Text> {t.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.footer} fixed>
        {data.supplier.legalName}
        {data.supplier.gstin ? ` · GSTIN ${data.supplier.gstin}` : ""}
        {" · "}This is a computer-generated tax invoice.
      </Text>

      {data.canceled ? (
        <View style={styles.cancelStampWrap} fixed>
          <Text style={styles.cancelStamp}>CANCELED</Text>
        </View>
      ) : null}
    </Page>
  );
}

export type TaxInvoicePdfVariant = "all-copies" | "client-only";

export function TaxInvoicePdfDocument({
  data,
  variant = "all-copies",
}: {
  data: TaxInvoicePdfData;
  /**
   * Which copies to render.
   *   all-copies  → Rule 48 default: 3 marked pages, no T&Cs.
   *                 What you ship to the customer + give the
   *                 transporter + retain for yourself.
   *   client-only → single page marked "ORIGINAL FOR RECIPIENT",
   *                 with the T&Cs section appended at the bottom.
   *                 What you email/WhatsApp the customer when you
   *                 don't need physical transporter/supplier copies.
   */
  variant?: TaxInvoicePdfVariant;
}) {
  if (variant === "client-only") {
    return (
      <Document
        title={`${data.invoiceNumber} — Tax Invoice (Client Copy)`}
        author={data.supplier.legalName}
      >
        <InvoicePage
          data={data}
          copyLabel="ORIGINAL FOR RECIPIENT"
          showTerms
        />
      </Document>
    );
  }

  // all-copies — Rule 48 default. T&Cs deliberately omitted: the
  // transporter and supplier copies don't need the customer recital.
  const copies: Array<NonNullable<TaxInvoicePdfData["copyLabel"]>> = [
    "ORIGINAL FOR RECIPIENT",
    "DUPLICATE FOR TRANSPORTER",
    "TRIPLICATE FOR SUPPLIER",
  ];
  return (
    <Document
      title={`${data.invoiceNumber} — Tax Invoice`}
      author={data.supplier.legalName}
    >
      {copies.map((c) => (
        <InvoicePage key={c} data={data} copyLabel={c} />
      ))}
    </Document>
  );
}
