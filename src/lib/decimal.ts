import "server-only";
import { Decimal128, type Db } from "mongodb";
import { C } from "./db";

// The desktop app stores money as C# `decimal`. Depending on the driver's settings that ends
// up in MongoDB as a string ("150.5"), a Decimal128, or a double. We read all three, and when
// writing we copy whichever form the existing data already uses so both apps stay in step.

export type DecimalStyle = "string" | "decimal128" | "double";

export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Decimal128 || (value as { _bsontype?: string })._bsontype === "Decimal128") {
    return Number.parseFloat(String(value));
  }
  const coerced = Number((value as { valueOf(): unknown }).valueOf());
  return Number.isFinite(coerced) ? coerced : 0;
}

// Plain decimal text without exponent notation, rounded to 3 places (baisa precision).
function toDecimalText(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toFixed(3).replace(/\.?0+$/, "") || "0";
}

export function dec(n: number, style: DecimalStyle): string | Decimal128 | number {
  const text = toDecimalText(n);
  if (style === "decimal128") return Decimal128.fromString(text);
  if (style === "double") return Number(text);
  return text;
}

function styleOf(value: unknown): DecimalStyle | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "double";
  if ((value as { _bsontype?: string })._bsontype === "Decimal128") return "decimal128";
  return null;
}

let cachedStyle: DecimalStyle | null = null;

export async function getDecimalStyle(db: Db): Promise<DecimalStyle> {
  const forced = process.env.DECIMAL_STYLE as DecimalStyle | undefined;
  if (forced === "string" || forced === "decimal128" || forced === "double") return forced;
  if (cachedStyle) return cachedStyle;

  const probes: Array<[string, string]> = [
    [C.claims, "amount"],
    [C.generalExpenses, "amount"],
    [C.projects, "contractValue"],
    [C.employees, "monthlySalary"],
  ];
  for (const [collection, field] of probes) {
    const doc = await db.collection(collection).findOne(
      { [field]: { $exists: true } },
      { projection: { [field]: 1 } },
    );
    const style = styleOf(doc?.[field]);
    if (style) {
      cachedStyle = style;
      return style;
    }
  }
  // Empty database: the MongoDB C# driver's long-standing default for decimal is a string.
  return "string";
}
