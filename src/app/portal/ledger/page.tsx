import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listGeneralExpenses, listProjects } from "@/lib/data";
import { listEmployeesFull } from "@/lib/employees";
import { fmtDate, omr, todayInput } from "@/lib/format";
import { buildLedgerEntries, ledgerDateMatch, MONTHS, omanParts, recentYears, sortLedger } from "@/lib/ledger";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { AutoForm } from "@/components/AutoForm";

export const metadata = { title: "Ledger" };

const PAGE_SIZE = 20;

const TYPES = [
  { value: "all", label: "All transactions" },
  { value: "in", label: "Cash inflow" },
  { value: "out", label: "Cash outflow" },
  { value: "Stage Payment", label: "Stage payment" },
  { value: "Project Expense", label: "Project expense" },
  { value: "Employee Salary", label: "Employee salary" },
  { value: "General Expense", label: "General expense" },
];

const DATES = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "date", label: "Specific date" },
  { value: "smonth", label: "Specific month" },
  { value: "syear", label: "Specific year" },
];

type Search = { type?: string; date?: string; d?: string; y?: string; m?: string; page?: string };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = omanParts(new Date());
  const type = sp.type ?? "all";
  const date = sp.date ?? "all";
  const specificDate = sp.d || todayInput();
  const year = Number(sp.y) || now.y;
  const month = Number(sp.m) || now.m + 1;

  const [projects, general, employees] = await Promise.all([listProjects(), listGeneralExpenses(), listEmployeesFull()]);
  const all = buildLedgerEntries(projects, general, employees);
  const entries = sortLedger(
    all
      .filter((e) => (type === "all" ? true : type === "in" ? e.inflow : type === "out" ? !e.inflow : e.type === type))
      .filter((e) => ledgerDateMatch(e.date, date, { date: specificDate, year, month })),
  );

  const inflow = entries.filter((e) => e.inflow).reduce((s, e) => s + e.amount, 0);
  const outflow = entries.filter((e) => !e.inflow).reduce((s, e) => s + e.amount, 0);
  const net = inflow - outflow;

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const first = entries.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(page * PAGE_SIZE, entries.length);

  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, date, d: sp.d, y: sp.y, m: sp.m })) if (v && v !== "all") q.set(k, v);
    q.set("page", String(n));
    return `/portal/ledger?${q}`;
  };
  const filtered = type !== "all" || date !== "all";

  return (
    <>
      <PageHeader eyebrow="Finance" title="Ledger" subtitle="Every stage payment, expense and salary in one place, newest first." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard icon="trend" label="Cash in" value={omr(inflow)} hint="Stage payments incl. VAT" />
        <StatCard icon="expenses" label="Cash out" value={omr(outflow)} hint="Expenses and salaries" />
        <div className="col-span-2 lg:col-span-1">
          <StatCard tone={net >= 0 ? "navy" : "orange"} icon="wallet" label="Net" value={omr(net)} hint={`${entries.length} record${entries.length === 1 ? "" : "s"}`} />
        </div>
      </div>

      <AutoForm className="card my-6 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="page" defaultValue="1" />
        <label className="min-w-[11rem] flex-1">
          <span className="label">Type</span>
          <select name="type" defaultValue={type} className="field">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="min-w-[11rem] flex-1">
          <span className="label">Date</span>
          <select name="date" defaultValue={date} className="field">
            {DATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {date === "date" && (
          <label className="min-w-[10rem] flex-1">
            <span className="label">Day</span>
            <input type="date" name="d" defaultValue={specificDate} className="field" />
          </label>
        )}
        {date === "smonth" && (
          <label className="min-w-[9rem] flex-1">
            <span className="label">Month</span>
            <select name="m" defaultValue={month} className="field">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
        {(date === "smonth" || date === "syear") && (
          <label className="min-w-[7rem] flex-1">
            <span className="label">Year</span>
            <select name="y" defaultValue={year} className="field">
              {recentYears().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <noscript><button className="btn-dark px-5">Filter</button></noscript>
          {filtered && <Link href="/portal/ledger" className="btn-ghost">Clear</Link>}
        </div>
      </AutoForm>

      {entries.length === 0 ? (
        <EmptyState icon="wallet" title={all.length ? "No matches" : "Nothing recorded yet"} text={all.length ? "No transactions match these filters." : "Stage payments, expenses and paid salaries appear here."} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-soft/70 text-left text-xs font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Details</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e, i) => (
                  <tr key={i} className="hover:bg-soft/40">
                    <td className="whitespace-nowrap px-5 py-3 text-muted">{fmtDate(e.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3"><TypeTag type={e.type} /></td>
                    <td className="max-w-[12rem] truncate px-3 py-3 font-semibold">{e.href ? <Link href={e.href} className="hover:text-accent">{e.source}</Link> : e.source}</td>
                    <td className="max-w-[22rem] truncate px-3 py-3 text-muted" title={e.details}>{e.details}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${e.inflow ? "text-emerald-700" : "text-ink"}`}>{e.inflow ? "+" : "−"}{omr(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone list */}
          <ul className="card divide-y divide-line md:hidden">
            {rows.map((e, i) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.source}</span>
                    <span className="block truncate text-sm text-muted">{e.details}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted"><TypeTag type={e.type} /> {fmtDate(e.date)}</span>
                  </span>
                  <span className={`shrink-0 font-bold ${e.inflow ? "text-emerald-700" : ""}`}>{e.inflow ? "+" : "−"}{omr(e.amount)}</span>
                </>
              );
              return (
                <li key={i}>
                  {e.href ? <Link href={e.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-soft/60">{body}</Link> : <div className="flex items-center gap-3 px-4 py-3.5">{body}</div>}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-muted">Showing {first}–{last} of {entries.length}</p>
            <div className="flex gap-2">
              {page > 1 ? <Link href={pageHref(page - 1)} className="btn-ghost">Previous</Link> : <span className="btn-ghost pointer-events-none opacity-40">Previous</span>}
              {page < pages ? <Link href={pageHref(page + 1)} className="btn-ghost">Next</Link> : <span className="btn-ghost pointer-events-none opacity-40">Next</span>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

const tagStyles: Record<string, string> = {
  "Stage Payment": "bg-emerald-50 text-emerald-700",
  "Project Expense": "bg-orange-50 text-orange-700",
  "General Expense": "bg-blue-50 text-blue-700",
  "Employee Salary": "bg-amber-50 text-amber-700",
};

function TypeTag({ type }: { type: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${tagStyles[type] ?? "bg-soft"}`}>{type}</span>;
}
