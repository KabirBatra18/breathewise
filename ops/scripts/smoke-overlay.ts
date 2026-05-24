/**
 * Smoke test for the overlay helper. Renders both templates with
 * dummy data into /tmp so we can eyeball the output before pushing.
 *
 * Run: tsx scripts/smoke-overlay.ts
 */

import fs from "node:fs/promises";
import { fillTemplate } from "../lib/pdf-templates/overlay";

async function main() {
  // Services Agreement
  const agreement = await fillTemplate("services-agreement", [
    { page: 0, x: 156,   y: 632.5, text: "24 May 2026",       maxWidth: 380 },
    { page: 0, x: 56,    y: 604.3, text: "BW/Q/2627/0042",    maxWidth: 480 },
    { page: 0, x: 124,   y: 515.0, text: "Aman Verma · Verma Holdings", maxWidth: 410 },
    { page: 0, x: 137,   y: 498.9, text: "B-12, Sector 27, Gurgaon, Haryana 122002", maxWidth: 395 },
    { page: 0, x: 166,   y: 482.8, text: "Plot 88, Sushant Lok-II, Gurgaon, Haryana", maxWidth: 365 },
    { page: 4, x: 92,    y: 197.7, text: "Kabir Batra",       maxWidth: 200 },
    { page: 4, x: 121,   y: 183.2, text: "Proprietor",        maxWidth: 200 },
    { page: 4, x: 86,    y: 168.7, text: "24 May 2026",       maxWidth: 200 },
    { page: 4, x: 90,    y: 154.2, text: "New Delhi",         maxWidth: 200 },
    { page: 4, x: 296.6, y: 250.2, text: "Aman Verma · Verma Holdings", maxWidth: 220 },
  ]);
  await fs.writeFile("/tmp/smoke-agreement.pdf", agreement);
  console.log("✓ /tmp/smoke-agreement.pdf");

  // Handover Certificate
  const cert = await fillTemplate("handover-certificate", [
    { page: 0, x: 195, y: 546.8, text: "24 May 2026",                 maxWidth: 340 },
    { page: 0, x: 195, y: 519.0, text: "BW/INV/2627/0017",             maxWidth: 340 },
    { page: 0, x: 195, y: 491.3, text: "10 May 2026",                  maxWidth: 340 },
    { page: 0, x: 195, y: 469.3, text: "Aman Verma · Verma Holdings",  maxWidth: 340 },
    { page: 0, x: 195, y: 447.3, text: "+91 98765 43210 · aman@verma.co", maxWidth: 340 },
    { page: 0, x: 195, y: 425.3, text: "Plot 88, Sushant Lok-II, Gurgaon", maxWidth: 340 },
    // Equipment table — 3 rows (mirror route: SKU-only in Model col)
    { page: 0, x: 100, y: 256.4, text: "AST-ERV-D250-AC",  maxWidth: 135, fontSize: 10 },
    { page: 0, x: 245, y: 256.4, text: "2 pcs",            maxWidth: 30,  fontSize: 10 },
    { page: 0, x: 100, y: 234.4, text: "AST-FAN-LF-150",   maxWidth: 135, fontSize: 10 },
    { page: 0, x: 245, y: 234.4, text: "4 pcs",            maxWidth: 30,  fontSize: 10 },
    { page: 0, x: 100, y: 212.4, text: "AST-FIL-HEPA13",   maxWidth: 135, fontSize: 10 },
    { page: 0, x: 245, y: 212.4, text: "6 pcs",            maxWidth: 30,  fontSize: 10 },
    // Signature page (index 2)
    { page: 2, x: 59.1, y: 559.3, text: "Aman Verma · Verma Holdings", maxWidth: 230 },
    { page: 2, x: 331,  y: 506.8, text: "Kabir Batra", maxWidth: 200 },
    { page: 2, x: 326,  y: 492.3, text: "24 May 2026", maxWidth: 200 },
    { page: 2, x: 329,  y: 477.8, text: "New Delhi",   maxWidth: 200 },
  ]);
  await fs.writeFile("/tmp/smoke-cert.pdf", cert);
  console.log("✓ /tmp/smoke-cert.pdf");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
