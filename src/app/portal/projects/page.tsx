import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listProjects } from "@/lib/data";
import { num } from "@/lib/decimal";
import { omr, omrShort } from "@/lib/format";
import { projectReceived, projectSpent } from "@/lib/models";
import { projectDate } from "@/lib/projects";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Projects" };

const OMAN = 4 * 3600e3;
const omanParts = (d: Date) => {
  const x = new Date(d.getTime() + OMAN);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), day: Math.floor(x.getTime() / 86400e3), dow: x.getUTCDay() };
};

// Same filters as the desktop app's project list.
function matchesStatus(status: string, filter: string) {
  if (!filter || filter === "all") return true;
  const s = (status ?? "").toLowerCase();
  if (filter === "completed") return ["closed", "processed", "paid", "payed"].includes(s);
  return s === filter;
}

function matchesDate(d: Date, filter: string) {
  if (!filter || filter === "all") return true;
  const p = omanParts(d);
  const t = omanParts(new Date());
  if (filter === "week") return p.day >= t.day - t.dow && p.day <= t.day;
  if (filter === "month") return p.y === t.y && p.m === t.m;
  if (filter === "year") return p.y === t.y;
  return true;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; date?: string }> }) {
  await requireAdmin();
  const { q = "", status = "all", date = "all" } = await searchParams;
  const all = await listProjects();
  const needle = q.trim().toLowerCase();
  const projects = all
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.clientName ?? "").toLowerCase().includes(needle))
    .filter((p) => matchesStatus(p.status, status))
    .filter((p) => matchesDate(projectDate(p), date))
    .sort((a, b) => projectDate(b).getTime() - projectDate(a).getTime());
  const filtered = needle || status !== "all" || date !== "all";

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Projects"
        subtitle="Contracts, payment stages, money received and money spent."
        action={<Link href="/portal/projects/new" className="btn-primary py-3"><Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> New project</Link>}
      />

      <form className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <input name="q" defaultValue={q} className="field" placeholder="Search project or client" aria-label="Search project or client" />
        <select name="status" defaultValue={status} className="field" aria-label="Status">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
        </select>
        <select name="date" defaultValue={date} className="field" aria-label="Created">
          <option value="all">All dates</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
        <div className="flex gap-2">
          <button className="btn-dark flex-1 px-5">Filter</button>
          {filtered && <Link href="/portal/projects" className="btn-ghost">Clear</Link>}
        </div>
      </form>

      {projects.length === 0 ? (
        all.length === 0 ? (
          <EmptyState icon="projects" title="No projects yet" text="Create your first project to start tracking stages, payments and expenses." action={<Link href="/portal/projects/new" className="btn-primary">New project</Link>} />
        ) : (
          <EmptyState icon="projects" title="No matches" text="No projects match these filters." action={<Link href="/portal/projects" className="btn-ghost">Clear filters</Link>} />
        )
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-muted">{projects.length} of {all.length} projects</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const value = num(p.contractValue);
              const recv = projectReceived(p);
              const spent = projectSpent(p);
              const pct = value > 0 ? Math.min(100, (recv / value) * 100) : 0;
              return (
                <Link key={p._id.toHexString()} href={`/portal/projects/${p._id.toHexString()}`} className="card flex flex-col p-5 transition hover:-translate-y-1 hover:shadow-lift sm:p-6">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-display text-lg font-bold">{p.name}</p>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="truncate text-sm text-muted">{p.clientName || "—"}{p.natureOfProject ? ` · ${p.natureOfProject}` : ""}</p>
                  <p className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">Contract value</p>
                  <p className="font-display text-2xl font-extrabold">{omr(Math.round(value))}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-soft">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-2" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-muted">{Math.round(pct)}% received · {(p.clauses ?? []).length} stages</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
                    <div><p className="text-xs text-muted">Received</p><p className="font-bold">{omrShort(recv)}</p></div>
                    <div><p className="text-xs text-muted">Spent</p><p className="font-bold text-accent">{omrShort(spent)}</p></div>
                    <div><p className="text-xs text-muted">Expenses</p><p className="font-bold">{p.expenses.length}</p></div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
