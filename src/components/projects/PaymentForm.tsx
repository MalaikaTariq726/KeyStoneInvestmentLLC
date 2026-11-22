"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordPayment } from "@/app/portal/projects/actions";
import { Icon } from "@/components/Icon";

export interface PayableStage {
  index: number;
  title: string;
  total: number;
  remaining: number;
}

const fmt3 = (n: number) => `OMR ${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export function PaymentForm({ projectId, stages }: { projectId: string; stages: PayableStage[] }) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const subtotal = stages.reduce((s, st) => s + (Number(amounts[st.index]) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    for (const st of stages) {
      const v = Number(amounts[st.index] || 0);
      if (v < 0) return setError(`Enter a non-negative amount for "${st.title}", or leave it blank.`);
      if (v > st.remaining + 0.01) return setError(`"${st.title}" only has ${fmt3(st.remaining)} remaining - reduce the amount.`);
    }
    if (subtotal <= 0) return setError("Enter an amount for at least one stage.");
    setBusy(true);
    const result = await recordPayment(projectId, {
      lines: stages.filter((st) => Number(amounts[st.index]) > 0).map((st) => ({ index: st.index, title: st.title, amount: Number(amounts[st.index]) })),
      note,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setInvoiceId(result.invoiceId ?? null);
    router.refresh();
  }

  if (invoiceId) {
    const href = `/api/invoices?project=${projectId}&id=${invoiceId}`;
    return (
      <div className="card flex flex-col items-center p-8 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon name="check" className="h-7 w-7" strokeWidth={2.4} /></div>
        <h2 className="font-display text-2xl font-bold">Payment recorded</h2>
        <p className="mt-1 text-muted">A payment invoice was created and saved to the project&apos;s invoice history.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a className="btn-primary px-5 py-3" href={`${href}&print=1`} target="_blank" rel="noopener"><Icon name="file" className="h-5 w-5" /> Print invoice</a>
          <Link className="btn-ghost px-5 py-3" href={`/portal/projects/${projectId}`}>Back to project</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card divide-y divide-line">
        {stages.map((st) => (
          <label key={st.index} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{st.title}</span>
              <span className="block text-sm text-muted">Remaining {fmt3(st.remaining)} of {fmt3(st.total)} (excl. VAT)</span>
            </span>
            <span className="flex items-center gap-2">
              <input
                className="field w-40 text-right font-bold"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                max={st.remaining}
                placeholder="0.000"
                value={amounts[st.index] ?? ""}
                onChange={(e) => setAmounts({ ...amounts, [st.index]: e.target.value })}
              />
              <button type="button" className="btn-ghost px-3 py-2.5 text-xs" onClick={() => setAmounts({ ...amounts, [st.index]: st.remaining.toFixed(3) })}>Full</button>
            </span>
          </label>
        ))}
      </div>
      <label className="card block p-5">
        <span className="label">Note <span className="font-normal text-muted">(optional)</span></span>
        <input className="field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank transfer ref #1234" />
      </label>
      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Collected now incl. 5% VAT</p>
          <p className="font-display text-2xl font-extrabold">{fmt3(subtotal * 1.05)}</p>
        </div>
        <button className="btn-primary px-6 py-3.5 text-base" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
      </div>
    </form>
  );
}
