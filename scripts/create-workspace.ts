/**
 * Provision a customer workspace from the command line (operator onboarding).
 *
 *   pnpm workspace:create --company "Acme Office Supply" --name "Jane Doe" --email jane@acme.com [--currency USD]
 *
 * Creates the company, its owner admin, and the starter configuration, then prints a one-time link the owner uses
 * to set a password (also emailed when RESEND_API_KEY or MAIL_WEBHOOK_URL is set). No demo data is created.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/server/lib/db";
import { createInviteLink, sendInviteEmail } from "../src/server/lib/auth/password-reset";
import { runForCompany } from "../src/server/lib/tenant/context";
import { createWorkspace } from "../src/server/tenancy/workspace";

async function main() {
  const { values } = parseArgs({
    options: {
      company: { type: "string" },
      name: { type: "string" },
      email: { type: "string" },
      currency: { type: "string", default: "INR" },
    },
  });
  if (!values.company || !values.name || !values.email) {
    throw new Error('Usage: pnpm workspace:create --company "Name" --name "Owner Name" --email owner@example.com [--currency INR|USD|EUR]');
  }
  const created = await createWorkspace({
    companyName: values.company,
    name: values.name,
    email: values.email,
    currency: values.currency as "INR" | "USD" | "EUR",
  });
  const inviteUrl = await runForCompany(created.companyId, async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: created.ownerId } });
    const link = await prisma.$transaction((tx) => createInviteLink(tx, owner.id));
    await sendInviteEmail(owner, values.company!, link);
    return link;
  });
  console.log(JSON.stringify({ ...created, ownerEmail: values.email.toLowerCase(), inviteUrl }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
