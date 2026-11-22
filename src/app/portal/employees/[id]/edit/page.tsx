import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listClaimsForCredit, listProjectNames, listUsers } from "@/lib/data";
import { num } from "@/lib/decimal";
import { getEmployee } from "@/lib/employees";
import { storedToDateInput } from "@/lib/expenseForm";
import { creditSummary } from "@/lib/models";
import { isDisabled, salarySummary } from "@/lib/salary";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/employees/EmployeeForm";

export const metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [emp, projects, users, creditClaims] = await Promise.all([getEmployee(id), listProjectNames(), listUsers(), listClaimsForCredit()]);
  if (!emp) notFound();

  // Settlement preview shown when the employee is marked as leaving.
  const linked = users.find((u) => u.employeeId === id);
  const clearance = {
    unpaidSalary: salarySummary(emp).pending,
    outstandingCredit: linked ? creditSummary(linked, creditClaims).outstanding : 0,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/portal/employees/${id}`, label: emp.name }} eyebrow="Edit" title="Employee details" />
      <EmployeeForm
        employeeId={id}
        projects={projects}
        clearance={clearance}
        initial={{
          name: emp.name ?? "",
          designation: emp.designation ?? "",
          phone: emp.phone ?? "",
          monthlySalary: String(num(emp.monthlySalary)),
          joiningDate: storedToDateInput(emp.joiningDate),
          status: isDisabled(emp) ? "Disabled" : "Permanent",
          disabledAt: storedToDateInput(emp.disabledAt ?? null),
          allocations: (emp.projectAllocations ?? []).map((a) => ({ projectId: a.projectId, percent: String(num(a.percent)) })),
        }}
      />
    </div>
  );
}
