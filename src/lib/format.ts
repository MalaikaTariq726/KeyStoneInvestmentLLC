// Formatting shared by server and client code. The company works in Oman time (UTC+4, no
// daylight saving), and the desktop app stores "a date" as local midnight converted to UTC.

export const TIME_ZONE = "Asia/Muscat";
const OMAN_OFFSET_MS = 4 * 60 * 60 * 1000;

export function omr(amount: number): string {
  return `OMR ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}`;
}

export function omrShort(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `OMR ${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 10_000) return `OMR ${(amount / 1_000).toFixed(1)}K`;
  return omr(Math.round(amount));
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1971) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TIME_ZONE });
}

// "2026-11-22" (from <input type="date">) -> the instant of Oman midnight, as the desktop app stores it.
export function dateInputToStored(input: string): Date {
  const [y, m, d] = input.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - OMAN_OFFSET_MS);
}

// Today's date in Oman as "YYYY-MM-DD", for date inputs.
export function todayInput(): string {
  const now = new Date(Date.now() + OMAN_OFFSET_MS);
  return now.toISOString().slice(0, 10);
}

export function monthKey(value: Date): string {
  const shifted = new Date(new Date(value).getTime() + OMAN_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

export const EXPENSE_TYPES = [
  "Subcontractor Payment",
  "Daily Labour Payment",
  "Materials Payment",
  "Overheads",
  "Assets Purchase",
  "Transporting",
  "Petrol",
  "Repair Vehicle",
  "User Claim",
  "Others",
] as const;

export type TaxMode = "added" | "included" | "none";

export function totalWithTax(amount: number, taxMode: TaxMode, taxPercent: number): number {
  if (taxMode === "none") return amount;
  if (taxMode === "included") return amount;
  return amount + (amount * taxPercent) / 100;
}
