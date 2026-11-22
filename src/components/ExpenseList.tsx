import { fmtDate, omr } from "@/lib/format";
import { num } from "@/lib/decimal";
import { totalAmount } from "@/lib/models";
import Link from "next/link";
import { Attachments } from "./Attachments";
import { Icon } from "./Icon";
import { DeleteExpenseButton } from "./projects/DeleteButtons";

export interface ExpenseRow {
  key: string;
  title: string;
  type: string;
  amount: unknown;
  includesVat: boolean;
  taxPercent: unknown;
  transactionDate: Date;
  addedByUserName: string;
  sourceClaimId?: string | null;
  attachmentCount: number;
  attachmentNames: string[];
  files: { kind: "project" | "general"; id: string; expenseIndex?: number };
}

export function ExpenseList({ rows }: { rows: ExpenseRow[] }) {
  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {rows.map((e) => {
        const tax = num(e.taxPercent);
        const taxLabel = tax <= 0 ? "No tax" : e.includesVat ? `Incl. ${tax}%` : `+${tax}% tax`;
        return (
          <li key={e.key}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 hover:bg-soft/60 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-soft text-muted sm:grid">
                  <Icon name="expenses" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{e.title || "Untitled"}</span>
                  <span className="block truncate text-sm text-muted">
                    {e.type || "—"} · {fmtDate(e.transactionDate)}
                    {e.addedByUserName ? ` · ${e.addedByUserName}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-bold">{omr(totalAmount({ amount: e.amount, includesVat: e.includesVat, taxPercent: e.taxPercent }))}</span>
                  <span className="flex items-center justify-end gap-2 text-xs text-muted">
                    {e.sourceClaimId && <span className="rounded-full bg-primary/10 px-1.5 font-bold text-primary">Claim</span>}
                    {e.attachmentCount > 0 && <span className="flex items-center gap-0.5"><Icon name="clip" className="h-3.5 w-3.5" />{e.attachmentCount}</span>}
                    {taxLabel}
                  </span>
                </span>
              </summary>
              <div className="border-t border-line bg-soft/50 px-4 py-4 sm:px-5">
                <Attachments kind={e.files.kind} id={e.files.id} expenseIndex={e.files.expenseIndex} count={e.attachmentCount} names={e.attachmentNames} />
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  {e.sourceClaimId ? (
                    <p className="text-xs font-semibold text-muted">Created from an approved claim, so it&apos;s locked and can&apos;t be edited or deleted.</p>
                  ) : (
                    <>
                      <Link
                        className="btn-ghost px-3 py-2"
                        href={e.files.kind === "project" ? `/portal/projects/${e.files.id}/expenses/${e.files.expenseIndex}` : `/portal/expenses/${e.files.id}`}
                      >
                        Edit
                      </Link>
                      <DeleteExpenseButton
                        title={e.title}
                        target={e.files.kind === "project" ? { kind: "project", projectId: e.files.id, index: e.files.expenseIndex ?? -1 } : { kind: "general", id: e.files.id }}
                      />
                    </>
                  )}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
