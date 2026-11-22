import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Add expense" };

export default async function AddProjectExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/portal/projects/${id}`, label: project.name }} eyebrow="New expense" title={`Add expense to ${project.name}`} />
      <EntryForm mode="expense" projects={[]} projectId={id} successHref={`/portal/projects/${id}`} />
    </div>
  );
}
