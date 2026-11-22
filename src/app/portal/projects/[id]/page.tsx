import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject, listClaims, listInvoices } from "@/lib/data";
import { num } from "@/lib/decimal";
import { fmtDate, omr } from "@/lib/format";
import { clauseSettled, projectReceived, projectSpent, totalAmount, VAT_RATE } from "@/lib/models";
import { clauseRemaining, contractBase, expenseDate, hasDate, stageInflows } from "@/lib/projects";
import { listEmployeesFull } from "@/lib/employees";
import { projectSalaryCharges } from "@/lib/salary";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui";
import { ExpenseList } from "@/components/ExpenseList";
import { Icon } from "@/components/Icon";
import { PastPaymentInvoiceButton } from "@/components/projects/InvoiceButtons";
import { DeleteProjectButton } from "@/components/projects/DeleteButtons";
import { RemoveAgreementButton } from "@/components/subcontractors/SubButtons";
import { agreementPaid, agreementRemaining } from "@/lib/subcontractors";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stagesSaved?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { stagesSaved } = await searchParams;
  const [project, invoices, claims, employees] = await Promise.all([getProject(id), listInvoices(id), listClaims({ projectId: id }), listEmployeesFull()]);
  if (!project) notFound();

  const value = num(project.contractValue);
  const recv = projectReceived(project);
  const spent = projectSpent(project);
  const clauses = project.clauses ?? [];
  const agreements = project.subcontractorAgreements ?? [];
  const canCollect = clauses.some((c) => clauseRemaining(c) > 0.01);
  const expenses = [...project.expenses].sort((a, b) => expenseDate(project, b.transactionDate).getTime() - expenseDate(project, a.transactionDate).getTime());

  // Project cash flow, as in the desktop app: client instalments in; expenses and salary charged
  // to this project through employees' salary splits out.
  const salaryCharges = projectSalaryCharges(employees, id);
  const flows = [
    ...stageInflows(project).map((f) => ({ date: f.date, title: f.title, kind: "Stage payment", amount: f.amount, inflow: true })),
    ...project.expenses.map((e) => ({ date: expenseDate(project, e.transactionDate), title: e.title, kind: e.type || "Expense", amount: totalAmount(e), inflow: false })),
    ...salaryCharges.map((c) => ({ date: c.date, title: `${c.employeeName} - salary ${c.month}`, kind: `Employee Salary · ${Number(c.percent.toFixed(2))}%`, amount: c.amount, inflow: false })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());
  const net = flows.reduce((s, f) => s + (f.inflow ? f.amount : -f.amount), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/portal/projects", label: "Projects" }}
        eyebrow={project.clientName || "Project"}
        title={project.name}
        subtitle={[project.natureOfProject, project.description].filter(Boolean).join(" · ") || undefined}
      />

      {stagesSaved && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          <Icon name="check" className="h-5 w-5" strokeWidth={2.4} /> Stages saved. You can print the project invoice now.
          <Link href={`/portal/projects/${id}/invoice`} className="ml-auto rounded-lg bg-white px-3 py-1.5 text-emerald-800 shadow-card">Print invoice</Link>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        {canCollect && (
          <Link href={`/portal/projects/${id}/payment`} className="btn-primary py-3"><Icon name="wallet" className="h-5 w-5" /> Record payment</Link>
        )}
        <Link href={`/portal/projects/${id}/invoice`} className="btn-dark py-3"><Icon name="file" className="h-5 w-5" /> Print invoice</Link>
        <Link href={`/portal/projects/${id}/add-expense`} className="btn-ghost py-3"><Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> Add expense</Link>
        <Link href={`/portal/projects/${id}/edit`} className="btn-ghost py-3">Edit details</Link>
        <Link href={`/portal/projects/${id}/stages`} className="btn-ghost py-3">{clauses.length ? "Edit stages" : "Add stages"}</Link>
        <Link href={`/portal/projects/${id}/invoices`} className="btn-ghost py-3">Invoice history <span className="rounded-full bg-soft px-1.5 text-xs">{invoices.length}</span></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="navy" icon="trend" label="Contract value" value={omr(Math.round(value))} hint={`Base ${omr(Math.round(contractBase(value)))} excl. VAT`} />
        <StatCard icon="wallet" label="Received" value={omr(Math.round(recv))} hint={value ? `${Math.round((recv / value) * 100)}% of contract` : undefined} />
        <StatCard tone="orange" icon="expenses" label="Spent" value={omr(Math.round(spent))} hint={`${project.expenses.length} expenses`} />
        <StatCard icon="projects" label="Net cash" value={omr(Math.round(net))} hint="In minus out, incl. salaries" />
      </div>

      {/* Stages */}
      <section className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-xl font-bold">Payment stages</h2>
          <StatusPill status={project.status} />
        </div>
        {clauses.length === 0 ? (
          <EmptyState icon="claims" title="No stages yet" text="Split the contract into payment stages to start invoicing." action={<Link className="btn-primary" href={`/portal/projects/${id}/stages`}>Add stages</Link>} />
        ) : (
          <ul className="space-y-3">
            {clauses.map((c, i) => {
              const amount = num(c.paymentAmount);
              const settled = clauseSettled(c);
              const pctDone = amount > 0 ? Math.min(100, (settled / amount) * 100) : 0;
              const payments = (c.payments ?? []).map((p, pi) => ({ p, pi })).sort((a, b) => new Date(b.p.paidAt).getTime() - new Date(a.p.paidAt).getTime());
              return (
                <li key={i} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="whitespace-pre-line font-bold">{c.title || `Stage ${i + 1}`}</p>
                      <p className="text-sm text-muted">
                        {Number(num(c.percentage).toFixed(2))}% · {omr(Math.round(amount))} + VAT = {omr(Math.round(amount * (1 + VAT_RATE)))}
                      </p>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${pctDone}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-muted">
                    Collected {omr(Math.round(settled))} · remaining {omr(Math.round(clauseRemaining(c)))} (excl. VAT)
                    {hasDate(c.closedAt) && ` · closed ${fmtDate(c.closedAt)}`}
                  </p>
                  {payments.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                      {payments.map(({ p, pi }) => (
                        <li key={pi} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="font-semibold">{omr(Math.round(num(p.amount)))}</span>
                          <span className="text-muted">on {fmtDate(p.paidAt)}{p.note ? ` · ${p.note}` : ""}{p.recordedBy ? ` · by ${p.recordedBy}` : ""}</span>
                          <PastPaymentInvoiceButton projectId={id} stageIndex={i} paymentIndex={pi} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Subcontractors */}
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Subcontractors</h2>
            <p className="text-sm text-muted">
              Committed {omr(Math.round(agreements.reduce((s, a) => s + num(a.agreementValue), 0)))} · paid {omr(Math.round(agreements.reduce((s, a) => s + agreementPaid(a), 0)))} (excl. VAT)
            </p>
          </div>
          <Link href={`/portal/projects/${id}/subcontractors/new`} className="btn-ghost py-2.5"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> Add agreement</Link>
        </div>
        {agreements.length === 0 ? (
          <EmptyState icon="projects" title="No subcontractor agreements" text="Give a subcontractor part of this project's work with its own payment stages." />
        ) : (
          <ul className="space-y-3">
            {agreements.map((a) => {
              const value = num(a.agreementValue);
              const paidA = agreementPaid(a);
              const pct = value > 0 ? Math.min(100, (paidA / value) * 100) : 0;
              return (
                <li key={a.subcontractorId} className="card p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/portal/subcontractors/${a.subcontractorId}`} className="font-bold hover:text-accent">{a.subcontractorName}</Link>
                        <StatusPill status={a.status} />
                      </div>
                      <p className="text-sm text-muted">Agreement {omr(Math.round(value))} · paid {omr(Math.round(paidA))} · remaining {omr(Math.round(agreementRemaining(a)))} · {(a.clauses ?? []).length} stages</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="btn-ghost px-3 py-2" href={`/portal/projects/${id}/subcontractors/${a.subcontractorId}`}>Stages</Link>
                      <a className="btn-dark px-3 py-2" href={`/api/subcontract?project=${id}&sub=${a.subcontractorId}&print=1`} target="_blank" rel="noopener"><Icon name="file" className="h-4 w-4" /> Contract</a>
                      <RemoveAgreementButton projectId={id} subcontractorId={a.subcontractorId} name={a.subcontractorName} />
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft"><div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pct}%` }} /></div>
                  {(a.clauses ?? []).length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {(a.clauses ?? []).map((c) => (
                        <li key={c.id} className="flex items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-xs">
                          <span className="font-semibold">{c.title}</span>
                          <span className="text-muted">{omr(Math.round(num(c.paymentAmount)))}</span>
                          <StatusPill status={c.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cash flow */}
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Cash flow</h2>
          <p className={`font-display text-lg font-bold ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{net >= 0 ? "Profit" : "Loss"} {omr(Math.round(Math.abs(net)))}</p>
        </div>
        {flows.length === 0 ? (
          <EmptyState icon="trend" title="No transactions yet" text="Client payments and expenses on this project appear here." />
        ) : (
          <ul className="card max-h-[28rem] divide-y divide-line overflow-y-auto">
            {flows.map((f, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg font-bold ${f.inflow ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{f.inflow ? "↓" : "↑"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{f.title}</span>
                  <span className="block text-xs text-muted">{f.kind} · {fmtDate(f.date)}</span>
                </span>
                <span className={`font-bold ${f.inflow ? "text-emerald-700" : "text-red-700"}`}>{f.inflow ? "+" : "−"}{omr(Math.round(f.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Expenses */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Expenses</h2>
          <Link href={`/portal/projects/${id}/add-expense`} className="text-sm font-bold text-accent">+ Add expense</Link>
        </div>
        {expenses.length === 0 ? (
          <EmptyState icon="expenses" title="No expenses yet" text="Add the first expense for this project." />
        ) : (
          <ExpenseList
            rows={expenses.map((e) => ({
              key: String(e.index),
              title: e.title,
              type: e.type,
              amount: e.amount,
              includesVat: e.includesVat,
              taxPercent: e.taxPercent,
              transactionDate: expenseDate(project, e.transactionDate),
              addedByUserName: e.addedByUserName,
              sourceClaimId: e.sourceClaimId,
              attachmentCount: e.attachmentCount,
              attachmentNames: e.attachmentNames,
              files: { kind: "project", id, expenseIndex: e.index },
            }))}
          />
        )}
      </section>

      <section className="mt-12 rounded-3xl border border-red-200 bg-red-50/40 p-5">
        <h2 className="font-display text-lg font-bold text-red-800">Danger zone</h2>
        <p className="mb-4 mt-1 text-sm text-red-900/70">Deleting removes the project and everything recorded on it.</p>
        <DeleteProjectButton projectId={id} name={project.name} claimCount={claims.length} />
      </section>
    </>
  );
}
