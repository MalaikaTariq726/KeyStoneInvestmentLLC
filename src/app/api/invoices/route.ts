import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInvoiceHtml } from "@/lib/data";
import { LOGO_PLACEHOLDER } from "@/lib/invoice";

// Shows a saved invoice. ?print=1 opens the browser's print dialog (save as PDF or print),
// like the desktop app; without it the invoice is just displayed.
//   /api/invoices?project=<projectId>&id=<invoiceId>[&print=1]
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.isAdmin) return new NextResponse("Not found", { status: 404 });

  const q = request.nextUrl.searchParams;
  const invoice = await getInvoiceHtml(q.get("project") ?? "", q.get("id") ?? "");
  if (!invoice) return new NextResponse("Invoice not found", { status: 404 });

  let html = invoice.html.split(LOGO_PLACEHOLDER).join("/assets/logo.png");
  if (q.get("print") !== "1") {
    html = html.replace(/<script>\s*window\.addEventListener\('load',\s*\(\)\s*=>\s*setTimeout\(\(\)\s*=>\s*window\.print\(\),\s*\d+\)\);\s*<\/script>/, "");
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      // Saved invoice HTML may only run its own print call - nothing else, no outside requests.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
