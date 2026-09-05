import type { Id, ISODate } from "@/contracts/atharva";

export interface AuditEventInput {
  entityType: string;
  entityId: Id;
  revisionId?: Id;
  actorId?: Id;
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  requestKey?: string;
  resultId?: Id;
  createdAt?: ISODate;
}

export interface AuditEvent extends AuditEventInput {
  id: Id;
  metadata: Record<string, unknown>;
  createdAt: ISODate;
}

export interface AuditEventRepository {
  append(event: AuditEvent): Promise<void>;
  list(entityType?: string, entityId?: Id): Promise<AuditEvent[]>;
}

export class InMemoryAuditEventRepository implements AuditEventRepository {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async list(entityType?: string, entityId?: Id): Promise<AuditEvent[]> {
    return structuredClone(
      this.events.filter(
        (event) =>
          (!entityType || event.entityType === entityType) &&
          (!entityId || event.entityId === entityId),
      ),
    );
  }
}

export class AuditWriter {
  constructor(
    private readonly repository: AuditEventRepository = new InMemoryAuditEventRepository(),
    private readonly clock: () => ISODate = () => new Date().toISOString(),
  ) {}

  async record(input: AuditEventInput): Promise<AuditEvent> {
    if (!input.entityType.trim() || !input.entityId.trim()) {
      throw new TypeError("Audit events require an entity type and entity ID.");
    }
    if (!input.action.trim()) {
      throw new TypeError("Audit events require an action.");
    }

    const event: AuditEvent = {
      ...input,
      id: `audit-${crypto.randomUUID()}`,
      action: input.action.trim(),
      metadata: structuredClone(input.metadata ?? {}),
      createdAt: input.createdAt ?? this.clock(),
    };
    await this.repository.append(event);
    return structuredClone(event);
  }

  list(entityType?: string, entityId?: Id): Promise<AuditEvent[]> {
    return this.repository.list(entityType, entityId);
  }
}
