/** Risk declared by a tool author. Used by policy to decide approval / shadow. */
export type Risk = "low" | "medium" | "high";

/** Side-effect class. Reads are always side-effect free at the boundary. */
export type ToolKind = "read" | "write";

/** How the gateway is operating for this process. */
export type GatewayMode = "shadow" | "live" | "autonomous";

export type PolicyEffect = "allow" | "deny" | "require_approval" | "force_shadow";

export interface Principal {
  id: string;
  displayName: string;
  roles: string[];
  attributes?: Record<string, string>;
}

export interface PlannedInvocation {
  tool: string;
  args: Record<string, unknown>;
  risk: Risk;
  kind: ToolKind;
  sideEffects: string[];
  summary: string;
}

export type InvokeStatus =
  | "done"
  | "denied"
  | "shadow_blocked"
  | "needs_approval"
  | "error";

export interface InvokeResult<T = unknown> {
  tool: string;
  status: InvokeStatus;
  data?: T;
  reason?: string;
  planned?: PlannedInvocation;
  traceId: string;
  durationMs: number;
}

export interface PolicyRule {
  /** Tool name, glob (`transfer.*`), or `*` */
  tool: string;
  effect: PolicyEffect;
  /** If set, rule applies only when the principal has one of these roles. */
  roles?: string[];
  /** If set, rule is skipped when the principal has one of these roles. */
  unlessRoles?: string[];
  reason?: string;
}

export interface AuditEvent {
  ts: string;
  traceId: string;
  principal: string;
  tool: string;
  kind: ToolKind;
  decision: InvokeStatus;
  mode: GatewayMode;
  reason?: string;
  argsHash: string;
  durationMs: number;
}

export interface TraceSpan {
  traceId: string;
  tool: string;
  startedAt: string;
  durationMs: number;
  status: InvokeStatus;
}

export type AuditSink = (event: AuditEvent) => void | Promise<void>;
export type TraceSink = (span: TraceSpan) => void | Promise<void>;
