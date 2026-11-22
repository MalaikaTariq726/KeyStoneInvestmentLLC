import "server-only";
import type { Db } from "mongodb";
import { num } from "./decimal";
import { clauseSettled, VAT_RATE, type ClauseDoc } from "./models";
import { clauseIsPartiallyPaid, clauseRemaining } from "./projects";
import { TIME_ZONE } from "./format";

// Invoice HTML, numbering and storage - the same layout, numbers and saved shape as the desktop
// app (BuildInvoiceHtml / BuildClausePaymentInvoiceHtml), so either app can reprint the other's.

// Saved invoices reference the logo through this placeholder instead of embedding the image
// (the desktop app does the same to keep project records small). It is swapped back on display.
export const LOGO_PLACEHOLDER = "keystone-logo:embedded";

const enc = (s: string) => (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const encLines = (s: string) => enc(s).replace(/\r?\n/g, "<br>");
// AdminProject.FormatCurrency: "OMR {amount:N0}"
const money = (n: number) => `OMR ${Math.round(n).toLocaleString("en-US")}`;
// C# "0.##"
const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const dmy = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TIME_ZONE });

// Company-wide sequential numbers (INV-2026-0001, ...), restarting each year - the same shared
// counter document the desktop app increments, so the two never hand out the same number.
export async function nextInvoiceNumber(db: Db): Promise<string> {
  const year = Number(new Date().toLocaleString("en-GB", { year: "numeric", timeZone: TIME_ZONE }));
  try {
    const counter = await db
      .collection<{ _id: string; seq: number }>("counters")
      .findOneAndUpdate({ _id: `invoice-${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    return `INV-${year}-${String(Number(counter?.seq ?? 0)).padStart(4, "0")}`;
  } catch {
    const now = new Date();
    return `INV-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  }
}

const STYLE = `
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #151823; margin: 0; background: #ffffff; }
    .invoice { width: 100%; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #ef5a39; padding-bottom: 18px; margin-bottom: 22px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 58px; height: 58px; object-fit: contain; }
    .brand h1 { margin: 0; font-size: 28px; }
    .brand p, .meta p { margin: 4px 0; color: #5f6673; }
    .meta { text-align: right; }
    .section { margin-top: 18px; }
    h2 { font-size: 16px; margin: 0 0 10px; color: #ef5a39; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; min-height: 72px; }
    .label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
    .value { font-weight: 700; white-space: pre-wrap; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 9px; vertical-align: top; font-size: 13px; }
    th { background: #f9fafd; color: #4b5563; text-align: left; }
    .amount { text-align: right; white-space: nowrap; }
    .empty { text-align: center; color: #6b7280; }
    .totals { width: 45%; margin-left: auto; margin-top: 18px; }
    .totals .line { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding: 8px 0; gap: 16px; }
    .totals .grand { font-size: 18px; font-weight: 800; color: #ef5a39; border-bottom: 0; }
    .description { white-space: pre-wrap; overflow-wrap: anywhere; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;

const PRINT_SCRIPT = `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>`;
const LOGO = `<img src="${LOGO_PLACEHOLDER}" alt="KeyStone logo">`;

interface ProjectInfo {
  name: string;
  clientName: string;
  natureOfProject: string;
  contractValue: unknown;
  status: string;
}

// Whole-project or selected-stages invoice: bills what is still outstanding on those stages.
export function buildStageInvoice(project: ProjectInfo, invoiceNumber: string, clauses: ClauseDoc[], isPartialSelection: boolean) {
  const subtotal = clauses.reduce((s, c) => s + clauseRemaining(c), 0);
  const tax = subtotal * VAT_RATE;
  const subtitle = isPartialSelection
    ? clauses.length === 1
      ? `Stage Invoice - ${enc(clauses[0].title)}`
      : `Stage Invoice - ${clauses.length} Stages Selected`
    : "Project Invoice";
  const rows = clauses.length
    ? clauses
        .map((c, i) => {
          const amount = num(c.paymentAmount);
          const status = clauseIsPartiallyPaid(c) ? `Partially Paid (${money(clauseSettled(c))} of ${money(amount)})` : c.status;
          return `<tr><td>${i + 1}</td><td>${encLines(c.title)}</td><td>${pct(num(c.percentage))}</td><td>${enc(status)}</td><td class="amount">${enc(money(amount))}</td></tr>`;
        })
        .join("\n")
    : `<tr><td colspan="5" class="empty">No stages added.</td></tr>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${enc(invoiceNumber)} - ${enc(project.name)}</title>
  <style>${STYLE}</style>
  ${PRINT_SCRIPT}
</head>
<body>
  <main class="invoice">
    <section class="top">
      <div class="brand">${LOGO}<div><h1>KeyStone Investment LLC</h1><p>${subtitle}</p></div></div>
      <div class="meta">
        <p><strong>Invoice No.</strong></p><p>${enc(invoiceNumber)}</p>
        <p><strong>Invoice Date</strong></p><p>${dmy(new Date())}</p>
        <p><strong>Status:</strong> ${enc(project.status)}</p>
      </div>
    </section>
    <section class="section">
      <h2>Project Details</h2>
      <div class="details">
        <div class="box"><div class="label">Project Name</div><div class="value">${enc(project.name)}</div></div>
        <div class="box"><div class="label">Client Name</div><div class="value">${enc(project.clientName)}</div></div>
        <div class="box"><div class="label">Work Description</div><div class="value">${enc(project.natureOfProject)}</div></div>
        <div class="box"><div class="label">Contract Value (Incl. Tax)</div><div class="value">${enc(money(num(project.contractValue)))}</div></div>
      </div>
    </section>
    <section class="section">
      <h2>Stage Details</h2>
      <table>
        <thead><tr><th style="width: 42px;">#</th><th>Stage</th><th style="width: 90px;">Percent</th><th style="width: 110px;">Status</th><th style="width: 150px;">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section class="totals">
      <div class="line"><span>Outstanding Subtotal</span><strong>${enc(money(subtotal))}</strong></div>
      <div class="line"><span>Tax 5%</span><strong>${enc(money(tax))}</strong></div>
      <div class="line grand"><span>Amount Due</span><span>${enc(money(subtotal + tax))}</span></div>
    </section>
  </main>
</body>
</html>`;
  return { html, subtotal, tax };
}

export interface PaymentLine {
  clause: ClauseDoc;
  amount: number;
  remainingAfter: number;
}

// Invoice for one client payment, possibly spread over several stages.
export function buildPaymentInvoice(project: ProjectInfo, invoiceNumber: string, lines: PaymentLine[], paymentDate?: Date) {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = subtotal * VAT_RATE;
  const kind = lines.some((l) => l.remainingAfter > 0.01) ? "Partial Payment Invoice" : "Payment Invoice";
  const subtitle = lines.length === 1 ? `${kind} - ${enc(lines[0].clause.title)}` : `${kind} - ${lines.length} Stages`;
  const rows = lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${encLines(l.clause.title)}</td><td>${pct(num(l.clause.percentage))}</td><td>${enc(money(num(l.clause.paymentAmount)))}</td><td class="amount">${enc(money(l.amount))}</td><td class="amount">${enc(money(l.remainingAfter))}</td></tr>`,
    )
    .join("\n");
  const paymentDateHtml = paymentDate ? `<p><strong>Payment Date</strong></p><p>${dmy(paymentDate)}</p>` : "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${kind} ${enc(invoiceNumber)} - ${enc(project.name)}</title>
  <style>${STYLE}</style>
  ${PRINT_SCRIPT}
</head>
<body>
  <main class="invoice">
    <section class="top">
      <div class="brand">${LOGO}<div><h1>KeyStone Investment LLC</h1><p>${subtitle}</p></div></div>
      <div class="meta">
        <p><strong>Invoice No.</strong></p><p>${enc(invoiceNumber)}</p>
        <p><strong>Invoice Date</strong></p><p>${dmy(new Date())}</p>
        ${paymentDateHtml}
      </div>
    </section>
    <section class="section">
      <h2>Project Details</h2>
      <div class="details">
        <div class="box"><div class="label">Project Name</div><div class="value">${enc(project.name)}</div></div>
        <div class="box"><div class="label">Client Name</div><div class="value">${enc(project.clientName)}</div></div>
      </div>
    </section>
    <section class="section">
      <h2>Payment Details</h2>
      <table>
        <thead><tr><th style="width: 42px;">#</th><th>Stage</th><th style="width: 90px;">Percent</th><th style="width: 130px;">Stage Total</th><th style="width: 130px;">Paid Now</th><th style="width: 130px;">Remaining After</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section class="totals">
      <div class="line"><span>Payment Subtotal</span><strong>${enc(money(subtotal))}</strong></div>
      <div class="line"><span>Tax 5%</span><strong>${enc(money(tax))}</strong></div>
      <div class="line grand"><span>Total Paid</span><span>${enc(money(subtotal + tax))}</span></div>
    </section>
  </main>
</body>
</html>`;
  return { html, subtotal, tax, kind, summary: lines.map((l) => `${l.clause.title}: ${money(l.amount)}`).join(", ") };
}
