import { zodToJsonSchema } from "./zod-json.js";
import type { ToolDef } from "./tool.js";

export interface ToolContract {
  name: string;
  description: string;
  kind: "read" | "write";
  risk: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

/** Export a machine-readable contract an LLM or eval harness can consume. */
export function toContract(tool: ToolDef<any, any>): ToolContract {
  return {
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    risk: tool.risk ?? "low",
    inputSchema: zodToJsonSchema(tool.input),
    outputSchema: tool.output ? zodToJsonSchema(tool.output) : undefined,
  };
}

export function catalog(tools: Array<ToolDef<any, any>>): ToolContract[] {
  return tools.map(toContract);
}
