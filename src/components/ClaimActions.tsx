"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decideClaim, deleteClaim } from "@/app/portal/actions";
import { Icon } from "./Icon";

type Kind = "approve" | "reject" | "delete";

const copy: Record<Kind, { title: string; button: string; cls: string }> = {
  approve: { title: "Approve claim", button: "Approve", cls: "btn-success" },
  reject: { title: "Reject claim", button: "Reject", cls: "btn-danger" },
  delete: { title: "Delete claim", button: "Delete", cls: "btn-danger" },
};

export function ClaimActions({ id, title, amount, target, canDecide, canDelete, compact = false, afterDelete }: {
  id: string;
  title: string;
  amount: string;
  target: string; // "an expense on Project X" / "a general expense"
  canDecide: boolean;
  canDelete: boolean;
  compact?: boolean;
  afterDelete?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("approve");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open(k: Kind) {
    setKind(k);
    setError("");
    dialog.current?.showModal();
  }

  async function confirm() {
    setBusy(true);
    setError("");
    const result = kind === "delete" ? await deleteClaim(id) : await decideClaim(id, kind);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    dialog.current?.close();
    if (kind === "delete" && afterDelete) router.push(afterDelete);
    router.refresh();
  }

  const message =
    kind === "approve"
      ? <>Approve <b>&ldquo;{title}&rdquo;</b> for <b>{amount}</b>? It will be posted as {target}.</>
      : kind === "reject"
        ? <>Reject <b>&ldquo;{title}&rdquo;</b> for <b>{amount}</b>?</>
        : <>Delete <b>&ldquo;{title}&rdquo;</b>? This can&apos;t be undone.</>;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "w-full sm:w-auto"}`}>
        {canDecide && (
          <>
            <button type="button" className={`btn-success ${compact ? "px-3 py-2" : "flex-1 sm:flex-none"}`} onClick={() => open("approve")}>
              <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Approve
            </button>
            <button type="button" className={`btn-danger ${compact ? "px-3 py-2" : "flex-1 sm:flex-none"}`} onClick={() => open("reject")}>
              <Icon name="x" className="h-4 w-4" strokeWidth={2.4} /> Reject
            </button>
          </>
        )}
        {canDelete && !compact && (
          <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={() => open("delete")}>
            <Icon name="trash" className="h-4 w-4" /> Delete
          </button>
        )}
      </div>

      <dialog ref={dialog} className="m-auto w-[min(92vw,420px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <div className="p-6">
          <h2 className="font-display text-xl font-bold">{copy[kind].title}</h2>
          <p className="mt-2 text-muted">{message}</p>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button>
            <button type="button" className={copy[kind].cls} onClick={confirm} disabled={busy}>{busy ? "Working…" : copy[kind].button}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
