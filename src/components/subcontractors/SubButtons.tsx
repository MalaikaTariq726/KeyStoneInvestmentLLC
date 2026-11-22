"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAgreement, deleteSubcontractor } from "@/app/portal/subcontractors/actions";
import { Icon } from "@/components/Icon";

export function DeleteSubcontractorButton({ id, name, agreementCount }: { id: string; name: string; agreementCount: number }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    setError("");
    const result = await deleteSubcontractor(id, typed);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/portal/subcontractors");
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-danger" onClick={() => { setTyped(""); setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Delete subcontractor
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="space-y-4 p-6">
          <h2 className="font-display text-xl font-bold text-red-700">Delete subcontractor</h2>
          <p className="text-muted">
            This removes <b>{name}</b> from the directory.
            {agreementCount > 0 ? <> Their <b>{agreementCount} project agreement{agreementCount === 1 ? "" : "s"}</b> and any payments already posted stay on those projects.</> : null}
            {" "}To keep them listed, set the status to <b>Inactive</b> instead.
          </p>
          <label className="block"><span className="label">Type the name to confirm</span><input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} /></label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={busy || typed.trim() !== name.trim()}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function RemoveAgreementButton({ projectId, subcontractorId, name }: { projectId: string; subcontractorId: string; name: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    const result = await deleteAgreement(projectId, subcontractorId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    dialog.current?.close();
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-danger px-3 py-2" onClick={() => { setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Remove
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,420px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="p-6">
          <h2 className="font-display text-xl font-bold">Remove agreement</h2>
          <p className="mt-2 text-muted">Remove <b>{name}</b>&apos;s agreement from this project? Payments already posted as project expenses stay.</p>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={busy}>{busy ? "Removing…" : "Remove"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
