import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      icon="file"
      title="Not found"
      text="This item doesn't exist or you don't have access to it."
      action={<Link href="/portal" className="btn-dark">Back to dashboard</Link>}
    />
  );
}
