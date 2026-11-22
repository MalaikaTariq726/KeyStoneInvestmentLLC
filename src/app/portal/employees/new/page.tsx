import { requireAdmin } from "@/lib/auth";
import { listProjectNames } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { EmployeeForm } from "@/components/employees/EmployeeForm";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireAdmin();
  const projects = await listProjectNames();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/employees", label: "Employees" }} eyebrow="New" title="Add employee" subtitle="Salary months are created automatically from the joining date." />
      <EmployeeForm projects={projects} />
    </div>
  );
}
