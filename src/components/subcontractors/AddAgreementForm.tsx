"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addAgreement } from "@/app/portal/subcontractors/actions";
import { omr } from "@/lib/format";

export function AddAgreementForm({ projectId, options, available }: { projectId: string; options: Array<{ id: string; name: string; trade: string }>; available: number }) {
  const router = useRouter();
  const [sub, setSub] = useState(options[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await addAgreement(projectId, sub, Number(value));
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    // Straight on to the agreement's stages, as the desktop app does.
    router.push(`/portal/projects/${projectId}/subcontractors/${sub}?new=1`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card space-y-5 p-5 sm:p-7">
        <label className="block"><span className="label">Subcontractor</span>
          <select className="field" value={sub} onChange={(e) => setSub(e.target.value)} required>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.trade ? ` · ${o.trade}` : ""}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Agreement value (OMR, excl. VAT)</span>
          <input className="field text-lg font-bold" type="number" inputMode="decimal" min="0.001" step="0.001" required value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="mt-1.5 block text-xs text-muted">Up to {omr(Math.round(available))} is still available on this project&apos;s contract value.</span>
        </label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost px-5 py-3" onClick={() => router.back()}>Cancel</button>
        <button className="btn-primary px-6 py-3" disabled={busy}>{busy ? "Saving…" : "Add & set stages"}</button>
      </div>
    </form>
  );
}
