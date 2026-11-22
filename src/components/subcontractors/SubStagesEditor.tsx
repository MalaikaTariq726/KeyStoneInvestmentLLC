"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAgreementStages } from "@/app/portal/subcontractors/actions";
import { Icon } from "@/components/Icon";

export interface SubStageRow {
  id?: string;
  include: boolean;
  title: string;
  paymentType: "Percentage" | "Amount";
  value: string;
  status: "Pending" | "Processing" | "Paid";
  wasPaid: boolean;
  fromProject?: boolean; // offered from the project's own stages
}

const fmt3 = (n: number) => `OMR ${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const fmt0 = (n: number) => `OMR ${Math.round(n).toLocaleString("en-US")}`;

export function SubStagesEditor({ projectId, subcontractorId, agreementValue, initial }: { projectId: string; subcontractorId: string; agreementValue: number; initial: SubStageRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<SubStageRow[]>(initial.length ? initial : [{ include: true, title: "", paymentType: "Percentage", value: "", status: "Pending", wasPaid: false }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amountOf = (r: SubStageRow) => {
    const v = Number(r.value);
    if (r.value === "" || !Number.isFinite(v) || v < 0) return null;
    return r.paymentType === "Amount" ? v : agreementValue * (v / 100);
  };
  const included = rows.filter((r) => r.include);
  const total = included.reduce((s, r) => s + (amountOf(r) ?? 0), 0);
  const balanced = Math.abs(total - agreementValue) <= 0.01;
  const newlyPaid = rows.filter((r) => r.include && r.status === "Paid" && !r.wasPaid).reduce((s, r) => s + (amountOf(r) ?? 0), 0);
  const update = (i: number, patch: Partial<SubStageRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await saveAgreementStages(projectId, subcontractorId, {
      stages: included.map((r) => ({ id: r.id, title: r.title, paymentType: r.paymentType, value: r.value, status: r.status })),
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    router.push(`/portal/projects/${projectId}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

      <div className={`card p-4 sm:p-5 ${balanced ? "ring-2 ring-emerald-200" : ""}`}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Selected stages</p>
        <p className={`font-display text-xl font-extrabold ${balanced ? "text-emerald-700" : ""}`}>{fmt3(total)} <span className="text-base font-bold text-muted">of {fmt3(agreementValue)}</span></p>
        <p className="text-xs text-muted">Ticked stages must add up to 100% of the agreement value. Marking a stage Paid posts its amount plus 5% tax as a Subcontractor Payment expense on this project.</p>
      </div>

      <ol className="space-y-3">
        {rows.map((r, i) => {
          const amount = amountOf(r);
          return (
            <li key={i} className={`card p-4 sm:p-5 ${r.include ? "" : "opacity-70"}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" className="h-5 w-5 accent-[#F15A24]" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} />
                  Include{r.fromProject && !r.id ? <span className="font-normal text-muted"> · from project stages</span> : null}
                </label>
                {!r.fromProject && (
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-red-50 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove stage">
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-12 lg:col-span-5"><span className="label">Stage title (scope of work)</span>
                  <input className="field" required={r.include} maxLength={500} value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
                </label>
                <label className="block sm:col-span-4 lg:col-span-2"><span className="label">Type</span>
                  <select className="field" value={r.paymentType} onChange={(e) => update(i, { paymentType: e.target.value as SubStageRow["paymentType"] })}><option>Percentage</option><option>Amount</option></select>
                </label>
                <label className="block sm:col-span-4 lg:col-span-2"><span className="label">{r.paymentType === "Amount" ? "Amount (OMR)" : "Percent (%)"}</span>
                  <input className="field font-bold" required={r.include} type="number" inputMode="decimal" min="0" step="any" value={r.value} onChange={(e) => update(i, { value: e.target.value })} />
                </label>
                <label className="block sm:col-span-4 lg:col-span-3"><span className="label">Status</span>
                  <select className="field" value={r.status} onChange={(e) => update(i, { status: e.target.value as SubStageRow["status"] })}><option>Pending</option><option>Processing</option><option>Paid</option></select>
                </label>
              </div>
              <p className="mt-2 text-sm text-muted">
                {amount === null || !r.include ? "—" : r.paymentType === "Amount" ? `= ${Number(((amount / (agreementValue || 1)) * 100).toFixed(2))}% of the agreement` : `= ${fmt0(amount)}`}
                {r.include && r.status === "Paid" && !r.wasPaid && <span className="ml-2 font-semibold text-accent">· will post {fmt0((amount ?? 0) * 1.05)} incl. tax as an expense</span>}
                {r.wasPaid && r.status !== "Paid" && <span className="ml-2 font-semibold text-amber-700">· already posted expense stays; edit it on the project if needed</span>}
              </p>
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn-ghost" onClick={() => setRows([...rows, { include: true, title: "", paymentType: "Percentage", value: "", status: "Pending", wasPaid: false }])}>
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> Add stage
      </button>

      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <p className={`text-sm font-bold ${balanced ? "text-emerald-700" : "text-muted"}`}>
          {balanced ? "Stages add up ✓" : `Off by ${fmt3(agreementValue - total)}`}
          {newlyPaid > 0 && <span className="block text-xs font-semibold text-accent">Posting {fmt0(newlyPaid * 1.05)} as project expenses</span>}
        </p>
        <button className="btn-primary px-6 py-3.5 text-base" disabled={busy}>{busy ? "Saving…" : "Save stages"}</button>
      </div>
    </form>
  );
}
