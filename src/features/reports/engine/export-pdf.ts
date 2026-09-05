/**
 * PDF export — pure. Renders a `ReportAggregates` (the SAME filtered dataset the dashboard
 * shows) into an A4 portrait PDF with simple fixed-column text tables using pdf-lib.
 * Pages break automatically when the cursor drops below the bottom margin.
 */
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportAggregates } from "@/contracts/harsh";
import type { ExportOptions } from "./export-xlsx";

const A4: [number, number] = [595.28, 841.89];
const MARGIN_LEFT = 40;
const TOP_Y = A4[1] - 50;
const BOTTOM_Y = 60;
const BODY = 9;
const HEADING = 12;
const TITLE = 18;
const LINE = 13;
const TOP_N = 10;

/**
 * Standard Helvetica only supports WinAnsi; replace anything outside a safe subset so a
 * stray character in a customer name cannot crash the export.
 */
function safe(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x20 && code <= 0x7e) return ch;
      if (ch === "\u2014" || ch === "\u2013" || ch === "\u2018" || ch === "\u2019" || ch === "\u201c" || ch === "\u201d") return ch;
      return "?";
    })
    .join("");
}

function clip(text: string, max: number): string {
  const s = safe(text);
  return s.length > max ? `${s.slice(0, Math.max(0, max - 3))}...` : s;
}

interface Column {
  header: string;
  x: number;
  width: number; // in characters, used for clipping
}

class Writer {
  page!: PDFPage;
  y = TOP_Y;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage(A4);
    this.y = TOP_Y;
  }

  ensure(height: number): void {
    if (this.y - height < BOTTOM_Y) this.newPage();
  }

  text(str: string, x: number, size = BODY, bold = false): void {
    this.page.drawText(safe(str), { x, y: this.y, size, font: bold ? this.bold : this.font });
  }

  line(str: string, size = BODY, bold = false): void {
    this.ensure(size + 4);
    this.text(str, MARGIN_LEFT, size, bold);
    this.y -= size + 4;
  }

  gap(h = LINE): void {
    this.y -= h;
  }

  heading(str: string): void {
    this.ensure(HEADING + LINE);
    this.gap(4);
    this.text(str, MARGIN_LEFT, HEADING, true);
    this.y -= HEADING + 6;
  }

  keyValues(pairs: [string, string][]): void {
    for (const [k, v] of pairs) {
      this.ensure(LINE);
      this.text(k, MARGIN_LEFT, BODY);
      this.text(v, MARGIN_LEFT + 200, BODY);
      this.y -= LINE;
    }
  }

  tableHeader(cols: Column[]): void {
    this.ensure(LINE * 2);
    for (const c of cols) this.text(c.header, c.x, BODY, true);
    this.y -= LINE;
  }

  table(cols: Column[], rows: string[][]): void {
    this.tableHeader(cols);
    if (rows.length === 0) {
      this.line("(no rows)");
      return;
    }
    for (const row of rows) {
      if (this.y - LINE < BOTTOM_Y) {
        this.newPage();
        this.tableHeader(cols);
      }
      row.forEach((cell, i) => {
        const col = cols[i];
        if (col) this.text(clip(cell, col.width), col.x, BODY);
      });
      this.y -= LINE;
    }
  }
}

function filtersLine(agg: ReportAggregates): string {
  const f = agg.filters;
  const parts = [
    `Period ${f.period} [${agg.resolvedRange.from} .. ${agg.resolvedRange.to})`,
    `Team ${f.teamId ?? "All"}`,
    `Rep ${f.repId ?? "All"}`,
    `Approval ${f.approvalStatus ?? "ALL"}`,
    `Product ${f.productId ?? "All"}`,
    `Category ${f.category ?? "All"}`,
  ];
  return parts.join("  |  ");
}

export async function buildPdf(agg: ReportAggregates, options: ExportOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("DealFlow360 — Sales Report");
  doc.setProducer("DealFlow360 reports");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  // --- Title + provenance + filters --------------------------------------------------
  w.line("DealFlow360 \u2014 Sales Report", TITLE, true);
  w.gap(2);
  w.line(options.sourceLabel ?? "Generated from stored records", BODY);
  w.line(filtersLine(agg), BODY);
  w.gap(6);

  // --- Sales summary -----------------------------------------------------------------
  w.heading("Sales summary");
  w.keyValues([
    ["Quotes", String(agg.sales.quoteCount)],
    ["Confirmed orders", String(agg.sales.confirmedOrderCount)],
    ["Confirmed one-time revenue", agg.sales.confirmedOneTimeRevenue],
    ["Confirmed monthly recurring", agg.sales.confirmedMonthlyRecurring],
    ["Pipeline value", agg.sales.pipelineValue],
    ["Average weighted discount %", agg.sales.averageWeightedDiscountPct.toFixed(1)],
    ["Conversion rate %", agg.sales.conversionRatePct.toFixed(1)],
  ]);

  // --- Approvals summary -------------------------------------------------------------
  w.heading("Approvals summary");
  w.keyValues([
    ["Pending", String(agg.approvals.pending)],
    ["Approved", String(agg.approvals.approved)],
    ["Rejected", String(agg.approvals.rejected)],
    ["Not required", String(agg.approvals.notRequired)],
    ["Manager only", String(agg.approvals.managerOnly)],
    ["Manager + Finance", String(agg.approvals.managerFinance)],
  ]);

  // --- By rep (top 10) ---------------------------------------------------------------
  w.heading(`By rep (top ${TOP_N})`);
  w.table(
    [
      { header: "Rep", x: MARGIN_LEFT, width: 28 },
      { header: "Quotes", x: 220, width: 8 },
      { header: "Confirmed", x: 280, width: 10 },
      { header: "One-time revenue", x: 360, width: 18 },
      { header: "Avg disc %", x: 480, width: 10 },
    ],
    agg.byRep.slice(0, TOP_N).map((r) => [r.repName, String(r.quoteCount), String(r.confirmedCount), r.confirmedOneTimeRevenue, r.averageDiscountPct.toFixed(1)]),
  );

  // --- By product (top 10) -----------------------------------------------------------
  w.heading(`By product (top ${TOP_N})`);
  w.table(
    [
      { header: "Product", x: MARGIN_LEFT, width: 26 },
      { header: "Category", x: 200, width: 14 },
      { header: "Quoted", x: 290, width: 8 },
      { header: "Confirmed", x: 345, width: 10 },
      { header: "Net revenue", x: 415, width: 14 },
      { header: "Avg disc %", x: 500, width: 10 },
    ],
    agg.byProduct
      .slice(0, TOP_N)
      .map((p) => [p.productName, p.category, String(p.unitsQuoted), String(p.unitsConfirmed), p.netRevenue, p.averageDiscountPct.toFixed(1)]),
  );

  // --- Quotes (all rows, paginated) --------------------------------------------------
  w.heading(`Quotes (${agg.rows.length})`);
  w.table(
    [
      { header: "Number", x: MARGIN_LEFT, width: 9 },
      { header: "Customer", x: 95, width: 18 },
      { header: "Rep", x: 200, width: 14 },
      { header: "Stage", x: 285, width: 18 },
      { header: "Approval", x: 385, width: 12 },
      { header: "One-time", x: 450, width: 11 },
      { header: "Monthly", x: 515, width: 10 },
    ],
    agg.rows.map((q) => [q.quoteNumber, q.customerName, q.repName, q.stage, q.approvalStatus, q.oneTimeTotal, q.monthlyRecurringTotal]),
  );

  // --- Footer page numbers -----------------------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: A4[0] - 110, y: 30, size: 8, font });
  });

  return doc.save();
}
