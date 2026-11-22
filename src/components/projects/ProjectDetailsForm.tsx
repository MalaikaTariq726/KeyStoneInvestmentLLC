"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, updateProjectDetails } from "@/app/portal/projects/actions";

const NATURES = [
  "Design",
  "Design - Consultancy",
  "Construction - Gray Structure",
  "Construction - Gray Structure + Finishes",
  "Construction - Finishes Only Labour",
];

export interface ProjectDetailsValues {
  clientName: string;
  name: string;
  description: string;
  contractValue: string;
  natureOfProject: string;
}

export function ProjectDetailsForm({ projectId, initial, hasStages }: { projectId?: string; initial?: ProjectDetailsValues; hasStages?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<ProjectDetailsValues>(
    initial ?? { clientName: "", name: "", description: "", contractValue: "", natureOfProject: NATURES[0] },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ProjectDetailsValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const base = (Number(v.contractValue) || 0) / 1.05;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = projectId ? await updateProjectDetails(projectId, v) : await createProject(v);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    router.push(projectId ? `/portal/projects/${projectId}` : `/portal/projects/${result.id}/stages?new=1`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card space-y-5 p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Client name</span><input className="field" required maxLength={200} value={v.clientName} onChange={set("clientName")} /></label>
          <label className="block"><span className="label">Project name</span><input className="field" required maxLength={200} value={v.name} onChange={set("name")} /></label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Contract value (OMR, incl. 5% VAT)</span>
            <input className="field text-lg font-bold" required type="number" inputMode="decimal" min="0" step="0.001" value={v.contractValue} onChange={set("contractValue")} placeholder="0" />
            <span className="mt-1.5 block text-xs text-muted">Stages are worked out on OMR {base.toLocaleString("en-US", { maximumFractionDigits: 3 })} (excl. VAT)</span>
          </label>
          <label className="block">
            <span className="label">Work description</span>
            <select className="field" value={v.natureOfProject} onChange={set("natureOfProject")}>
              {(NATURES.includes(v.natureOfProject) ? NATURES : [v.natureOfProject, ...NATURES]).map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="label">Description</span>
          <textarea className="field min-h-28 resize-y" required maxLength={4000} value={v.description} onChange={set("description")} placeholder="Write a short project description" />
        </label>
        {projectId && hasStages && (
          <p className="rounded-xl bg-soft px-4 py-3 text-sm text-muted">
            Changing the contract value updates percentage stages automatically. Fixed-amount stages keep their amount.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost px-5 py-3" onClick={() => router.back()}>Cancel</button>
        <button className="btn-primary px-6 py-3" disabled={busy}>{busy ? "Saving…" : projectId ? "Save changes" : "Save & add stages"}</button>
      </div>
    </form>
  );
}
