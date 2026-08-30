import type { z } from "zod";
import type { Risk, ToolKind } from "./types.js";

export interface ToolDef<I extends z.ZodTypeAny, O extends z.ZodTypeAny> {
  name: string;
  description: string;
  kind: ToolKind;
  risk?: Risk;
  input: I;
  output?: O;
  /** Human-readable side effects derived from args (shown in preview). */
  sideEffects?: (args: z.infer<I>) => string[];
  summary?: (args: z.infer<I>) => string;
  handler: (args: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O>> | z.infer<O>;
}

export interface ToolContext {
  principalId: string;
  traceId: string;
  approved: boolean;
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  def: ToolDef<I, O>,
): ToolDef<I, O> {
  if (!def.name || !/^[a-z][a-z0-9_]*$/.test(def.name)) {
    throw new Error(`Invalid tool name "${def.name}". Use snake_case starting with a letter.`);
  }
  if (def.kind === "read" && (def.risk ?? "low") !== "low") {
    throw new Error(`Read tool "${def.name}" must have risk "low".`);
  }
  return {
    risk: def.kind === "write" ? def.risk ?? "medium" : "low",
    ...def,
  };
}

export function isWrite(tool: { kind: ToolKind }): boolean {
  return tool.kind === "write";
}
