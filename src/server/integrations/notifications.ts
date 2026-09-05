import { prisma } from "@/server/lib/db";
import { sendMail } from "./mail";

export async function notifyQuoteSent(quoteId: string): Promise<void> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { customer: true, currentRevision: true },
  });
  if (!quote?.customer.contactEmail) return;
  await sendMail({
    to: quote.customer.contactEmail,
    subject: `Quotation ready from Nexa (${quote.id})`,
    text: `A quotation is ready to review in the DealFlow360 portal.\nQuote ${quote.id} revision ${quote.currentRevision?.revisionNumber ?? ""}.\n${process.env.APP_URL ?? "http://localhost:3000"}/portal`,
  });
}

export async function notifyHealthNudge(assigneeId: string, reason: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: assigneeId } });
  if (!user?.email) return;
  await sendMail({
    to: user.email,
    subject: "DealFlow360 deal-health nudge",
    text: reason,
  });
}
