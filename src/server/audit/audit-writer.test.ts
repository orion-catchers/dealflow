import { describe, expect, it } from "vitest";
import { AuditWriter, InMemoryAuditEventRepository } from "./audit-writer";

describe("AuditWriter", () => {
  it("appends immutable events and preserves request/result metadata", async () => {
    const repository = new InMemoryAuditEventRepository();
    const writer = new AuditWriter(
      repository,
      () => "2026-09-05T00:00:00.000Z",
    );
    const event = await writer.record({
      entityType: "QUOTE",
      entityId: "quote-1",
      revisionId: "revision-1",
      actorId: "rep-arjun",
      action: "REVISION_CREATED",
      reason: "Customer terms changed",
      requestKey: "revision-request-1",
      resultId: "revision-2",
      metadata: { discountPct: "16" },
    });

    event.metadata.discountPct = "0";
    const stored = await writer.list("QUOTE", "quote-1");
    expect(stored).toHaveLength(1);
    expect(stored[0].metadata.discountPct).toBe("16");
    expect(stored[0].createdAt).toBe("2026-09-05T00:00:00.000Z");
  });

  it("does not allow incomplete events", async () => {
    const writer = new AuditWriter();
    await expect(
      writer.record({ entityType: "", entityId: "quote-1", action: "READ" }),
    ).rejects.toThrow();
    await expect(
      writer.record({ entityType: "QUOTE", entityId: "quote-1", action: "" }),
    ).rejects.toThrow();
  });
});
