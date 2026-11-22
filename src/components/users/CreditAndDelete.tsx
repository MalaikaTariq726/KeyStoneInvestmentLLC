"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteUser, grantCredit } from "@/app/portal/actions";
import { Icon } from "@/components/Icon";
import { omr } from "@/lib/format";

export function GrantCreditForm({ userId, name, outstanding }: { userId: string; name: string; outstanding: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter a valid credit amount greater than zero.");
    setBusy(true);
    const result = await grantCredit(userId, value, note);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone(`Granted ${omr(value)} to ${name}.`);
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg font-bold">Grant credit</h2>
        <p className="text-sm text-muted">{name} currently has {omr(outstanding)} outstanding. There is no credit limit.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      {done && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{done}</p>}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <label className="block"><span className="label">Amount (OMR)</span><input className="field font-bold" type="number" inputMode="decimal" min="0.001" step="0.001" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block"><span className="label">Note <span className="font-normal text-muted">(optional)</span></span><input className="field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Advance for site materials" /></label>
        <button className="btn-primary py-3" disabled={busy}><Icon name="wallet" className="h-4 w-4" /> {busy ? "Granting…" : "Grant credit"}</button>
      </div>
    </form>
  );
}

export function DeleteUserButton({ userId, email, name }: { userId: string; email: string; name: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    setError("");
    const result = await deleteUser(userId, typed);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/portal/users");
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-danger" onClick={() => { setTyped(""); setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Delete user
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="space-y-4 p-6">
          <h2 className="font-display text-xl font-bold text-red-700">Delete user</h2>
          <p className="text-muted">Remove <b>{name}</b>&apos;s account? They will no longer be able to sign in to the website or the desktop app. Their claims stay in the records.</p>
          <label className="block"><span className="label">Type their email to confirm</span><input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} autoCapitalize="none" /></label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={busy || typed.trim().toLowerCase() !== email.toLowerCase()}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
