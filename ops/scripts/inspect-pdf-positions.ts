/**
 * One-shot helper: dump text + positions per PDF page using pdfjs-dist.
 * Used to find baseline (x, y) of each underscored blank line in the
 * Welcome / Agreement / Handover templates before wiring the overlay.
 *
 * Usage: tsx scripts/inspect-pdf-positions.ts <pdf-path>
 *
 * Filter: pass FILTER=keyword to only print items whose text matches.
 *
 * pdfjs y-origin is bottom-left of the page (same as the PDF spec).
 * Each item has { str, transform: [a, b, c, d, e, f] } where (e, f) is
 * the baseline anchor we want.
 */

import fs from "node:fs/promises";
import path from "node:path";

// pdfjs-dist's "legacy" Node build, no canvas required.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/inspect-pdf-positions.ts <pdf>");
    process.exit(1);
  }
  const filter = process.env.FILTER?.toLowerCase();
  const data = await fs.readFile(path.resolve(arg));
  // pdfjs wants a fresh Uint8Array (not a Node Buffer view).
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(data),
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    console.log(`\n=== Page ${pageNum} of ${doc.numPages} — ${viewport.width.toFixed(1)} x ${viewport.height.toFixed(1)} pt ===`);
    const content = await page.getTextContent();
    for (const it of content.items as Array<{ str: string; transform: number[] }>) {
      const x = it.transform[4];
      const y = it.transform[5];
      const s = it.str;
      if (!s.trim()) continue;
      if (filter && !s.toLowerCase().includes(filter)) continue;
      console.log(`  (${x.toFixed(1)}, ${y.toFixed(1)})  "${s}"`);
    }
  }
  await doc.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
