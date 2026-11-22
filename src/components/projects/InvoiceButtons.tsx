"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generatePastPaymentInvoice, generateStageInvoice } from "@/app/portal/projects/actions";
import { Icon } from "@/components/Icon";

// If the new tab was blocked (pop-up blocker), show the invoice in this tab instead.
const open = (projectId: string, invoiceId: string) => {
  window.location.href = `/api/invoices?project=${projectId}&id=${invoiceId}&print=1`;
};

// Pick stages and print an invoice for what is still outstanding on them.
export function StageInvoicePicker({ projectId, stages }: { projectId: string; stages: Array<{ index: number; title: string; outstanding: string; status: string }> }) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(stages.map((s) => s.index));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  async function print() {
    setError("");
    if (!picked.length) return setError("Select at least one stage to invoice.");
    // Open the tab now (inside the click) so pop-up blockers allow it, then point it at the invoice.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    const result = await generateStageInvoice(projectId, picked);
    setBusy(false);
    if (!result.ok || !result.invoiceId) {
      tab?.close();
      setError(result.ok ? "Couldn't create the invoice." : result.error);
      return;
    }
    setLastId(result.invoiceId);
    if (tab) tab.location.href = `/api/invoices?project=${projectId}&id=${result.invoiceId}&print=1`;
    else open(projectId, result.invoiceId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card divide-y divide-line">
        {stages.map((s) => (
          <label key={s.index} className="flex cursor-pointer items-center gap-4 p-4 sm:p-5">
            <input type="checkbox" className="h-5 w-5 accent-[#F15A24]" checked={picked.includes(s.index)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.index] : picked.filter((i) => i !== s.index))} />
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{s.title}</span>
              <span className="block text-sm text-muted">{s.status} · outstanding {s.outstanding}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => setPicked(stages.map((s) => s.index))}>Select all</button>
        <button type="button" className="btn-ghost" onClick={() => setPicked([])}>Clear</button>
        <button type="button" className="btn-primary ml-auto px-6 py-3" onClick={print} disabled={busy}>
          <Icon name="file" className="h-5 w-5" /> {busy ? "Creating…" : picked.length === stages.length ? "Print project invoice" : `Print invoice for ${picked.length} stage${picked.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {lastId && (
        <p className="text-sm text-muted">
          Invoice created and saved to history.{" "}
          <a className="font-bold text-accent" href={`/api/invoices?project=${projectId}&id=${lastId}&print=1`} target="_blank" rel="noopener">Open it again</a>
        </p>
      )}
    </div>
  );
}

// Small "Invoice" link next to an earlier instalment.
export function PastPaymentInvoiceButton({ projectId, stageIndex, paymentIndex }: { projectId: string; stageIndex: number; paymentIndex: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    const result = await generatePastPaymentInvoice(projectId, stageIndex, paymentIndex);
    setBusy(false);
    if (!result.ok || !result.invoiceId) {
      tab?.close();
      alert(result.ok ? "Couldn't create the invoice." : result.error);
      return;
    }
    if (tab) tab.location.href = `/api/invoices?project=${projectId}&id=${result.invoiceId}&print=1`;
    else open(projectId, result.invoiceId);
    router.refresh();
  }
  return (
    <button type="button" onClick={go} disabled={busy} className="text-xs font-bold text-accent hover:underline disabled:text-muted">
      {busy ? "Creating…" : "Invoice"}
    </button>
  );
}
