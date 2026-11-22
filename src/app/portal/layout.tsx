import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { BottomNav, SideNav, type NavItem } from "@/components/Nav";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();

  const items: NavItem[] = me.isAdmin
    ? [
        { href: "/portal", label: "Dashboard", icon: "home" },
        { href: "/portal/claims", label: "Claims", icon: "claims" },
        { href: "/portal/projects", label: "Projects", icon: "projects" },
        { href: "/portal/employees", label: "Employees", icon: "person" },
        { href: "/portal/subcontractors", label: "Subcontractors", icon: "projects" },
        { href: "/portal/expenses", label: "Expenses", icon: "expenses" },
        { href: "/portal/ledger", label: "Ledger", icon: "ledger" },
        { href: "/portal/users", label: "Users", icon: "users" },
      ]
    : [
        { href: "/portal", label: "Home", icon: "home" },
        { href: "/portal/claims/new", label: "New claim", icon: "plus" },
        { href: "/portal/claims", label: "My claims", icon: "claims" },
      ];

  // Phones have room for five tabs; the rest of the admin sections live under "More".
  const mobileItems: NavItem[] = me.isAdmin
    ? [...items.slice(0, 4), { href: "/portal/more", label: "More", icon: "menu" }]
    : items;

  const initials = me.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleBadge = (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${me.isAdmin ? "bg-accent/12 text-accent" : "bg-primary/10 text-primary"}`}>
      {me.role}
    </span>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white p-5 lg:flex">
        <Link href="/portal" className="mb-9 px-1.5">
          <Logo />
        </Link>
        <SideNav items={items} />
        {!me.isAdmin && (
          <Link href="/portal/claims/new" className="btn-primary mt-6 py-3">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> New claim
          </Link>
        )}
        <div className="mt-auto rounded-2xl border border-line bg-soft p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink font-display text-sm font-bold text-white">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{me.fullName}</p>
              <p className="truncate text-xs text-muted">{me.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            {roleBadge}
            <form action="/api/auth/logout" method="post">
              <button className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-accent">
                <Icon name="logout" className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/85 px-4 py-3 backdrop-blur-lg lg:hidden">
          <Link href="/portal"><Logo /></Link>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink font-display text-sm font-bold text-white">{initials}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-white p-4 shadow-lift">
              <p className="truncate font-bold">{me.fullName}</p>
              <p className="mb-3 truncate text-xs text-muted">{me.email}</p>
              {roleBadge}
              <form action="/api/auth/logout" method="post" className="mt-4">
                <button className="btn-ghost w-full"><Icon name="logout" className="h-4 w-4" /> Sign out</button>
              </form>
            </div>
          </details>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      <BottomNav items={mobileItems} />
    </div>
  );
}
