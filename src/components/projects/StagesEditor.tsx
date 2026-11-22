"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveStages } from "@/app/portal/projects/actions";
import { Icon } from "@/components/Icon";

export interface StageRow {
  title: string;
  paymentType: "Percentage" | "Amount";
  value: string;
  status: string;
  paidSoFar?: number; // instalments already recorded (read-only here)
}

const STATUSES = ["Pending", "Processing", "Paid"];
const fmt3 = (n: number) => `OMR ${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const fmt0 = (n: number) => `OMR ${Math.round(n).toLocaleString("en-US")}`;

export function StagesEditor({ projectId, base, initial, isNew }: { projectId: string; base: number; initial: StageRow[]; isNew: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<StageRow[]>(initial.length ? initial : [{ title: "", paymentType: "Percentage", value: "", status: "Pending" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amountOf = (r: StageRow) => {
    const v = Number(r.value);
    if (!r.value || !Number.isFinite(v) || v < 0) return null;
    return r.paymentType === "Amount" ? v : base * (v / 100);
  };
  const total = rows.reduce((s, r) => s + (amountOf(r) ?? 0), 0);
  const balanced = Math.abs(total - base) <= 0.01;
  const update = (i: number, patch: Partial<StageRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // Fill the last stage with whatever is left so the stages add up exactly.
  function fillRemainder() {
    const others = rows.slice(0, -1).reduce((s, r) => s + (amountOf(r) ?? 0), 0);
    const left = Math.max(0, base - others);
    const last = rows[rows.length - 1];
    update(rows.length - 1, { value: last.paymentType === "Amount" ? left.toFixed(3) : String(Number(((left / base) * 100).toFixed(6))) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await saveStages(projectId, { stages: rows.map((r) => ({ title: r.title, paymentType: r.paymentType, value: r.value, status: r.status })) });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    router.push(`/portal/projects/${projectId}${isNew ? "?stagesSaved=1" : ""}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

      <div className={`card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${balanced ? "ring-2 ring-emerald-200" : ""}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Stages total</p>
          <p className={`font-display text-xl font-extrabold ${balanced ? "text-emerald-700" : ""}`}>{fmt3(total)} <span className="text-base font-bold text-muted">of {fmt3(base)}</span></p>
          <p className="text-xs text-muted">All stages must add up to 100% of the contract value excluding VAT.</p>
        </div>
        {!balanced && rows.length > 0 && (
          <button type="button" className="btn-ghost" onClick={fillRemainder}>Fill last stage with the remainder</button>
        )}
      </div>

      <ol className="space-y-3">
        {rows.map((r, i) => {
          const amount = amountOf(r);
          return (
            <li key={i} className="card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-widest text-muted">Stage {i + 1}</span>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  aria-label={`Remove stage ${i + 1}`}
                  title={rows.length === 1 ? "At least one stage is required" : "Remove stage"}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-12 lg:col-span-5">
                  <span className="label">Title</span>
                  <input className="field" required maxLength={500} value={r.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="e.g. Mobilisation" />
                </label>
                <label className="block sm:col-span-4 lg:col-span-2">
                  <span className="label">Type</span>
                  <select className="field" value={r.paymentType} onChange={(e) => update(i, { paymentType: e.target.value as StageRow["paymentType"] })}>
                    <option>Percentage</option>
                    <option>Amount</option>
                  </select>
                </label>
                <label className="block sm:col-span-4 lg:col-span-2">
                  <span className="label">{r.paymentType === "Amount" ? "Amount (OMR)" : "Percent (%)"}</span>
                  <input className="field font-bold" required type="number" inputMode="decimal" min="0" step="any" value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
                </label>
                {!isNew && (
                  <label className="block sm:col-span-4 lg:col-span-3">
                    <span className="label">Status</span>
                    <select className="field" value={STATUSES.includes(r.status) ? r.status : "Processing"} onChange={(e) => update(i, { status: e.target.value })} disabled={(r.paidSoFar ?? 0) > 0}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">
                {amount === null ? "—" : r.paymentType === "Amount" ? `= ${Number(((amount / (base || 1)) * 100).toFixed(2))}% of the base` : `= ${fmt0(amount)} (excl. VAT)`}
                {(r.paidSoFar ?? 0) > 0 && <span className="ml-2 font-semibold text-emerald-700">· {fmt0(r.paidSoFar!)} already collected - status follows payments</span>}
              </p>
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn-ghost w-full py-3 sm:w-auto" onClick={() => setRows([...rows, { title: "", paymentType: "Percentage", value: "", status: "Pending" }])}>
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> Add stage
      </button>

      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <p className={`text-sm font-bold ${balanced ? "text-emerald-700" : "text-muted"}`}>{balanced ? "Stages add up ✓" : `Off by ${fmt3(base - total)}`}</p>
        <button className="btn-primary px-6 py-3.5 text-base" disabled={busy}>{busy ? "Saving…" : "Save stages"}</button>
      </div>
    </form>
  );
}
