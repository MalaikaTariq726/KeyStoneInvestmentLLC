import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { num } from "@/lib/decimal";
import { getEmployee } from "@/lib/employees";
import { storedToDateInput } from "@/lib/expenseForm";
import { fmtDate, omr } from "@/lib/format";
import { allocationDisplay, effectiveDue, isDisabled, monthLabel, salarySummary } from "@/lib/salary";
import { PageHeader, StatCard } from "@/components/ui";
import { SalaryRecordsEditor } from "@/components/employees/SalaryRecordsEditor";
import { DeleteEmployeeButton } from "@/components/employees/DeleteEmployeeButton";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const emp = await getEmployee(id);
  if (!emp) notFound();
  const s = salarySummary(emp);

  const rows = s.records.map((r) => ({
    month: new Date(r.month).toISOString(),
    label: monthLabel(r.month),
    due: fmtDate(effectiveDue(r)),
    dueIso: effectiveDue(r).toISOString(),
    amount: String(num(r.amount)),
    paid: !!r.paidAt,
    paidDate: r.paidAt ? storedToDateInput(r.paidAt) : "",
    shares: (r.projectShares ?? []).map((x) => `${x.projectName} ${Number(num(x.percent).toFixed(2))}%`).join(", "),
  }));

  return (
    <>
      <PageHeader
        back={{ href: "/portal/employees", label: "Employees" }}
        eyebrow={emp.designation || "Employee"}
        title={emp.name}
        subtitle={`${isDisabled(emp) ? `Disabled · last working day ${fmtDate(emp.disabledAt)}` : "Permanent"} · joined ${fmtDate(emp.joiningDate)}${emp.phone ? ` · ${emp.phone}` : ""}`}
        action={<Link href={`/portal/employees/${id}/edit`} className="btn-ghost py-3">Edit details</Link>}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="navy" icon="wallet" label="Monthly salary" value={omr(Math.round(num(emp.monthlySalary)))} hint={allocationDisplay(emp)} />
        <StatCard icon="check" label="Paid salary" value={omr(Math.round(s.paid))} />
        <StatCard tone="orange" icon="clock" label="Pending salary" value={omr(Math.round(s.pending))} />
        <StatCard icon="trend" label="Overdue months" value={String(s.overdueMonths)} hint={`Salary status: ${s.current}`} />
      </div>

      <section className="mt-8">
        <h2 className="mb-1 font-display text-xl font-bold">Salary records</h2>
        <p className="mb-4 text-sm text-muted">A month&apos;s salary is due on the 5th of the next month. When a month is marked paid, it&apos;s charged to the employee&apos;s projects using their current salary split.</p>
        <SalaryRecordsEditor employeeId={id} rows={rows} joiningDate={storedToDateInput(emp.joiningDate)} />
      </section>

      <section className="mt-12 rounded-3xl border border-red-200 bg-red-50/40 p-5">
        <h2 className="font-display text-lg font-bold text-red-800">Danger zone</h2>
        <p className="mb-4 mt-1 text-sm text-red-900/70">For staff who leave, set the status to Disabled instead, which keeps their salary history.</p>
        <DeleteEmployeeButton id={id} name={emp.name} />
      </section>
    </>
  );
}
