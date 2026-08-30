import { z } from "zod";
import { defineTool, PolicyGateway } from "../src/index.js";

const searchDirectory = defineTool({
  name: "search_directory",
  description: "Search a synthetic employee directory. Read only.",
  kind: "read",
  input: z.object({ q: z.string() }),
  output: z.object({ hits: z.array(z.string()) }),
  handler: async ({ q }) => ({ hits: [`A. Rao matches "${q}"`] }),
});

const createTicket = defineTool({
  name: "create_ticket",
  description: "Open an ITSM ticket. This is a write.",
  kind: "write",
  risk: "high",
  input: z.object({ title: z.string(), body: z.string() }),
  output: z.object({ ok: z.boolean(), ticket_id: z.string() }),
  sideEffects: (a) => [`Create ticket: ${a.title}`],
  summary: (a) => `Create ticket "${a.title}"`,
  handler: async () => ({ ok: true, ticket_id: "T-1" }),
});

const changeCompensation = defineTool({
  name: "change_compensation",
  description: "Change pay. Denied in code, not in the prompt.",
  kind: "write",
  risk: "high",
  input: z.object({ employee_id: z.string(), amount: z.number() }),
  handler: async () => {
    throw new Error("Handler must never run for this tool.");
  },
});

function line(label: string, status: string, extra = "") {
  console.log(`${label.padEnd(28)} ${status}${extra ? "  " + extra : ""}`);
}

async function main() {
  const gateway = new PolicyGateway({
    mode: (process.env.LATTICE_MODE as "shadow" | "live" | "autonomous") ?? "shadow",
    principal: { id: "analyst.1", displayName: "A. Rao", roles: ["analyst"] },
    rules: [
      { tool: "change_compensation", effect: "deny", reason: "Never from an agent" },
      { tool: "create_ticket", effect: "require_approval" },
    ],
  });

  const read = await gateway.invoke(searchDirectory, { q: "Rao" });
  line("READ", read.status, JSON.stringify(read.data));

  const shadow = await gateway.invoke(
    createTicket,
    { title: "Laptop", body: "Need a charger" },
    { approve: true },
  );
  line("SHADOW + approve=true", shadow.status, "handler did not run");

  const denied = await gateway.invoke(changeCompensation, { employee_id: "E-9", amount: 1 });
  line("DENY-IN-CODE", denied.status, denied.reason);

  gateway.mode = "live";
  const preview = await gateway.invoke(createTicket, { title: "Laptop", body: "Need a charger" });
  line("LIVE without approval", preview.status);

  const done = await gateway.invoke(
    createTicket,
    { title: "Laptop", body: "Need a charger" },
    { approve: true },
  );
  line("LIVE + approve=true", done.status, JSON.stringify(done.data));

  console.log("\nAudit (oldest first)");
  for (const e of gateway.memory.events) {
    console.log(`  ${e.decision.padEnd(16)}  ${e.tool}  ${e.reason ?? ""}`);
  }
}

main();
