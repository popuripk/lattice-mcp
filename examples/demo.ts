import { z } from "zod";
import { defineTool, PolicyGateway, catalog } from "../src/index.js";

const getBalance = defineTool({
  name: "get_balance",
  description: "Read an account balance. No side effects.",
  kind: "read",
  input: z.object({ account_id: z.string() }),
  output: z.object({ account_id: z.string(), balance_cents: z.number() }),
  handler: async ({ account_id }) => ({ account_id, balance_cents: 41_200 }),
});

const transfer = defineTool({
  name: "transfer_funds",
  description: "Move funds between accounts. Mutates the ledger.",
  kind: "write",
  risk: "high",
  input: z.object({
    from: z.string(),
    to: z.string(),
    amount_cents: z.number().positive(),
  }),
  output: z.object({ ok: z.boolean(), transfer_id: z.string() }),
  sideEffects: (a) => [`Debit ${a.from}`, `Credit ${a.to}`, `Amount ${a.amount_cents} cents`],
  summary: (a) => `Transfer ${a.amount_cents} cents ${a.from} → ${a.to}`,
  handler: async () => ({ ok: true, transfer_id: "tr_demo_1" }),
});

async function main() {
  const gateway = new PolicyGateway({
    mode: (process.env.LATTICE_MODE as "shadow" | "live" | "autonomous") ?? "shadow",
    principal: { id: "teller.1", displayName: "A. Rao", roles: ["teller"] },
    rules: [{ tool: "transfer_funds", effect: "deny", unlessRoles: ["teller", "manager"], reason: "Tellers/managers only" }],
  });

  console.log("Tool contracts\n", JSON.stringify(catalog([getBalance, transfer]), null, 2));

  const read = await gateway.invoke(getBalance, { account_id: "A-100" });
  console.log("\nREAD", read.status, read.data);

  const preview = await gateway.invoke(transfer, { from: "A-100", to: "A-200", amount_cents: 500 });
  console.log("\nWRITE without approval", preview.status, preview.planned?.summary);

  gateway.mode = "live";
  const needs = await gateway.invoke(transfer, { from: "A-100", to: "A-200", amount_cents: 500 });
  console.log("\nLIVE preview", needs.status);

  const done = await gateway.invoke(transfer, { from: "A-100", to: "A-200", amount_cents: 500 }, { approve: true });
  console.log("\nLIVE approved", done.status, done.data);

  console.log("\nAudit trail");
  for (const e of gateway.memory.last()) {
    console.log(`  ${e.ts}  ${e.decision.padEnd(16)}  ${e.tool}  ${e.reason ?? ""}`);
  }
}

main();
