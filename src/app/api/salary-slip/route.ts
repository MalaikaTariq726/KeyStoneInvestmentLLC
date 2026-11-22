import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { num } from "@/lib/decimal";
import { getEmployee } from "@/lib/employees";
import { fmtDate } from "@/lib/format";
import { effectiveDue, ensureSalaryRecords, monthLabel, recordStatus } from "@/lib/salary";

const enc = (s: string) => (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const money = (n: number) => `OMR ${Math.round(n).toLocaleString("en-US")}`;

// Printable salary slip - the desktop app's BuildSalarySlipHtml layout.
//   /api/salary-slip?employee=<id>&month=<iso>[&print=1]
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const q = request.nextUrl.searchParams;
  const emp = await getEmployee(q.get("employee") ?? "");
  if (!emp) return new NextResponse("Employee not found", { status: 404 });
  const { records } = ensureSalaryRecords(emp);
  const record = records.find((r) => new Date(r.month).toISOString() === q.get("month"));
  if (!record) return new NextResponse("Salary month not found", { status: 404 });

  const month = monthLabel(record.month);
  const print = q.get("print") === "1" ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>` : "";
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Salary Slip - ${enc(emp.name)} - ${month}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #151823; margin: 0; background: #ffffff; }
    .slip { width: 100%; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #ef5a39; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 58px; height: 58px; object-fit: contain; }
    .brand h1 { margin: 0; font-size: 28px; }
    .brand p, .meta p { margin: 4px 0; color: #5f6673; }
    .meta { text-align: right; }
    h2 { font-size: 18px; margin: 0 0 12px; color: #ef5a39; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; min-height: 72px; }
    .label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
    .value { font-weight: 700; overflow-wrap: anywhere; }
    .amount { margin-top: 22px; border-top: 1px solid #e5e7eb; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 20px; }
    .amount strong { color: #ef5a39; font-size: 26px; }
    .footer { margin-top: 46px; display: flex; justify-content: space-between; color: #6b7280; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
  ${print}
</head>
<body>
  <main class="slip">
    <section class="top">
      <div class="brand"><img src="/assets/logo.png" alt="KeyStone logo"><div><h1>KeyStone Investment LLC</h1><p>Employee Salary Slip</p></div></div>
      <div class="meta"><p><strong>Generated</strong></p><p>${fmtDate(new Date())}</p><p><strong>Status:</strong> ${recordStatus(record)}</p></div>
    </section>
    <section>
      <h2>Salary Details</h2>
      <div class="details">
        <div class="box"><div class="label">Employee</div><div class="value">${enc(emp.name)}</div></div>
        <div class="box"><div class="label">Designation</div><div class="value">${enc(emp.designation)}</div></div>
        <div class="box"><div class="label">Salary Month</div><div class="value">${month}</div></div>
        <div class="box"><div class="label">Joining Date</div><div class="value">${fmtDate(emp.joiningDate)}</div></div>
        <div class="box"><div class="label">Due Date</div><div class="value">${fmtDate(effectiveDue(record))}</div></div>
        <div class="box"><div class="label">Paid Date</div><div class="value">${record.paidAt ? fmtDate(record.paidAt) : "-"}</div></div>
      </div>
      <div class="amount"><span>Salary Amount</span><strong>${money(num(record.amount))}</strong></div>
    </section>
    <section class="footer"><span>Prepared by KeyStone Investment LLC</span><span>Employee Signature ____________________</span></section>
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
