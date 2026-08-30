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

const createTicket = defineTool({
  name: "create_ticket",
  description: "Open an ITSM ticket. This is a write.",
  kind: "write",
  risk: "high",
  input: z.object({ title: z.string(), body: z.string() }),
  sideEffects: (a) => [`Create ticket: ${a.title}`],
  handler: async (args) => ({ ok: true, ticket_id: "T-1", title: args.title }),
});

const gateway = new PolicyGateway({
  mode: "shadow", // shadow | live | autonomous
  principal: { id: "analyst.1", displayName: "A. Rao", roles: ["analyst"] },
  rules: [
    { tool: "create_ticket", effect: "require_approval" },
    { tool: "change_compensation", effect: "deny", reason: "Never from an agent" },
  ],
});

const preview = await gateway.invoke(createTicket, { title: "Laptop", body: "Need a charger" });
// { status: "shadow_blocked", planned: { summary, sideEffects, ... } }

gateway.mode = "live";
const done = await gateway.invoke(
  createTicket,
  { title: "Laptop", body: "Need a charger" },
  { approve: true },
);
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
  { tool: "change_compensation", effect: "deny", reason: "Never from an agent" },
  { tool: "create_ticket", effect: "require_approval" },
  { tool: "*", effect: "force_shadow", roles: ["intern"] },
];
```

Effects: `allow` · `deny` · `require_approval` · `force_shadow`.

## MCP server

```ts
import { createGovernedMcpServer } from "lattice-mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createGovernedMcpServer({
  name: "workplace",
  gateway,
  tools: [searchDirectory, createTicket],
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

## Related

Kernel only in this repo. Domain drills (synthetic backends): [self-service-mcp](https://github.com/popuripk/self-service-mcp) (always-deny compensation), [ewm-ops-mcp](https://github.com/popuripk/ewm-ops-mcp) (always-deny goods issue). Python twin: [lattice-mcp-py](https://github.com/popuripk/lattice-mcp-py). Eval: [lattice-eval](https://github.com/popuripk/lattice-eval).

## License

MIT © Prasanna Kumar Popuri
