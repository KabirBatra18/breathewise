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

// Column widths matching the reference: 8 / 74 / 22 / 14 / 30 / 32 mm
const COL = {
  sno: "4.4%", // 8/180
  description: "41.1%", // 74/180
  qty: "12.2%", // 22/180
  unit: "7.8%", // 14/180
  unitPrice: "16.7%", // 30/180
  amount: "17.8%", // 32/180
};

// Two visual themes so a Proforma quote and a final Tax Invoice are
// instantly distinguishable when printed side-by-side. PI = BW sky-blue
// (preliminary, quoted). Invoice = emerald (settled, deliverable).
//
// IMPORTANT: keys must match QuoteDocumentKind exactly ("PI" | "INVOICE").
// A previous lower-case version meant THEMES[documentKind] was undefined
// and the PDF endpoint 500'd on every request — every Download PDF
// click was broken until this was fixed.
const THEMES = {
  PI: {
    text: "#0f172a",
    muted: "#6b7280",
    border: "#cbd5e1",
    accent: "#1e3a8a", // blue-900 (navy)
    accentSoft: "#dbeafe", // blue-100
    greyHeader: "#eff6ff", // blue-50
    greyTotal: "#dbeafe",
    grandTotal: "#1e3a8a",
    grandTotalText: "#ffffff",
  },
  INVOICE: {
    text: "#0f172a",
    muted: "#6b7280",
    border: "#cbd5e1",
    accent: "#047857", // emerald-700
    accentSoft: "#d1fae5", // emerald-100
    greyHeader: "#f0fdf4",
    greyTotal: "#d1fae5",
    grandTotal: "#047857",
    grandTotalText: "#ffffff",
  },
} as const;

type ThemeKey = keyof typeof THEMES;

// Backwards-compat alias for existing references in this file.
const colors = THEMES.PI;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: "15mm",
    paddingBottom: "15mm",
    paddingLeft: "15mm",
    paddingRight: "15mm",
    color: colors.text,
  },
  brand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 1,
  },
  brandLine2: {
    fontFamily: "Helvetica",
    fontSize: 9,
    textAlign: "center",
    color: colors.muted,
    marginTop: 2,
  },
  ruleAfterBrand: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: 10,
    marginBottom: 10,
  },
  docLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaCol: { flex: 1 },
  metaLabel: {
    color: colors.muted,
    marginBottom: 2,
  },
  metaValue: { fontFamily: "Helvetica-Bold" },
  sectionHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  table: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    borderLeftWidth: 0.5,
    borderLeftColor: colors.border,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
  },
  rowHeader: {
    flexDirection: "row",
    backgroundColor: colors.greyHeader,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
  },
  cellNoBorder: { paddingVertical: 4, paddingHorizontal: 4 },
  cellHeader: { fontFamily: "Helvetica-Bold" },
  rightAlign: { textAlign: "right" },
  centerAlign: { textAlign: "center" },
  totalsRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  totalsLabelCell: {
    flexGrow: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
    textAlign: "right",
  },
  totalsAmountCell: {
    width: COL.amount,
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: "right",
  },
  totalLabelGrey: {
    backgroundColor: colors.greyTotal,
    fontFamily: "Helvetica-Bold",
  },
  totalAmountGrey: {
    backgroundColor: colors.greyTotal,
    fontFamily: "Helvetica-Bold",
  },
  grandTotalBar: {
    flexDirection: "row",
    backgroundColor: colors.grandTotal,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginTop: 6,
  },
  grandLabel: {
    flexGrow: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "right",
  },
  grandAmount: {
    width: COL.amount,
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "right",
  },
  amountInWords: {
    marginTop: 8,
    marginBottom: 14,
    fontFamily: "Helvetica-Oblique",
    fontSize: 9,
  },
  savingsBar: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
  },
  termsTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  termsList: { marginTop: 2 },
  termsItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  termsNumber: {
    width: 18,
    fontFamily: "Helvetica-Bold",
  },
  termsBody: { flex: 1 },
  termsItemTitle: { fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: "10mm",
    left: "15mm",
    right: "15mm",
    textAlign: "center",
    fontSize: 8,
    color: colors.muted,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
});

