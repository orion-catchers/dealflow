import { Prisma } from "@/generated/prisma/client";
import { prisma, type Db, type Tx } from "@/server/lib/db";
import type { AuditEvent, AuditEventInput, AuditEventRepository } from "./audit-writer";

type Client = Db | Tx;

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toEvent(row: {
  id: string;
  entityType: string;
  entityId: string;
  revisionId: string | null;
  actorId: string | null;
  action: string;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditEvent {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    revisionId: row.revisionId ?? undefined,
    actorId: row.actorId ?? undefined,
    action: row.action,
    reason: row.reason ?? undefined,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: Client = prisma) {}

  async append(event: AuditEvent): Promise<void> {
    await this.db.auditEvent.create({
      data: {
        id: event.id,
        entityType: event.entityType,
        entityId: event.entityId,
        revisionId: event.revisionId ?? null,
        actorId: event.actorId ?? null,
        action: event.action,
        reason: event.reason ?? null,
        metadata: json(event.metadata),
        createdAt: new Date(event.createdAt),
      },
    });
  }

  async list(entityType?: string, entityId?: string): Promise<AuditEvent[]> {
    const rows = await this.db.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEvent);
  }
}

export async function recordPrismaAudit(
  db: Client,
  input: AuditEventInput,
): Promise<AuditEvent> {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    ...input,
    metadata: input.metadata ?? {},
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await new PrismaAuditEventRepository(db).append(event);
  return event;
}
