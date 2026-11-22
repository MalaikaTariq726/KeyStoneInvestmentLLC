"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentPicker, type PickedFile } from "@/components/AttachmentPicker";
import { updateGeneralExpense, updateProjectExpense } from "@/app/portal/projects/actions";
import { EXPENSE_TYPES, omr, todayInput, totalWithTax, type TaxMode } from "@/lib/format";

export interface ExpenseInitial {
  title: string;
  expenseType: string;
  amount: string;
  date: string;
  taxMode: TaxMode;
  taxPercent: string;
  files: Array<{ name: string; href: string }>;
}

export function ExpenseEditForm({ target, initial, backHref }: { target: { kind: "project"; projectId: string; index: number } | { kind: "general"; id: string }; initial: ExpenseInitial; backHref: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPES.includes(initial.expenseType as never) ? initial.expenseType : "Others");
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [taxMode, setTaxMode] = useState<TaxMode>(initial.taxMode);
  const [taxPercent, setTaxPercent] = useState(initial.taxPercent);
  const [keep, setKeep] = useState<number[]>(initial.files.map((_, i) => i));
  const [added, setAdded] = useState<PickedFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = useMemo(() => totalWithTax(Number(amount) || 0, taxMode, Number(taxPercent) || 0), [amount, taxMode, taxPercent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      title,
      expenseType,
      amount: Number(amount),
      date,
      taxMode,
      taxPercent: taxMode === "none" ? 0 : Number(taxPercent),
      keepAttachments: keep,
      newAttachments: added,
      expectedTitle: initial.title,
    };
    const result = target.kind === "project" ? await updateProjectExpense(target.projectId, target.index, payload) : await updateGeneralExpense(target.id, payload);
    setBusy(false);
    if (!result.ok) { setError(result.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    router.push(backHref);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card space-y-5 p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Expense type</span>
            <select className="field" value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>{EXPENSE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="block"><span className="label">Transaction date</span>
            <input className="field" type="date" required max={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="block"><span className="label">Title</span><input className="field" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block"><span className="label">Amount (OMR)</span>
            <input className="field text-lg font-bold" required type="number" inputMode="decimal" min="0" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block"><span className="label">Tax</span>
            <select className="field" value={taxMode} onChange={(e) => { const m = e.target.value as TaxMode; setTaxMode(m); if (m !== "none" && !(Number(taxPercent) > 0)) setTaxPercent("5"); }}>
              <option value="added">Tax added on top</option><option value="included">Tax included</option><option value="none">No tax</option>
            </select>
          </label>
          <label className="block"><span className="label">Tax %</span>
            <input className="field" type="number" min="0" max="100" step="0.01" disabled={taxMode === "none"} value={taxMode === "none" ? "0" : taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          </label>
        </div>

        {initial.files.length > 0 && (
          <div>
            <span className="label">Current documents</span>
            <ul className="space-y-2">
              {initial.files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                  <input type="checkbox" className="h-5 w-5 accent-[#F15A24]" checked={keep.includes(i)} onChange={(e) => setKeep(e.target.checked ? [...keep, i] : keep.filter((k) => k !== i))} aria-label={`Keep ${f.name}`} />
                  <a href={f.href} target="_blank" rel="noopener" className={`min-w-0 flex-1 truncate text-sm font-semibold ${keep.includes(i) ? "" : "text-muted line-through"}`}>{f.name}</a>
                  {!keep.includes(i) && <span className="text-xs font-bold text-red-600">Will be removed</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <span className="label">Add documents <span className="font-normal text-muted">(optional)</span></span>
          <AttachmentPicker files={added} onChange={setAdded} />
        </div>
      </div>
      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Total incl. tax</p>
          <p className="font-display text-2xl font-extrabold">{omr(total)}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost px-4 py-3" onClick={() => router.push(backHref)}>Cancel</button>
          <button className="btn-primary px-6 py-3" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </form>
  );
}