export interface QuotePdfLine {
  sno: number;
  // Astberg model number / SKU, rendered bold above the description so
  // the client knows it's a "6 inch reducer" not a generic "reducer".
  // Null for labour and custom lines that have no product attached.
  sku?: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

export interface QuotePdfSection {
  letter: string;
  title: string;
  isLabourStyle: boolean;
  appliesDiscount: boolean;
  gstRate: string;
  discountPercent: string;
  lines: QuotePdfLine[];
  subtotal: string;
  discountAmount: string;
  netAfterDiscount: string;
  gstAmount: string;
  total: string;
  mrpSubtotal: string;
  totalDiscountVsMrp: string;
}

export type QuoteDocumentKind = "PI" | "INVOICE";

export interface QuotePdfData {
  quoteNumber: string;
  tierLabel: string;
  documentLabel: string; // e.g. "PROFORMA INVOICE" / "TAX INVOICE"
  documentKind?: QuoteDocumentKind; // defaults to PI; drives colour theme
  // Payment status snapshot, only meaningful for INVOICE variant.
  paymentStatus?: {
    received: string; // GST-incl money
    outstanding: string;
    label: "PAID" | "PARTIAL" | "DUE";
  };
  issueDate: string; // formatted, e.g. "23 April 2026"
  validityDays: number;
  client: {
    name: string;
    companyName?: string | null;
    addressLines: string[];
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
  };
  sections: QuotePdfSection[];
  grandTotal: string;
  totalMrpSubtotal: string;
  totalSavingsVsMrp: string;
  amountInWords: string;
  terms: { title: string; body: string }[];
  brand: {
    legalName: string;
    brandName: string;
    tagline: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
  };
}

function fmt(value: string | undefined | null, parens = false): string {
  if (value == null || value === "") return "";
  return formatIndianNumber(new Decimal(value), { negativeAsParens: parens });
}

function trimZeroes(qty: string): string {
  const n = new Decimal(qty);
  if (n.isInt()) return n.toFixed(0);
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function QuotePdfDocument({ data }: { data: QuotePdfData }) {
  const theme = THEMES[(data.documentKind ?? "PI") as ThemeKey];
  const isInvoice = (data.documentKind ?? "PI") === "INVOICE";
  return (
    <Document
      title={`${data.quoteNumber} — ${data.documentLabel}`}
      author={data.brand.legalName}
    >
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={[styles.brand, { color: theme.accent }]}>
            {data.brand.brandName.toUpperCase()}
          </Text>
          <Text style={styles.brandLine2}>by {data.brand.legalName}</Text>
          <Text style={styles.brandLine2}>{data.brand.tagline}</Text>
        </View>
        <View
          style={[
            styles.ruleAfterBrand,
            { borderBottomColor: theme.accent, borderBottomWidth: 1.5 },
          ]}
        />

        <View
          style={{
            backgroundColor: theme.accentSoft,
            borderWidth: 0.5,
            borderColor: theme.accent,
            paddingVertical: 6,
            marginBottom: 10,
          }}
        >
          <Text
            style={[
              styles.docLabel,
              { color: theme.accent, marginTop: 0, marginBottom: 0 },
            ]}
          >
            {data.documentLabel}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.metaLabel}>To:</Text>
            <Text style={styles.metaValue}>
              {data.client.name}
              {data.client.companyName ? ` · ${data.client.companyName}` : ""}
            </Text>
            {data.client.addressLines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            {data.client.phone ? <Text>{data.client.phone}</Text> : null}
            {data.client.gstin ? <Text>GSTIN: {data.client.gstin}</Text> : null}
          </View>
          <View style={[styles.metaCol, { textAlign: "right" }]}>
            <Text style={styles.metaLabel}>Quote #</Text>
            <Text style={styles.metaValue}>{data.quoteNumber}</Text>
            <Text style={[styles.metaLabel, { marginTop: 6 }]}>Date</Text>
            <Text style={styles.metaValue}>{data.issueDate}</Text>
            <Text style={[styles.metaLabel, { marginTop: 6 }]}>Validity</Text>
            <Text style={styles.metaValue}>{data.validityDays} days</Text>
          </View>
        </View>

        {data.sections.map((section, i) => {
          const isLast = i === data.sections.length - 1;
          return (
            <View key={section.letter} wrap={!isLast}>
              <Text
                style={[
                  styles.sectionHeader,
                  { color: theme.accent },
                ]}
              >
                Section {section.letter} — {section.title}
              </Text>
              <View
                style={[styles.table, { borderColor: theme.border }]}
              >
                <View style={styles.rowHeader}>
                  <Text style={[styles.cell, styles.cellHeader, styles.centerAlign, { width: COL.sno }]}>SNo</Text>
                  <Text style={[styles.cell, styles.cellHeader, { width: COL.description }]}>Description</Text>
                  <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COL.qty }]}>Qty</Text>
                  <Text style={[styles.cell, styles.cellHeader, styles.centerAlign, { width: COL.unit }]}>Unit</Text>
                  <Text style={[styles.cell, styles.cellHeader, styles.rightAlign, { width: COL.unitPrice }]}>Unit Price</Text>
                  <Text style={[styles.cellNoBorder, styles.cellHeader, styles.rightAlign, { width: COL.amount }]}>Amount</Text>
                </View>
                {section.lines.map((line) => {
                  const amount = new Decimal(line.unitPrice).mul(new Decimal(line.quantity));
                  return (
                    <View key={line.sno} style={styles.row} wrap={false}>
                      <Text style={[styles.cell, styles.centerAlign, { width: COL.sno }]}>{line.sno}</Text>
                      <Text style={[styles.cell, { width: COL.description }]}>
                        {line.sku ? (
                          <Text
                            style={{
                              fontFamily: "Helvetica-Bold",
                              color: theme.accent,
                            }}
                          >
                            {line.sku}
                            {"\n"}
                          </Text>
                        ) : null}
                        {line.description}
                      </Text>
                      <Text style={[styles.cell, styles.rightAlign, { width: COL.qty }]}>{trimZeroes(line.quantity)}</Text>
                      <Text style={[styles.cell, styles.centerAlign, { width: COL.unit }]}>{line.unit}</Text>
                      <Text style={[styles.cell, styles.rightAlign, { width: COL.unitPrice }]}>{fmt(line.unitPrice)}</Text>
                      <Text style={[styles.cellNoBorder, styles.rightAlign, { width: COL.amount }]}>{fmt(amount.toFixed(2))}</Text>
                    </View>
                  );
                })}

                {!section.isLabourStyle ? (
                  <>
                    <View style={styles.totalsRow}>
                      <Text style={styles.totalsLabelCell}>MRP (with GST)</Text>
                      <Text style={styles.totalsAmountCell}>{fmt(section.mrpSubtotal)}</Text>
                    </View>
                    {!new Decimal(section.totalDiscountVsMrp).isZero() ? (
                      <View style={styles.totalsRow}>
                        <Text style={styles.totalsLabelCell}>Total discount</Text>
                        <Text style={styles.totalsAmountCell}>
                          {fmt(`-${section.totalDiscountVsMrp}`, true)}
                        </Text>
                      </View>
                    ) : null}
                    {/* Tax breakdown shown below the section total for compliance. */}
                    <View style={styles.totalsRow}>
                      <Text style={styles.totalsLabelCell}>
                        Taxable value
                      </Text>
                      <Text style={styles.totalsAmountCell}>{fmt(section.netAfterDiscount)}</Text>
                    </View>
                    {!new Decimal(section.gstAmount).isZero() ? (
                      <View style={styles.totalsRow}>
                        <Text style={styles.totalsLabelCell}>
                          GST ({Number(section.gstRate).toFixed(0)}%)
                        </Text>
                        <Text style={styles.totalsAmountCell}>{fmt(section.gstAmount)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}

                <View style={styles.totalsRow}>
                  <Text
                    style={[
                      styles.totalsLabelCell,
                      styles.totalLabelGrey,
                      { backgroundColor: theme.greyTotal, color: theme.accent },
                    ]}
                  >
                    Section {section.letter} TOTAL
                  </Text>
                  <Text
                    style={[
                      styles.totalsAmountCell,
                      styles.totalAmountGrey,
                      { backgroundColor: theme.greyTotal, color: theme.accent },
                    ]}
                  >
                    {fmt(section.total)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View wrap={false}>
          <View
            style={[
              styles.grandTotalBar,
              {
                backgroundColor: theme.grandTotal,
                borderColor: theme.accent,
                borderWidth: 1,
              },
            ]}
          >
            <Text style={[styles.grandLabel, { color: theme.grandTotalText }]}>
              GRAND TOTAL
            </Text>
            <Text style={[styles.grandAmount, { color: theme.grandTotalText }]}>
              ₹ {fmt(data.grandTotal)}
            </Text>
          </View>
          {!new Decimal(data.totalSavingsVsMrp).isZero() ? (
            <Text
              style={[
                styles.savingsBar,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  color: theme.accent,
                },
              ]}
            >
              You save ₹ {fmt(data.totalSavingsVsMrp)} vs list price
            </Text>
          ) : null}
          <Text style={styles.amountInWords}>{data.amountInWords}</Text>

          {/* Tax-invoice-only blocks: payment status + signature line. */}
          {isInvoice && data.paymentStatus ? (
            <View
              style={{
                marginTop: 8,
                marginBottom: 6,
                paddingVertical: 6,
                paddingHorizontal: 8,
                backgroundColor:
                  data.paymentStatus.label === "PAID"
                    ? "#d1fae5"
                    : data.paymentStatus.label === "PARTIAL"
                      ? "#fef3c7"
                      : "#fee2e2",
                borderWidth: 0.5,
                borderColor:
                  data.paymentStatus.label === "PAID"
                    ? "#047857"
                    : data.paymentStatus.label === "PARTIAL"
                      ? "#b45309"
                      : "#b91c1c",
              }}
            >
              <Text
                style={{
                  fontFamily: "Helvetica-Bold",
                  fontSize: 11,
                  color:
                    data.paymentStatus.label === "PAID"
                      ? "#047857"
                      : data.paymentStatus.label === "PARTIAL"
                        ? "#b45309"
                        : "#b91c1c",
                }}
              >
                {data.paymentStatus.label === "PAID"
                  ? "PAID IN FULL"
                  : data.paymentStatus.label === "PARTIAL"
                    ? "PARTIALLY PAID"
                    : "PAYMENT DUE"}
              </Text>
              <Text style={{ fontSize: 9, marginTop: 2 }}>
                Received ₹ {fmt(data.paymentStatus.received)} ·
                {" "}
                Outstanding ₹ {fmt(data.paymentStatus.outstanding)}
              </Text>
            </View>
          ) : null}
          {isInvoice ? (
            <View
              style={{
                marginTop: 24,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <View style={{ width: "40%" }}>
                <View
                  style={{
                    borderTopWidth: 0.5,
                    borderTopColor: colors.text,
                    paddingTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 8, color: colors.muted }}>
                    Authorised signatory
                  </Text>
                  <Text style={{ fontSize: 8, color: colors.muted }}>
                    {data.brand.legalName}
                  </Text>
                </View>
              </View>
              <View style={{ width: "40%" }}>
                <View
                  style={{
                    borderTopWidth: 0.5,
                    borderTopColor: colors.text,
                    paddingTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 8, color: colors.muted }}>
                    Customer signature & date
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {data.terms.length > 0 ? (
          <View>
            <Text style={styles.termsTitle}>Terms &amp; Conditions</Text>
            <View style={styles.termsList}>
              {data.terms.map((t, i) => (
                <View key={i} style={styles.termsItem} wrap={false}>
                  <Text style={styles.termsNumber}>{i + 1}.</Text>
                  <View style={styles.termsBody}>
                    <Text style={styles.termsItemTitle}>{t.title}</Text>
                    <Text>{t.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {data.brand.legalName} · {data.brand.brandName}
        </Text>
      </Page>
    </Document>
  );
}

export function buildPdfDataFromQuote(input: {
  quoteNumber: string;
  tierLabel: string;
  documentLabel: string;
  issueDate: string;
  validityDays: number;
  discountPercent: string;
  client: QuotePdfData["client"];
  sections: Array<{
    letter: string;
    title: string;
    isLabourStyle: boolean;
    appliesDiscount: boolean;
    gstRate: string;
    lines: QuotePdfLine[];
    subtotal: string;
    discountAmount: string;
    netAfterDiscount: string;
    gstAmount: string;
    total: string;
    mrpSubtotal: string;
    totalDiscountVsMrp: string;
  }>;
  grandTotal: string;
  totalMrpSubtotal: string;
  totalSavingsVsMrp: string;
  terms: { title: string; body: string }[];
  brand: QuotePdfData["brand"];
  documentKind?: QuoteDocumentKind;
  paymentStatus?: QuotePdfData["paymentStatus"];
}): QuotePdfData {
  return {
    ...input,
    sections: input.sections.map((s) => ({ ...s, discountPercent: input.discountPercent })),
    amountInWords: amountInWords(new Decimal(input.grandTotal)),
    documentKind: input.documentKind,
    paymentStatus: input.paymentStatus,
  };
}
