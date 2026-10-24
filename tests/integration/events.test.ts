import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/events/route";

let token = "";

beforeAll(async () => {
  const p = await prisma.participant.create({ data: { code: "P1-901", studyPhase: 1, number: 901, seed: 42 } });
  const s = await prisma.session.create({ data: { participantId: p.id, type: "phase1", token: "tok-events-test-0001" } });
  token = s.token;
});
afterAll(async () => {
  await prisma.$disconnect();
});

function req(body: unknown) {
  return new Request("http://test/api/events", { method: "POST", body: JSON.stringify(body) });
}
const ev = (id: string, type = "add_to_cart", ts = 1_700_000_000_000) => ({ id, type, ts, configId: "list-default-detailed-light-sidebar", trialId: "blk1", payload: { productId: "ho-01" } });

describe("POST /api/events", () => {
  it("stores a batch with participant/session, config, trial and both timestamps", async () => {
    const res = await POST(req({ token, events: [ev("evt-test-0001"), ev("evt-test-0002", "scroll")] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 2, saved: 2 });
    const rows = await prisma.event.findMany({ where: { session: { token } }, orderBy: { id: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.configId).toBe("list-default-detailed-light-sidebar");
    expect(rows[0]!.trialId).toBe("blk1");
    expect(Number(rows[0]!.clientTsMs)).toBe(1_700_000_000_000);
    expect(rows[0]!.serverTs).toBeInstanceOf(Date);
  });

  it("is idempotent: re-sent and late batches never duplicate", async () => {
    const res = await POST(req({ token, events: [ev("evt-test-0001"), ev("evt-test-0003", "cart_open")] }));
    expect(await res.json()).toEqual({ received: 2, saved: 1 });
    expect(await prisma.event.count({ where: { session: { token } } })).toBe(3);
  });

  it("still stores events after the session is completed", async () => {
    await prisma.session.update({ where: { token }, data: { status: "completed", completedAt: new Date() } });
    const res = await POST(req({ token, events: [ev("evt-test-0004", "visibility_change")] }));
    expect((await res.json()).saved).toBe(1);
  });

  it("rejects invalid payloads and unknown tokens", async () => {
    expect((await POST(req({ token, events: [{ id: "x", type: "nope", ts: 1 }] }))).status).toBe(400);
    expect((await POST(req({ token: "unknown-token-123", events: [ev("evt-test-0099")] }))).status).toBe(404);
    expect((await POST(new Request("http://t", { method: "POST", body: "{not json" }))).status).toBe(400);
  });
});
