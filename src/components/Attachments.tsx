import { Icon } from "./Icon";

// Thumbnails/links for stored documents. Files are streamed by /api/files (which checks access).
export function Attachments({ kind, id, count, names = [], expenseIndex }: { kind: "claim" | "project" | "general"; id: string; count: number; names?: string[]; expenseIndex?: number }) {
  if (count === 0) return <p className="text-sm text-muted">No documents attached.</p>;
  // A legacy single image (desktop app's older field) comes first when present.
  const legacy = count > names.length ? 1 : 0;
  const files = Array.from({ length: count }, (_, i) => {
    const name = i < legacy ? "Invoice image.jpg" : names[i - legacy] ?? `Document ${i + 1}`;
    const params = new URLSearchParams({ kind, id, i: String(i) });
    if (expenseIndex !== undefined) params.set("e", String(expenseIndex));
    return { name, href: `/api/files?${params}`, isPdf: name.toLowerCase().endsWith(".pdf") };
  });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((f) => (
        <a key={f.href} href={f.href} target="_blank" rel="noopener" className="group overflow-hidden rounded-2xl border border-line bg-soft transition hover:border-accent/50 hover:shadow-card">
          {f.isPdf ? (
            <span className="grid aspect-[4/3] place-items-center bg-red-50 text-red-600">
              <span className="flex flex-col items-center gap-1"><Icon name="file" className="h-8 w-8" /><span className="text-xs font-extrabold">PDF</span></span>
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.href} alt={f.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
          )}
          <span className="block truncate px-3 py-2 text-xs font-semibold">{f.name}</span>
        </a>
      ))}
    </div>
  );
}
