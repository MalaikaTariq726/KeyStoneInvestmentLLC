"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentPicker, type PickedFile } from "./AttachmentPicker";
import { submitClaim, addExpense, updateClaim } from "@/app/portal/actions";
import { EXPENSE_TYPES, omr, todayInput, totalWithTax, type TaxMode } from "@/lib/format";

interface Props {
  mode: "claim" | "expense";
  projects: Array<{ id: string; name: string }>;
  // claim mode
  users?: Array<{ id: string; name: string; available: number }>; // admins raising for others
  currentUserId?: string;
  myAvailableCredit?: number;
  // expense mode: fixed project (or general when undefined)
  projectId?: string;
  successHref: string;
  // editing an existing pending claim
  edit?: {
    claimId: string;
    initial: { applyTo: string; expenseType: string; title: string; amount: string; date: string; description: string; taxMode: TaxMode; taxPercent: string; fundedByCredit: boolean };
    files: Array<{ name: string; href: string }>;
  };
}

export function EntryForm({ mode, projects, users, currentUserId, myAvailableCredit = 0, projectId, successHref, edit }: Props) {
  const init = edit?.initial;
  const router = useRouter();
  const [applyTo, setApplyTo] = useState(init?.applyTo ?? "General");
  const [raisedBy, setRaisedBy] = useState(currentUserId ?? "");
  const [expenseType, setExpenseType] = useState<string>(init?.expenseType ?? (mode === "claim" ? "User Claim" : "Others"));
  const [title, setTitle] = useState(init?.title ?? "");
  const [amount, setAmount] = useState(init?.amount ?? "");
  const [date, setDate] = useState(init?.date ?? todayInput());
  const [description, setDescription] = useState(init?.description ?? "");
  const [taxMode, setTaxMode] = useState<TaxMode>(init?.taxMode ?? "added");
  const [taxPercent, setTaxPercent] = useState(init?.taxPercent ?? "5");
  const [fundedByCredit, setFundedByCredit] = useState(init?.fundedByCredit ?? false);
  const [keep, setKeep] = useState<number[]>((edit?.files ?? []).map((_, i) => i));
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const available = users ? users.find((u) => u.id === raisedBy)?.available ?? 0 : myAvailableCredit;
  const amountNum = Number(amount) || 0;
  const total = useMemo(() => totalWithTax(amountNum, taxMode, Number(taxPercent) || 0), [amountNum, taxMode, taxPercent]);
  const overCredit = fundedByCredit && total > available + 0.01;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (overCredit) {
      setError(`The total including tax is more than the available credit (${omr(available)}).`);
      return;
    }
    setBusy(true);
    const base = {
      title,
      expenseType,
      amount: amountNum,
      date,
      taxMode,
      taxPercent: taxMode === "none" ? 0 : Number(taxPercent),
      attachments: files,
    };
    const result = edit
      ? await updateClaim(edit.claimId, { ...base, applyTo, description, fundedByCredit, keepAttachments: keep })
      : mode === "claim"
        ? await submitClaim({ ...base, applyTo, description, fundedByCredit, raisedByUserId: users ? raisedBy : undefined })
        : await addExpense({ ...base, projectId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.push(edit ? `/portal/claims/${edit.claimId}?saved=1` : mode === "claim" && result.id ? `/portal/claims/${result.id}?submitted=1` : successHref);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

      <div className="card space-y-5 p-5 sm:p-7">
        {users && (
          <div>
            <label className="label" htmlFor="raisedBy">Raised by</label>
            <select id="raisedBy" className="field" value={raisedBy} onChange={(e) => { setRaisedBy(e.target.value); setFundedByCredit(false); }}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {mode === "claim" && (
            <div>
              <label className="label" htmlFor="applyTo">Applies to</label>
              <select id="applyTo" className="field" value={applyTo} onChange={(e) => setApplyTo(e.target.value)}>
                <option value="General">General (company)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div className={mode === "claim" ? "" : "sm:col-span-2"}>
            <label className="label" htmlFor="type">Expense type</label>
            <select id="type" className="field" value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
              {EXPENSE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="field" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "claim" ? "e.g. Site travel reimbursement" : "e.g. Cement delivery"} />
          </div>
          <div>
            <label className="label" htmlFor="date">{mode === "claim" ? "Claim date" : "Transaction date"}</label>
            <input id="date" type="date" className="field" required value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="amount">Amount (OMR)</label>
            <input id="amount" className="field text-lg font-bold" required inputMode="decimal" type="number" step="0.001" min="0.001" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />
          </div>
          <div>
            <label className="label" htmlFor="tax">Tax</label>
            <select id="tax" className="field" value={taxMode} onChange={(e) => setTaxMode(e.target.value as TaxMode)}>
              <option value="added">Tax added on top</option>
              <option value="included">Tax included</option>
              <option value="none">No tax</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="taxp">Tax %</label>
            <input id="taxp" className="field" type="number" step="0.01" min="0" max="100" disabled={taxMode === "none"} value={taxMode === "none" ? "0" : taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          </div>
        </div>

        {mode === "claim" && (
          <div>
            <label className="label" htmlFor="desc">Description <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="desc" className="field min-h-24 resize-y" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add any supporting details" />
          </div>
        )}

        {mode === "claim" && (
          <label className={`flex items-start gap-3 rounded-2xl border p-4 ${available > 0 ? "cursor-pointer border-line bg-soft" : "border-line bg-soft opacity-60"}`}>
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#F15A24]" disabled={available <= 0} checked={fundedByCredit} onChange={(e) => setFundedByCredit(e.target.checked)} />
            <span>
              <span className="block font-bold">Fund this claim from credit balance</span>
              <span className={`block text-sm ${overCredit ? "font-semibold text-red-700" : "text-muted"}`}>
                {available > 0 ? `Available credit: ${omr(available)}` : "No available credit balance."}
              </span>
            </span>
          </label>
        )}

        <div>
          <span className="label">Documents <span className="font-normal text-muted">(optional)</span></span>
          {edit && edit.files.length > 0 && (
            <ul className="mb-3 space-y-2">
              {edit.files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                  <input type="checkbox" className="h-5 w-5 accent-[#F15A24]" checked={keep.includes(i)} onChange={(e) => setKeep(e.target.checked ? [...keep, i] : keep.filter((k) => k !== i))} aria-label={`Keep ${f.name}`} />
                  <a href={f.href} target="_blank" rel="noopener" className={`min-w-0 flex-1 truncate text-sm font-semibold ${keep.includes(i) ? "" : "text-muted line-through"}`}>{f.name}</a>
                  {!keep.includes(i) && <span className="text-xs font-bold text-red-600">Will be removed</span>}
                </li>
              ))}
            </ul>
          )}
          <AttachmentPicker files={files} onChange={setFiles} />
        </div>
      </div>

      <div className="card sticky bottom-24 z-10 flex items-center justify-between gap-4 p-4 sm:p-5 lg:bottom-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Total incl. tax</p>
          <p className="font-display text-2xl font-extrabold">{omr(total)}</p>
        </div>
        <button className="btn-primary px-6 py-3.5 text-base" disabled={busy}>
          {busy ? "Saving…" : edit ? "Save changes" : mode === "claim" ? "Submit claim" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
