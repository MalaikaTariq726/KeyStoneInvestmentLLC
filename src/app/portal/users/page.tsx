import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listClaimsForCredit, listEmployees, listUsers } from "@/lib/data";
import { env } from "@/lib/env";
import { omr } from "@/lib/format";
import { creditSummary, roleOf } from "@/lib/models";
import { PageHeader } from "@/components/ui";
import { AddUserButton, UserControls } from "./UserControls";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, employees, creditClaims] = await Promise.all([listUsers(), listEmployees(), listClaimsForCredit()]);
  const domain = env.allowedDomain;
  const employeeOptions = employees.map((e) => ({ id: e._id.toHexString(), name: e.name, designation: e.designation }));
  // An employee can be linked to one account only, and disabled employees can't be linked
  // (same as the desktop app's picker) - each user still sees their own current link.
  const disabled = new Set(employees.filter((e) => (e.status ?? "").toLowerCase() === "disabled").map((e) => e._id.toHexString()));
  const optionsFor = (userId: string | null) => {
    const takenElsewhere = new Set(users.filter((u) => u.employeeId && u._id.toHexString() !== userId).map((u) => u.employeeId as string));
    const own = userId ? users.find((u) => u._id.toHexString() === userId)?.employeeId : null;
    return employeeOptions.filter((e) => e.id === own || (!takenElsewhere.has(e.id) && !disabled.has(e.id)));
  };

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Users & roles"
        subtitle={`Only @${domain} accounts can sign in to the portal. Roles apply to the desktop app too.`}
        action={<AddUserButton domain={domain} employees={optionsFor(null)} />}
      />

      <ul className="grid gap-3 lg:grid-cols-2">
        {users.map((u) => {
          const id = u._id.toHexString();
          const email = (u.email ?? "").trim().toLowerCase();
          const canPortal = email.endsWith(`@${domain}`);
          const credit = creditSummary(u, creditClaims);
          const initials = (u.fullName || email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
          return (
            <li key={id} className="card p-5">
              <div className="flex items-start gap-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display font-bold ${roleOf(u.role) === "Admin" ? "bg-ink text-white" : "bg-soft text-ink"}`}>{initials}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/portal/users/${id}`} className="block truncate font-bold hover:text-accent">
                    {u.fullName || "—"} {id === me.id && <span className="text-xs font-semibold text-muted">(you)</span>}
                  </Link>
                  <p className="truncate text-sm text-muted">{email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    {canPortal ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Portal access</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Desktop only · not a @{domain} email</span>
                    )}
                    {credit.granted > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{omr(credit.outstanding)} credit outstanding</span>}
                  </div>
                </div>
              </div>
              <UserControls
                userId={id}
                isSelf={id === me.id}
                role={roleOf(u.role)}
                employeeId={u.employeeId ?? ""}
                employees={optionsFor(id)}
              />
              <div className="mt-3 flex justify-end">
                <Link href={`/portal/users/${id}`} className="text-sm font-bold text-accent">Credit, claims &amp; account →</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
