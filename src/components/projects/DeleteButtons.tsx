"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteGeneralExpense, deleteProject, deleteProjectExpense } from "@/app/portal/projects/actions";
import { Icon } from "@/components/Icon";

function useConfirm() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return { dialog, error, setError, busy, setBusy };
}

export function DeleteExpenseButton({ target, title }: { target: { kind: "project"; projectId: string; index: number } | { kind: "general"; id: string }; title: string }) {
  const router = useRouter();
  const { dialog, error, setError, busy, setBusy } = useConfirm();
  async function confirm() {
    setBusy(true);
    setError("");
    const result = target.kind === "project" ? await deleteProjectExpense(target.projectId, target.index, title) : await deleteGeneralExpense(target.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    dialog.current?.close();
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-danger px-3 py-2" onClick={() => { setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Delete
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,420px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="p-6">
          <h2 className="font-display text-xl font-bold">Delete expense</h2>
          <p className="mt-2 text-muted">Delete <b>&ldquo;{title}&rdquo;</b>? This can&apos;t be undone.</p>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={confirm} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function DeleteProjectButton({ projectId, name, claimCount }: { projectId: string; name: string; claimCount: number }) {
  const router = useRouter();
  const { dialog, error, setError, busy, setBusy } = useConfirm();
  const [typed, setTyped] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    const result = await deleteProject(projectId, typed);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/portal/projects");
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-danger" onClick={() => { setTyped(""); setError(""); dialog.current?.showModal(); }}>
        <Icon name="trash" className="h-4 w-4" /> Delete project
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,460px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="space-y-4 p-6">
          <h2 className="font-display text-xl font-bold text-red-700">Delete project permanently</h2>
          <p className="text-muted">
            This deletes <b>{name}</b> with all its stages, payments, expenses and invoice history
            {claimCount > 0 ? <>, plus <b>{claimCount} claim{claimCount === 1 ? "" : "s"}</b> raised against it</> : null}. It can&apos;t be undone.
          </p>
          <label className="block"><span className="label">Type the project name to confirm</span><input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} /></label>
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
