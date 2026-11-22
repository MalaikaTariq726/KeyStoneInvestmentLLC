"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSubcontractor } from "@/app/portal/subcontractors/actions";

export interface SubValues {
  name: string;
  tradeSpecialty: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: "Active" | "Inactive";
}

const EMPTY: SubValues = { name: "", tradeSpecialty: "", contactPerson: "", phone: "", email: "", address: "", notes: "", status: "Active" };

export function SubcontractorForm({ id, initial }: { id?: string; initial?: SubValues }) {
  const router = useRouter();
  const [v, setV] = useState<SubValues>(initial ?? EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SubValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await saveSubcontractor(id ?? null, v);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    router.push(`/portal/subcontractors/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card space-y-5 p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Subcontractor / company name</span><input className="field" required maxLength={200} value={v.name} onChange={set("name")} /></label>
          <label className="block"><span className="label">Trade / specialty</span><input className="field" required maxLength={200} value={v.tradeSpecialty} onChange={set("tradeSpecialty")} placeholder="e.g. Electrical, Plumbing, Finishing" /></label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Contact person</span><input className="field" maxLength={200} value={v.contactPerson} onChange={set("contactPerson")} /></label>
          <label className="block"><span className="label">Phone</span><input className="field" type="tel" maxLength={50} value={v.phone} onChange={set("phone")} /></label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Email <span className="font-normal text-muted">(optional)</span></span><input className="field" type="email" maxLength={200} value={v.email} onChange={set("email")} /></label>
          <label className="block"><span className="label">Status</span>
            <select className="field" value={v.status} onChange={set("status")}><option>Active</option><option>Inactive</option></select>
          </label>
        </div>
        <label className="block"><span className="label">Address</span><input className="field" maxLength={500} value={v.address} onChange={set("address")} /></label>
        <label className="block"><span className="label">Notes</span><textarea className="field min-h-24 resize-y" maxLength={2000} value={v.notes} onChange={set("notes")} /></label>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost px-5 py-3" onClick={() => router.back()}>Cancel</button>
        <button className="btn-primary px-6 py-3" disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Add subcontractor"}</button>
      </div>
    </form>
  );
}
