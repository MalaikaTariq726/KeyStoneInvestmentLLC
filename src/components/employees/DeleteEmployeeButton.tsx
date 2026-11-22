"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEmployee } from "@/app/portal/employees/actions";
import { Icon } from "@/components/Icon";

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError("");
    const result = await deleteEmployee(id, typed);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/portal/employees");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-danger" onClick={() => { setTyped(""); setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Delete employee
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="space-y-4 p-6">
          <h2 className="font-display text-xl font-bold text-red-700">Delete employee permanently</h2>
          <p className="text-muted">
            This deletes <b>{name}</b> and their whole salary history. Salary already charged to projects disappears from project cash flow too.
            To keep the history, set them to <b>Disabled</b> instead.
          </p>
          <label className="block"><span className="label">Type the employee&apos;s name to confirm</span><input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} /></label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={busy || typed.trim() !== name.trim()}>{busy ? "Deleting…" : "Delete forever"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
