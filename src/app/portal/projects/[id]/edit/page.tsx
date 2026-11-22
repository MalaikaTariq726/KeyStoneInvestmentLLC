import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { PageHeader } from "@/components/ui";
import { ProjectDetailsForm } from "@/components/projects/ProjectDetailsForm";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/portal/projects/${id}`, label: project.name }} eyebrow="Edit" title="Project details" />
      <ProjectDetailsForm
        projectId={id}
        hasStages={(project.clauses ?? []).length > 0}
        initial={{
          clientName: project.clientName ?? "",
          name: project.name ?? "",
          description: project.description ?? "",
          contractValue: String(Math.round(num(project.contractValue) * 1000) / 1000),
          natureOfProject: project.natureOfProject || "Design",
        }}
      />
    </div>
  );
}
