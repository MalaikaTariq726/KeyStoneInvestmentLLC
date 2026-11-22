import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProjectDetailsForm } from "@/components/projects/ProjectDetailsForm";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/projects", label: "Projects" }} eyebrow="Step 1 of 2" title="New project" subtitle="Create the project first. Payment stages come in the next step." />
      <ProjectDetailsForm />
    </div>
  );
}
