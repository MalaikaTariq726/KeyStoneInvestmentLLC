"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createUser, updateUser } from "../actions";
import { Icon } from "@/components/Icon";

type Employee = { id: string; name: string; designation: string };

export function UserControls({ userId, isSelf, role, employeeId, employees }: { userId: string; isSelf: boolean; role: "Admin" | "User"; employeeId: string; employees: Employee[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(changes: Parameters<typeof updateUser>[1]) {
    setBusy(true);
    setError("");
    const result = await updateUser(userId, changes);
    setBusy(false);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted">Role</span>
        <select className="field py-2.5" value={role} disabled={busy || isSelf} onChange={(e) => save({ role: e.target.value as "Admin" | "User" })} title={isSelf ? "You can't change your own role" : undefined}>
          <option value="User">User</option>
          <option value="Admin">Admin</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted">Linked employee</span>
        <select className="field py-2.5" value={employeeId} disabled={busy} onChange={(e) => save({ employeeId: e.target.value || null })}>
          <option value="">Not linked</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ""}</option>)}
        </select>
      </label>
      {error && <p className="text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
    </div>
  );
}

export function AddUserButton({ domain, employees }: { domain: string; employees: Employee[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const local = String(form.get("email") ?? "").trim().toLowerCase();
    const result = await createUser({
      fullName: form.get("fullName"),
      email: local.includes("@") ? local : `${local}@${domain}`,
      role: form.get("role"),
      employeeId: form.get("employeeId") || undefined,
      password: form.get("password") || undefined,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    dialog.current?.close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-primary py-3" onClick={() => { setError(""); dialog.current?.showModal(); }}>
        <Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> Add user
      </button>
      <dialog ref={dialog} className="m-auto w-[min(94vw,480px)] rounded-3xl border border-line p-0 shadow-lift backdrop:bg-ink/40 backdrop:backdrop-blur-sm">
        <form action={submit} className="space-y-4 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Add a user</h2>
              <p className="text-sm text-muted">They sign in with a code sent to their email.</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-soft" aria-label="Close"><Icon name="x" /></button>
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
          <label className="block"><span className="label">Full name</span><input name="fullName" required className="field" /></label>
          <label className="block">
            <span className="label">Work email</span>
            <div className="flex rounded-xl border border-line bg-soft focus-within:border-accent focus-within:bg-white focus-within:ring-4 focus-within:ring-accent/15">
              <input name="email" required autoCapitalize="none" spellCheck={false} className="min-w-0 flex-1 bg-transparent px-3.5 py-3 outline-none" placeholder="name" />
              <span className="flex items-center pr-3.5 text-sm text-muted">@{domain}</span>
            </div>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Role</span>
              <select name="role" className="field" defaultValue="User"><option>User</option><option>Admin</option></select>
            </label>
            <label className="block">
              <span className="label">Employee</span>
              <select name="employeeId" className="field" defaultValue=""><option value="">Not linked</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            </label>
          </div>
          <label className="block">
            <span className="label">Desktop app password <span className="font-normal text-muted">(optional)</span></span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} className="field" placeholder="Leave empty for portal-only access" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Adding…" : "Add user"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
