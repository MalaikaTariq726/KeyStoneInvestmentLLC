import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { allAttachments, type ClaimDoc, type GeneralExpenseDoc, type ProjectDoc } from "@/lib/models";

// Streams one attachment. kind=claim (owner or admin), kind=project / kind=general (admin).
//   /api/files?kind=claim&id=<claimId>&i=<n>
//   /api/files?kind=project&id=<projectId>&e=<expenseIndex>&i=<n>
//   /api/files?kind=general&id=<expenseId>&i=<n>
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return new NextResponse("Not signed in", { status: 401 });

  const q = request.nextUrl.searchParams;
  const kind = q.get("kind");
  const id = q.get("id") ?? "";
  const i = Number(q.get("i") ?? 0);
  if (!ObjectId.isValid(id) || !Number.isInteger(i) || i < 0) return new NextResponse("Bad request", { status: 400 });

  const db = await getDb();
  let files: ReturnType<typeof allAttachments> = [];

  if (kind === "claim") {
    const claim = await db.collection<ClaimDoc>(C.claims).findOne({ _id: new ObjectId(id) });
    if (!claim || (!me.isAdmin && claim.userId !== me.id)) return new NextResponse("Not found", { status: 404 });
    files = allAttachments(claim.proofImageBase64, claim.attachments);
  } else if (kind === "project" && me.isAdmin) {
    const e = Number(q.get("e") ?? -1);
    const project = await db.collection<ProjectDoc>(C.projects).findOne({ _id: new ObjectId(id) }, { projection: { expenses: 1 } });
    const expense = project?.expenses?.[e];
    if (!expense) return new NextResponse("Not found", { status: 404 });
    files = allAttachments(expense.invoiceImageBase64, expense.attachments);
  } else if (kind === "general" && me.isAdmin) {
    const expense = await db.collection<GeneralExpenseDoc>(C.generalExpenses).findOne({ _id: new ObjectId(id) });
    if (!expense) return new NextResponse("Not found", { status: 404 });
    files = allAttachments(expense.invoiceImageBase64, expense.attachments);
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = files[i];
  if (!file) return new NextResponse("Not found", { status: 404 });

  const safeType = ["image/jpeg", "image/png", "image/webp", "image/bmp", "application/pdf"].includes(file.contentType)
    ? file.contentType
    : "application/octet-stream";
  const name = (file.fileName || "attachment").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(Buffer.from(file.base64, "base64"), {
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
