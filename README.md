# lattice-mcp

**Policy kernel for MCP tools.** Shadow mode, human-in-the-loop approval, typed contracts, and an append-only audit trail — enforced at the boundary, not in the prompt.

[![CI](https://github.com/popuripk/lattice-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/popuripk/lattice-mcp/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

LLMs are great at *choosing* tools. They are terrible at being the security boundary. `lattice-mcp` is the choke-point every tool call — from a chat UI, an agent loop, or an MCP client — has to pass through.

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  LLM / UI   │────►│  PolicyGateway   │────►│  Tool handler   │
│  MCP client │     │  shadow · live   │     │  (your system)  │
└─────────────┘     │  approve · deny  │     └─────────────────┘
                    │  audit · trace   │
                    └──────────────────┘
```

Part of the **Lattice** stack: [forge-agent](https://github.com/popuripk/forge-agent) · [atlas-orchestrator](https://github.com/popuripk/atlas-orchestrator) · [lattice-eval](https://github.com/popuripk/lattice-eval) · [lattice-memory](https://github.com/popuripk/lattice-memory)

## Why this exists

Production agents fail in predictable ways:

| Failure | What Lattice does |
|---|---|
| Model “just does the write” | Writes are **planned**, then **approved**. Shadow mode never mutates. |
| Prompt-injected “ignore the rules” | Policy is **code**, evaluated before the handler. |
| No forensic trail | Every decision is an **audit event** with a trace id and args hash. |
| Schemaless tool args | **Zod** in, optional Zod out. Invalid input never reaches the handler. |
| MCP as a backdoor | `createGovernedMcpServer` wraps tools so the transport cannot skip the gateway. |

## Install

```bash
npm install lattice-mcp zod @modelcontextprotocol/sdk
```

Node 20+.

## Quick start

```ts
import { z } from "zod";
import { defineTool, PolicyGateway } from "lattice-mcp";

const transfer = defineTool({
  name: "transfer_funds",
  description: "Move funds between accounts",
  kind: "write",
  risk: "high",
  input: z.object({ from: z.string(), to: z.string(), amount_cents: z.number().positive() }),
  sideEffects: (a) => [`Debit ${a.from}`, `Credit ${a.to}`],
  handler: async (args) => ({ ok: true, transfer_id: "tr_1" }),
});

const gateway = new PolicyGateway({
  mode: "shadow", // shadow | live | autonomous
  principal: { id: "teller.1", displayName: "A. Rao", roles: ["teller"] },
  rules: [
    { tool: "transfer_funds", effect: "deny", unlessRoles: ["teller", "manager"] },
  ],
});

const preview = await gateway.invoke(transfer, { from: "A-1", to: "A-2", amount_cents: 500 });
// { status: "shadow_blocked", planned: { summary, sideEffects, ... } }

gateway.mode = "live";
const done = await gateway.invoke(transfer, { from: "A-1", to: "A-2", amount_cents: 500 }, { approve: true });
// { status: "done", data: { ok: true, ... } }
```

```bash
npm run demo
```

## Modes

| Mode | Reads | Writes |
|---|---|---|
| `shadow` | Execute | **Never** execute. Return a planned invocation. |
| `live` | Execute | Preview, then execute only with `{ approve: true }`. |
| `autonomous` | Execute | Execute if policy allows. Still honors `deny` rules. |

Use `shadow` in every new environment. Promote to `live` when a human is on the loop. `autonomous` is an explicit opt-in for low-risk tools with tight deny-lists.

## Policy as code

First matching rule wins.

```ts
const rules = [
  { tool: "purge_tenant", effect: "deny", reason: "Never from an agent" },
  { tool: "transfer_*", effect: "require_approval" },
  { tool: "*", effect: "force_shadow", roles: ["intern"] },
];
```

Effects: `allow` · `deny` · `require_approval` · `force_shadow`.

## MCP server

```ts
import { createGovernedMcpServer } from "lattice-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createGovernedMcpServer({
  name: "ledger",
  gateway,
  tools: [getBalance, transfer],
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Write tools automatically receive an `approve: boolean` input. Agents must preview, then re-call with `approve: true`.

## Contracts

`catalog(tools)` emits JSON Schema the eval harness and any LLM can consume. Input and output stay in lockstep with the runtime types.

## Design notes

- **One choke-point.** UI, agent, and MCP all call `gateway.invoke`. There is no second path.
- **Args are hashed in audit**, not logged raw, so the trail is useful without becoming a PII store.
- **Reads cannot be high-risk.** `defineTool` rejects that combination.
- **This is not a model.** Bring your own LLM. Lattice governs *tools*.

## Lattice ecosystem

| Repo | Role |
|---|---|
| **lattice-mcp** | Policy kernel (this repo) |
| [forge-agent](https://github.com/popuripk/forge-agent) | Agent runtime with tracing and a mock model for CI |
| [atlas-orchestrator](https://github.com/popuripk/atlas-orchestrator) | Multi-agent planner + specialists + blackboard |
| [lattice-eval](https://github.com/popuripk/lattice-eval) | Contract tests and golden traces |
| [lattice-memory](https://github.com/popuripk/lattice-memory) | Knowledge-graph memory MCP |
| [ewm-ops-mcp](https://github.com/popuripk/ewm-ops-mcp) | Warehouse-ops MCP (governed domain server) |
| [self-service-mcp](https://github.com/popuripk/self-service-mcp) | Workplace self-service MCP |
| [lattice-mcp-py](https://github.com/popuripk/lattice-mcp-py) | Python policy gateway |

## License

MIT © Prasanna Kumar Popuri
