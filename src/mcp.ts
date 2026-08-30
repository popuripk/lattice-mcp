import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PolicyGateway } from "./gateway.js";
import type { ToolDef } from "./tool.js";

export interface GovernedMcpOptions {
  name: string;
  version?: string;
  gateway: PolicyGateway;
  tools: Array<ToolDef<any, any>>;
}

/**
 * Every MCP tool call is forced through PolicyGateway. An LLM cannot bypass
 * shadow mode, approval, or deny rules by talking to the transport directly.
 */
export function createGovernedMcpServer(opts: GovernedMcpOptions): McpServer {
  const server = new McpServer({ name: opts.name, version: opts.version ?? "0.1.0" });
  const byName = new Map(opts.tools.map((t) => [t.name, t]));

  for (const tool of opts.tools) {
    const shape: Record<string, z.ZodTypeAny> = { ...zodShape(tool.input as z.ZodTypeAny) };
    if (tool.kind === "write") {
      shape.approve = z
        .boolean()
        .optional()
        .describe("Set true to execute after reviewing the planned call. Required in live mode.");
    }
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: `[${tool.kind}/${tool.risk ?? "low"}] ${tool.description}`,
        inputSchema: shape,
      },
      async (args: Record<string, unknown>) => {
        const found = byName.get(tool.name);
        if (!found) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "error", reason: "unknown tool" }) }],
          };
        }
        const approve = args?.approve === true;
        const rest = { ...(args ?? {}) };
        delete rest.approve;
        const result = await opts.gateway.invoke(found, rest, { approve });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }

  return server;
}

function zodShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const typeName = (schema._def as { typeName?: string }).typeName;
  if (typeName === "ZodObject") {
    return { ...(schema as z.ZodObject<z.ZodRawShape>).shape };
  }
  return {};
}
