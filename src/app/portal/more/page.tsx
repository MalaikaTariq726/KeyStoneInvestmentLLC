import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";

export const metadata = { title: "More" };

const links: Array<{ href: string; label: string; text: string; icon: IconName }> = [
  { href: "/portal/subcontractors", label: "Subcontractors", text: "Directory, project agreements and contracts", icon: "projects" },
  { href: "/portal/expenses", label: "General expenses", text: "Company costs not tied to a project", icon: "expenses" },
  { href: "/portal/ledger", label: "Ledger", text: "Every payment in and out, with filters", icon: "ledger" },
  { href: "/portal/users", label: "Users & roles", text: "Who can sign in, admin or user", icon: "users" },
];

// Phone-only overflow menu for admin sections that don't fit in the bottom tab bar.
export default async function MorePage() {
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="Admin" title="More" />
      <ul className="card divide-y divide-line">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-4 px-5 py-4 hover:bg-soft/60">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name={l.icon} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{l.label}</span>
                <span className="block text-sm text-muted">{l.text}</span>
              </span>
              <Icon name="arrow" className="h-5 w-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
