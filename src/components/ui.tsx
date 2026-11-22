import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function PageHeader({ eyebrow, title, subtitle, action, back }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
            <Icon name="back" className="h-4 w-4" /> {back.label}
          </Link>
        )}
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = "white" }: { label: string; value: string; hint?: string; icon: IconName; tone?: "white" | "orange" | "navy" }) {
  const styles = {
    white: "card text-ink",
    orange: "rounded-3xl text-white shadow-glow bg-gradient-to-br from-accent to-[#ff8a5b]",
    navy: "rounded-3xl text-white shadow-lift bg-ink",
  }[tone];
  const iconBox = tone === "white" ? "bg-accent/10 text-accent" : "bg-white/15 text-white";
  const sub = tone === "white" ? "text-muted" : "text-white/75";
  return (
    <div className={`${styles} relative overflow-hidden p-5 sm:p-6`}>
      <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${iconBox}`}>
        <Icon name={icon} />
      </div>
      <p className={`text-xs font-bold uppercase tracking-widest ${sub}`}>{label}</p>
      <p className="mt-1.5 font-display text-2xl font-extrabold tracking-tight sm:text-[1.7rem]">{value}</p>
      {hint && <p className={`mt-1 text-xs font-semibold ${sub}`}>{hint}</p>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  processing: "bg-orange-50 text-orange-700 ring-orange-200",
  "partially paid": "bg-orange-50 text-orange-700 ring-orange-200",
  processed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-blue-50 text-blue-700 ring-blue-200",
  payed: "bg-blue-50 text-blue-700 ring-blue-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusPill({ status }: { status: string }) {
  const s = statusStyles[(status ?? "").toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${s}`}>{status || "—"}</span>;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-soft text-muted">
        <Icon name={icon} className="h-7 w-7" />
      </div>
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs({ items, active }: { items: Array<{ key: string; label: string; href: string; count?: number }>; active: string }) {
  return (
    <div className="mb-5 flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-white p-1.5 shadow-card [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
            active === t.key ? "bg-ink text-white" : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`rounded-full px-1.5 text-[11px] ${active === t.key ? "bg-white/20" : "bg-soft"}`}>{t.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
