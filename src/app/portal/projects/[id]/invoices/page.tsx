import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject, listInvoices } from "@/lib/data";
import { num } from "@/lib/decimal";
import { omr } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Invoice history" };

const when = (d: Date) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });

export default async function InvoiceHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [project, invoices] = await Promise.all([getProject(id), listInvoices(id)]);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/portal/projects/${id}`, label: project.name }}
        eyebrow="Invoices"
        title="Invoice history"
        subtitle="Every invoice printed for this project, from the website or the desktop app."
        action={<Link className="btn-primary py-3" href={`/portal/projects/${id}/invoice`}><Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> New invoice</Link>}
      />
      {invoices.length === 0 ? (
        <EmptyState icon="file" title="No invoices yet" text="Invoices you print for this project are saved here so they can be reopened later." />
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => {
            const href = `/api/invoices?project=${id}&id=${encodeURIComponent(inv.id)}`;
            return (
              <li key={inv.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon name="file" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {inv.invoiceNumber || inv.type} {inv.invoiceNumber && <span className="font-semibold text-muted">· {inv.type}</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{inv.summary}</p>
                  <p className="text-xs text-muted">{when(inv.generatedAt)} by {inv.generatedBy || "—"} · subtotal {omr(Math.round(num(inv.subtotal)))} + tax {omr(Math.round(num(inv.tax)))}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-display text-lg font-bold text-emerald-700">{omr(Math.round(num(inv.total)))}</p>
                  <a className="btn-ghost px-3 py-2" href={href} target="_blank" rel="noopener">View</a>
                  <a className="btn-dark px-3 py-2" href={`${href}&print=1`} target="_blank" rel="noopener">Print</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
