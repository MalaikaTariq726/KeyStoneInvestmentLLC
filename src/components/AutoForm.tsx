"use client";

// A GET filter form that re-submits as soon as any field changes, like the desktop app's
// filter dropdowns. A plain submit button still works without JavaScript.
export function AutoForm({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <form
      className={className}
      role="search"
      onChange={(e) => {
        const field = e.target as unknown as HTMLInputElement;
        // Changing a filter starts again from page 1.
        const page = e.currentTarget.elements.namedItem("page") as HTMLInputElement | null;
        if (page && field.name !== "page") page.value = "1";
        e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
