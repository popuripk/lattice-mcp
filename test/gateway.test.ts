import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { defineTool, PolicyGateway } from "../src/index.js";

const ping = defineTool({
  name: "ping",
  description: "Health",
  kind: "read",
  input: z.object({}),
  handler: async () => ({ ok: true }),
});

const mutate = defineTool({
  name: "mutate_record",
  description: "Write a record",
  kind: "write",
  risk: "medium",
  input: z.object({ id: z.string() }),
  sideEffects: (a) => [`Update ${a.id}`],
  handler: async ({ id }) => ({ id, written: true }),
});

const destroy = defineTool({
  name: "purge_tenant",
  description: "Irreversible purge",
  kind: "write",
  risk: "high",
  input: z.object({ tenant: z.string() }),
  handler: async () => ({ purged: true }),
});

function gw(mode: "shadow" | "live" | "autonomous", roles = ["ops"]) {
  return new PolicyGateway({
    mode,
    principal: { id: "u1", displayName: "Test", roles },
    rules: [{ tool: "purge_tenant", effect: "deny", reason: "Never allow tenant purge from an agent" }],
  });
}

describe("PolicyGateway", () => {
  it("executes reads in every mode", async () => {
    for (const mode of ["shadow", "live", "autonomous"] as const) {
      const res = await gw(mode).invoke(ping, {});
      assert.equal(res.status, "done");
      assert.deepEqual(res.data, { ok: true });
    }
  });

  it("never executes writes in shadow mode", async () => {
    const res = await gw("shadow").invoke(mutate, { id: "r1" }, { approve: true });
    assert.equal(res.status, "shadow_blocked");
    assert.equal(res.data, undefined);
    assert.ok(res.planned?.sideEffects.includes("Update r1"));
  });

  it("requires approval for writes in live mode", async () => {
    const preview = await gw("live").invoke(mutate, { id: "r1" });
    assert.equal(preview.status, "needs_approval");
    const done = await gw("live").invoke(mutate, { id: "r1" }, { approve: true });
    assert.equal(done.status, "done");
    assert.deepEqual(done.data, { id: "r1", written: true });
  });

  it("denies tools by policy even in autonomous mode", async () => {
    const res = await gw("autonomous").invoke(destroy, { tenant: "acme" }, { approve: true });
    assert.equal(res.status, "denied");
    assert.match(res.reason ?? "", /Never allow/);
  });

  it("rejects invalid input before the handler runs", async () => {
    const res = await gw("live").invoke(mutate, {});
    assert.equal(res.status, "error");
    assert.match(res.reason ?? "", /id/);
  });

  it("writes an audit event for every decision", async () => {
    const g = gw("shadow");
    await g.invoke(ping, {});
    await g.invoke(mutate, { id: "r1" });
    assert.equal(g.memory.events.length, 2);
    assert.deepEqual(g.memory.events.map((e) => e.decision), ["done", "shadow_blocked"]);
  });
});
