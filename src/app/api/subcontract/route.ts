import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { fmtDate } from "@/lib/format";
import { agreementWithTax, getSubcontractor } from "@/lib/subcontractors";

const enc = (s: string) => (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const money = (n: number) => `OMR ${Math.round(n).toLocaleString("en-US")}`;

// Printable subcontractor agreement - the desktop app's BuildSubcontractorContractHtml layout.
//   /api/subcontract?project=<projectId>&sub=<subcontractorId>[&print=1]
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const q = request.nextUrl.searchParams;
  const project = await getProject(q.get("project") ?? "");
  const agreement = project?.subcontractorAgreements?.find((a) => a.subcontractorId === q.get("sub"));
  if (!project || !agreement) return new NextResponse("Agreement not found", { status: 404 });
  const sub = await getSubcontractor(agreement.subcontractorId);

  const value = num(agreement.agreementValue);
  const clauses = agreement.clauses ?? [];
  const rows = clauses.length
    ? clauses
        .map((c, i) => `<tr><td>${i + 1}</td><td>${enc(c.title).replace(/\r?\n/g, "<br>")}</td><td>${Number(num(c.percentage).toFixed(2))}%</td><td class="amount">${money(num(c.paymentAmount))}</td></tr>`)
        .join("\n")
    : `<tr><td colspan="4" class="empty">No stages added.</td></tr>`;
  const print = q.get("print") === "1" ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>` : "";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Subcontractor Agreement - ${enc(agreement.subcontractorName)} - ${enc(project.name)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #151823; margin: 0; background: #ffffff; }
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
    .terms { margin-top: 26px; font-size: 12px; color: #4b5563; line-height: 1.6; }
    .signatures { margin-top: 60px; display: flex; justify-content: space-between; gap: 40px; }
    .signature { flex: 1; }
    .signature .line { border-top: 1px solid #151823; margin-top: 48px; padding-top: 6px; font-size: 12px; color: #4b5563; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
  ${print}
</head>
<body>
  <main>
    <section class="top">
      <div class="brand"><img src="/assets/logo.png" alt="KeyStone logo"><div><h1>KeyStone Investment LLC</h1><p>Subcontractor Agreement</p></div></div>
      <div class="meta"><p><strong>Agreement Date</strong></p><p>${fmtDate(new Date())}</p><p><strong>Status:</strong> ${enc(agreement.status)}</p></div>
    </section>
    <section class="section">
      <h2>Project</h2>
      <div class="details">
        <div class="box"><div class="label">Project Name</div><div class="value">${enc(project.name)}</div></div>
        <div class="box"><div class="label">Client Name</div><div class="value">${enc(project.clientName)}</div></div>
      </div>
    </section>
    <section class="section">
      <h2>Subcontractor</h2>
      <div class="details">
        <div class="box"><div class="label">Subcontractor</div><div class="value">${enc(agreement.subcontractorName)}</div></div>
        <div class="box"><div class="label">Trade / Specialty</div><div class="value">${enc(sub?.tradeSpecialty ?? "")}</div></div>
        <div class="box"><div class="label">Contact Person</div><div class="value">${enc(sub?.contactPerson ?? "")}</div></div>
        <div class="box"><div class="label">Phone</div><div class="value">${enc(sub?.phone ?? "")}</div></div>
      </div>
    </section>
    <section class="section">
      <h2>Scope of Work &amp; Payment Schedule</h2>
      <table>
        <thead><tr><th style="width: 42px;">#</th><th>Stage</th><th style="width: 90px;">Percent</th><th style="width: 150px;">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section class="totals">
      <div class="line"><span>Agreement Value (Excl. Tax)</span><strong>${money(value)}</strong></div>
      <div class="line"><span>Tax 5%</span><strong>${money(value * 0.05)}</strong></div>
      <div class="line grand"><span>Total Agreement Value (Incl. Tax)</span><span>${money(agreementWithTax(agreement))}</span></div>
    </section>
    <section class="terms">
      <h2>Terms</h2>
      <p>This agreement records the scope of work and payment schedule agreed between KeyStone Investment LLC and the subcontractor named above for the project referenced above. Payments against each clause become due once the corresponding scope of work is completed and accepted, and will be recorded against this project's expenses as they are made. This document does not supersede any separate signed subcontract agreement between the parties.</p>
    </section>
    <section class="signatures">
      <div class="signature"><div class="line">KeyStone Investment LLC - Authorized Signature</div></div>
      <div class="signature"><div class="line">${enc(agreement.subcontractorName)} - Authorized Signature</div></div>
    </section>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
