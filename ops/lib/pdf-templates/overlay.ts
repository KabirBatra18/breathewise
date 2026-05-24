/**
 * pdf-lib overlay helper for the Services Agreement and Handover
 * Certificate templates. The two source PDFs sit in this directory as
 * binary assets; we load one, draw typed text at predetermined (x, y)
 * coordinates, and return the resulting PDF bytes.
 *
 * Why this design:
 *   The PDFs are pixel-perfect documents the user laid out elsewhere
 *   (Pandoc → PDF). The user's hard constraint is "absolutely identical
 *   content", which kills any rebuild-in-code approach. Overlay keeps
 *   the original byte-for-byte and fills the blank lines.
 *
 * Coordinate system:
 *   PDF user units (1pt = 1/72 in). Origin = bottom-left of the page.
 *   The (x, y) in a Field is the TEXT BASELINE — so the typed text
 *   sits just above the underscore line in the template.
 *
 * Long-text handling:
 *   Each field declares a `maxWidth`. If the rendered text exceeds it
 *   at the default font size, we shrink the font down to 7pt before
 *   giving up and clipping. This means long addresses still fit on
 *   one line in most cases without breaking the layout.
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  PDFFont,
  StandardFonts,
  rgb,
} from "pdf-lib";

export interface OverlayField {
  /** Zero-indexed page number the text goes on. */
  page: number;
  /** Baseline x in PDF points (1/72 in), origin = bottom-left. */
  x: number;
  /** Baseline y in PDF points. */
  y: number;
  /** The text to draw. If empty / null, the field is skipped. */
  text: string | null | undefined;
  /** Max line width in points. Overflow triggers font shrink. */
  maxWidth: number;
  /** Default 10pt. */
  fontSize?: number;
  /** Default Helvetica. Set true to use Helvetica-Bold. */
  bold?: boolean;
}

export type TemplateName = "services-agreement" | "handover-certificate";

const TEMPLATE_DIR = path.join(process.cwd(), "lib", "pdf-templates");

async function loadTemplate(name: TemplateName): Promise<Uint8Array> {
  const file = path.join(TEMPLATE_DIR, `${name}.pdf`);
  const buf = await fs.readFile(file);
  return new Uint8Array(buf);
}

function drawFitting(
  page: ReturnType<PDFDocument["getPage"]>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  fontBold: PDFFont,
  preferredSize: number,
  useBold: boolean,
) {
  const chosenFont = useBold ? fontBold : font;
  let size = preferredSize;
  while (size >= 7) {
    const w = chosenFont.widthOfTextAtSize(text, size);
    if (w <= maxWidth) break;
    size -= 0.5;
  }
  // If shrinking to the floor still overflows, truncate with an
  // ellipsis so we never visually collide with the next column.
  let toDraw = text;
  if (chosenFont.widthOfTextAtSize(toDraw, size) > maxWidth) {
    const ellipsis = "…";
    while (
      toDraw.length > 1 &&
      chosenFont.widthOfTextAtSize(toDraw + ellipsis, size) > maxWidth
    ) {
      toDraw = toDraw.slice(0, -1);
    }
    toDraw = toDraw + ellipsis;
  }
  page.drawText(toDraw, {
    x,
    y,
    size,
    font: chosenFont,
    color: rgb(0, 0, 0),
  });
}

export async function fillTemplate(
  template: TemplateName,
  fields: OverlayField[],
): Promise<Uint8Array> {
  const buf = await loadTemplate(template);
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  for (const f of fields) {
    const text = (f.text ?? "").toString().trim();
    if (text === "") continue;
    const page = pages[f.page];
    if (!page) continue;
    drawFitting(
      page,
      text,
      f.x,
      f.y,
      f.maxWidth,
      font,
      fontBold,
      f.fontSize ?? 10,
      f.bold ?? false,
    );
  }

  return await doc.save({ useObjectStreams: false });
}
