"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSalaryRecords } from "@/app/portal/employees/actions";
import { todayInput } from "@/lib/format";
import { Icon } from "@/components/Icon";

export interface SalaryRow {
  month: string; // ISO of the stored month
  label: string; // "Nov 2026"
  due: string; // "05 Dec 2026"
  dueIso: string;
  amount: string;
  paid: boolean;
  paidDate: string; // yyyy-mm-dd
  shares: string; // "Villas 60%" etc. for paid months
}

export function SalaryRecordsEditor({ employeeId, rows: initial, joiningDate }: { employeeId: string; rows: SalaryRow[]; joiningDate: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [base, setBase] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(base);
  const update = (i: number, patch: Partial<SalaryRow>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const status = (r: SalaryRow) => (r.paid ? "Paid" : new Date() > new Date(new Date(r.dueIso).getTime() + 24 * 3600e3) ? "Overdue" : "Pending");
  const pill = { Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200", Overdue: "bg-red-50 text-red-700 ring-red-200", Pending: "bg-amber-50 text-amber-700 ring-amber-200" };

  async function save() {
    setError("");
    for (const r of rows) {
      if (!(Number(r.amount) >= 0) || r.amount === "") return setError("Each salary row needs a valid non-negative salary amount.");
    }
    setBusy(true);
    const result = await saveSalaryRecords(employeeId, { rows: rows.map((r) => ({ month: r.month, amount: Number(r.amount), paid: r.paid, paidDate: r.paidDate })) });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setBase(rows);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const s = status(r);
          return (
            <li key={r.month} className="card flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="flex items-center justify-between gap-3 lg:w-48 lg:shrink-0 lg:flex-col lg:items-start lg:gap-1">
                <p className="font-display text-lg font-bold">{r.label}</p>
                <p className="text-xs text-muted">Due {r.due}</p>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-[8rem_auto_1fr] sm:items-center">
                <label className="block">
                  <span className="sr-only">Salary for {r.label}</span>
                  <input className="field py-2.5 font-bold" type="number" inputMode="decimal" min="0" step="0.001" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
                </label>
                <span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset sm:justify-self-start ${pill[s]}`}>{s}</span>
                <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" className="h-5 w-5 accent-[#F15A24]" checked={r.paid} onChange={(e) => update(i, { paid: e.target.checked, paidDate: r.paidDate || todayInput() })} />
                    Paid
                  </label>
                  {r.paid ? (
                    <input className="field w-auto py-2" type="date" min={joiningDate} max={todayInput()} value={r.paidDate} onChange={(e) => update(i, { paidDate: e.target.value })} aria-label={`Paid date for ${r.label}`} />
                  ) : (
                    <span className="text-sm text-muted">Not paid yet</span>
                  )}
                  {r.paid && r.shares && <span className="text-xs text-muted">Charged: {r.shares}</span>}
                </div>
              </div>
              <div className="flex gap-2 lg:shrink-0">
                {!r.paid && (
                  <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => update(i, { paid: true, paidDate: todayInput() })}>
                    <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Mark paid today
                  </button>
                )}
                <a className="btn-ghost px-3 py-2 text-xs" href={`/api/salary-slip?employee=${employeeId}&month=${encodeURIComponent(r.month)}&print=1`} target="_blank" rel="noopener" title={dirty ? "Save first - the slip shows saved values" : undefined}>
                  <Icon name="file" className="h-4 w-4" /> Slip
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <p className={`text-sm font-bold ${saved ? "text-emerald-700" : "text-muted"}`}>{saved ? "Salary records saved ✓" : dirty ? "You have unsaved changes" : "Tick Paid (or Mark paid today) and save."}</p>
        <button type="button" className="btn-primary px-6 py-3" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save salary records"}</button>
      </div>
    </div>
  );
}
