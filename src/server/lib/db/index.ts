import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/** The `?schema=` from DATABASE_URL; the pg default is `public`. */
export function databaseSchema(connectionString = process.env.DATABASE_URL): string {
  if (!connectionString) return "public";
  return new URL(connectionString).searchParams.get("schema") || "public";
}

/**
 * Schema-qualified table name for raw SQL. The pg adapter applies `?schema=` only to
 * Prisma-generated queries; raw SQL resolves unqualified names through the connection
 * search_path (normally `public`), which would hit another developer's schema.
 */
export function rawTable(table: string): Prisma.Sql {
  const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
  return Prisma.raw(`${quote(databaseSchema())}.${quote(table)}`);
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
  const adapter = new PrismaPg({ connectionString }, { schema });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** One PrismaClient per process. Next.js dev hot-reload reuses the global. */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** The client type every repository and transaction callback accepts. */
export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
