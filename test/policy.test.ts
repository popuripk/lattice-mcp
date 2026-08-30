import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy } from "../src/policy.js";

const principal = { id: "1", displayName: "A", roles: ["teller"] };

describe("evaluatePolicy", () => {
  it("allows reads by default", () => {
    const d = evaluatePolicy({
      tool: "get_x",
      kind: "read",
      risk: "low",
      mode: "shadow",
      principal,
      rules: [],
    });
    assert.equal(d.effect, "allow");
  });

  it("honors first matching rule", () => {
    const d = evaluatePolicy({
      tool: "transfer_funds",
      kind: "write",
      risk: "high",
      mode: "live",
      principal,
      rules: [
        { tool: "transfer_funds", effect: "deny", roles: ["intern"] },
        { tool: "transfer_*", effect: "require_approval" },
      ],
    });
    assert.equal(d.effect, "require_approval");
  });
});
