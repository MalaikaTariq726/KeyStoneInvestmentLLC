"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployee, updateEmployee } from "@/app/portal/employees/actions";
import { Icon } from "@/components/Icon";
import { omr, todayInput } from "@/lib/format";

export interface EmployeeValues {
  name: string;
  designation: string;
  phone: string;
  monthlySalary: string;
  joiningDate: string;
  status: "Permanent" | "Disabled";
  disabledAt: string;
  allocations: Array<{ projectId: string; percent: string }>;
}

export function EmployeeForm({
  employeeId,
  initial,
  projects,
  clearance,
}: {
  employeeId?: string;
  initial?: EmployeeValues;
  projects: Array<{ id: string; name: string }>;
  clearance?: { unpaidSalary: number; outstandingCredit: number }; // for an existing employee
}) {
  const router = useRouter();
  const [v, setV] = useState<EmployeeValues>(
    initial ?? { name: "", designation: "", phone: "", monthlySalary: "", joiningDate: todayInput(), status: "Permanent", disabledAt: todayInput(), allocations: [] },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EmployeeValues>(k: K, val: EmployeeValues[K]) => setV({ ...v, [k]: val });

  const splitTotal = v.allocations.reduce((s, a) => s + (Number(a.percent) || 0), 0);
  const splitNote =
    v.allocations.length === 0
      ? "Not on any project, so the salary counts as company overhead."
      : splitTotal >= 100
        ? `Total ${Number(splitTotal.toFixed(2))}% of salary charged to projects.`
        : `Total ${Number(splitTotal.toFixed(2))}% charged to projects; ${Number((100 - splitTotal).toFixed(2))}% is company overhead.`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = { ...v, allocations: v.allocations.map((a) => ({ projectId: a.projectId, percent: a.percent })) };
    const result = employeeId ? await updateEmployee(employeeId, payload) : await createEmployee(payload);
    setBusy(false);
    if (!result.ok) { setError(result.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    router.push(`/portal/employees/${result.id}`);
    router.refresh();
  }

  const net = clearance ? clearance.unpaidSalary - clearance.outstandingCredit : 0;

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="card space-y-5 p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Employee name</span><input className="field" required maxLength={200} value={v.name} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="block"><span className="label">Designation</span><input className="field" required maxLength={200} value={v.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Site Engineer" /></label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Phone</span><input className="field" type="tel" maxLength={50} value={v.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="block"><span className="label">Monthly salary (OMR)</span><input className="field font-bold" required type="number" inputMode="decimal" min="0" step="0.001" value={v.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} /></label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block"><span className="label">Joining date</span><input className="field" type="date" required max={todayInput()} value={v.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} /></label>
          <label className="block"><span className="label">Employee status</span>
            <select className="field" value={v.status} onChange={(e) => set("status", e.target.value as EmployeeValues["status"])}>
              <option>Permanent</option>
              <option>Disabled</option>
            </select>
          </label>
        </div>
        {v.status === "Disabled" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="hidden sm:block" />
            <label className="block"><span className="label">Last working day</span><input className="field" type="date" required min={v.joiningDate} max={todayInput()} value={v.disabledAt} onChange={(e) => set("disabledAt", e.target.value)} /></label>
          </div>
        )}

        <div>
          <span className="label">Projects (salary split)</span>
          <div className="space-y-2">
            {v.allocations.map((a, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="field min-w-0 flex-[2]"
                  value={a.projectId}
                  required
                  onChange={(e) => set("allocations", v.allocations.map((x, j) => (j === i ? { ...x, projectId: e.target.value } : x)))}
                >
                  <option value="">Choose project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  className="field min-w-0 flex-1"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  required
                  placeholder="% of salary"
                  value={a.percent}
                  onChange={(e) => set("allocations", v.allocations.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))}
                />
                <button type="button" className="grid w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-red-50 hover:text-red-600" onClick={() => set("allocations", v.allocations.filter((_, j) => j !== i))} aria-label="Remove project">
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-2" disabled={projects.length === 0} onClick={() => set("allocations", [...v.allocations, { projectId: "", percent: "" }])}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> Add project
          </button>
          <p className={`mt-2 text-sm ${splitTotal > 100 ? "font-semibold text-red-700" : "text-muted"}`}>{splitNote}</p>
        </div>

        {employeeId && v.status === "Disabled" && clearance && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-bold">Final settlement</p>
            <p className="mt-1">Unpaid salary owed to {v.name || "the employee"}: <b>{omr(Math.round(clearance.unpaidSalary))}</b></p>
            {clearance.outstandingCredit > 0 ? (
              <p>Outstanding unclaimed credit (deduct from settlement): <b>{omr(Math.round(clearance.outstandingCredit))}</b></p>
            ) : (
              <p>No outstanding unclaimed credit.</p>
            )}
            <p className="mt-1 font-bold">Net settlement: {omr(Math.round(net))}{net < 0 ? " (employee owes the company)" : ""}</p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-ghost px-5 py-3" onClick={() => router.back()}>Cancel</button>
        <button className="btn-primary px-6 py-3" disabled={busy}>{busy ? "Saving…" : employeeId ? "Save changes" : "Add employee"}</button>
      </div>
    </form>
  );
}
