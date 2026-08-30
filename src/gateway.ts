import type { z } from "zod";
import { MemoryAuditSink } from "./audit.js";
import { hashArgs, newTraceId } from "./hash.js";
import { evaluatePolicy } from "./policy.js";
import type { ToolDef } from "./tool.js";
import type {
  AuditSink,
  GatewayMode,
  InvokeResult,
  PlannedInvocation,
  PolicyRule,
  Principal,
  TraceSink,
} from "./types.js";

export interface GatewayOptions {
  mode: GatewayMode;
  principal: Principal;
  rules?: PolicyRule[];
  audit?: AuditSink;
  trace?: TraceSink;
}

export class PolicyGateway {
  mode: GatewayMode;
  principal: Principal;
  rules: PolicyRule[];
  audit: AuditSink;
  trace?: TraceSink;
  readonly memory: MemoryAuditSink;

  constructor(opts: GatewayOptions) {
    this.mode = opts.mode;
    this.principal = opts.principal;
    this.rules = opts.rules ?? [];
    this.memory = new MemoryAuditSink();
    this.audit = async (e) => {
      this.memory.sink(e);
      await opts.audit?.(e);
    };
    this.trace = opts.trace;
  }

  withPrincipal(principal: Principal): PolicyGateway {
    return new PolicyGateway({
      mode: this.mode,
      principal,
      rules: this.rules,
      audit: this.audit,
      trace: this.trace,
    });
  }

  async invoke<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
    tool: ToolDef<I, O>,
    rawArgs: unknown,
    opts?: { approve?: boolean },
  ): Promise<InvokeResult<z.infer<O>>> {
    const started = Date.now();
    const traceId = newTraceId();
    const approved = opts?.approve === true;

    const parsed = tool.input.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return this.finish(tool.name, "error", started, traceId, {
        reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    const args = parsed.data as Record<string, unknown>;
    const risk = tool.risk ?? (tool.kind === "write" ? "medium" : "low");
    const planned: PlannedInvocation = {
      tool: tool.name,
      args,
      risk,
      kind: tool.kind,
      sideEffects: tool.sideEffects?.(parsed.data) ?? (tool.kind === "write" ? ["Mutates system of record"] : []),
      summary: tool.summary?.(parsed.data) ?? `${tool.kind} ${tool.name}`,
    };

    const decision = evaluatePolicy({
      tool: tool.name,
      kind: tool.kind,
      risk,
      mode: this.mode,
      principal: this.principal,
      rules: this.rules,
    });

    if (decision.effect === "deny") {
      return this.finish(tool.name, "denied", started, traceId, {
        reason: decision.reason,
        planned,
        kind: tool.kind,
      });
    }

    if (tool.kind === "write" && (decision.effect === "force_shadow" || this.mode === "shadow")) {
      return this.finish(tool.name, "shadow_blocked", started, traceId, {
        reason: decision.reason,
        planned,
        kind: tool.kind,
      });
    }

    if (tool.kind === "write" && decision.effect === "require_approval" && !approved) {
      return this.finish(tool.name, "needs_approval", started, traceId, {
        reason: decision.reason,
        planned,
        kind: tool.kind,
      });
    }

    try {
      const data = await tool.handler(parsed.data, {
        principalId: this.principal.id,
        traceId,
        approved,
      });
      if (tool.output) {
        const out = tool.output.safeParse(data);
        if (!out.success) {
          return this.finish(tool.name, "error", started, traceId, {
            reason: `Output schema failed: ${out.error.message}`,
            planned,
            kind: tool.kind,
          });
        }
      }
      return this.finish(tool.name, "done", started, traceId, { data, planned, kind: tool.kind });
    } catch (err) {
      return this.finish(tool.name, "error", started, traceId, {
        reason: err instanceof Error ? err.message : String(err),
        planned,
        kind: tool.kind,
      });
    }
  }

  private async finish(
    tool: string,
    status: InvokeResult["status"],
    started: number,
    traceId: string,
    extra: Partial<InvokeResult> & { kind?: PlannedInvocation["kind"] },
  ): Promise<InvokeResult> {
    const durationMs = Date.now() - started;
    const event = {
      ts: new Date().toISOString(),
      traceId,
      principal: this.principal.id,
      tool,
      kind: extra.kind ?? "read",
      decision: status,
      mode: this.mode,
      reason: extra.reason,
      argsHash: hashArgs(extra.planned?.args ?? {}),
      durationMs,
    };
    await this.audit(event);
    await this.trace?.({ traceId, tool, startedAt: event.ts, durationMs, status });
    return { tool, status, traceId, durationMs, ...extra };
  }
}
