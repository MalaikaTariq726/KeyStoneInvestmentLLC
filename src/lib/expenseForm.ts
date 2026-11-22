import "server-only";
import { num } from "./decimal";
import type { TaxMode } from "./format";

// Turns a stored expense into the edit form's starting values.
export function taxModeOf(includesVat: boolean, taxPercent: unknown): TaxMode {
  if (num(taxPercent) <= 0) return "none";
  return includesVat ? "included" : "added";
}

const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;

export function storedToDateInput(value: Date | null | undefined): string {
  const d = value && new Date(value).getUTCFullYear() > 1971 ? new Date(value) : new Date();
  return new Date(d.getTime() + OMAN_OFFSET_MS).toISOString().slice(0, 10);
}

// File list in the same order /api/files serves it: a legacy single image first, then attachments.
export function fileList(count: number, names: string[], hrefFor: (i: number) => string) {
  const legacy = count > names.length ? 1 : 0;
  return Array.from({ length: count }, (_, i) => ({ name: i < legacy ? "Invoice image.jpg" : names[i - legacy] ?? `Document ${i + 1}`, href: hrefFor(i) }));
}
