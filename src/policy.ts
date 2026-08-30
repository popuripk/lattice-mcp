import type { GatewayMode, PolicyEffect, PolicyRule, Principal, Risk, ToolKind } from "./types.js";

export interface PolicyDecision {
  effect: PolicyEffect | "allow";
  reason: string;
  rule?: PolicyRule;
}

function matchTool(pattern: string, name: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return name.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith("*")) return name.startsWith(pattern.slice(0, -1));
  return pattern === name;
}

function roleHit(principal: Principal, roles?: string[]): boolean {
  if (!roles || roles.length === 0) return true;
  return roles.some((r) => principal.roles.includes(r));
}

/**
 * First matching rule wins. Default:
 *   read  -> allow
 *   write -> require_approval in live, force_shadow in shadow, allow in autonomous
 */
export function evaluatePolicy(opts: {
  tool: string;
  kind: ToolKind;
  risk: Risk;
  mode: GatewayMode;
  principal: Principal;
  rules: PolicyRule[];
}): PolicyDecision {
  for (const rule of opts.rules) {
    if (!matchTool(rule.tool, opts.tool)) continue;
    if (!roleHit(opts.principal, rule.roles)) continue;
    if (rule.unlessRoles?.some((r) => opts.principal.roles.includes(r))) continue;
    return { effect: rule.effect, reason: rule.reason ?? `Matched policy ${rule.effect} for ${opts.tool}`, rule };
  }

  if (opts.kind === "read") {
    return { effect: "allow", reason: "Read tools execute by default" };
  }

  if (opts.mode === "shadow") {
    return { effect: "force_shadow", reason: "Gateway is in shadow mode — writes are planned, not executed" };
  }
  if (opts.mode === "live") {
    return {
      effect: "require_approval",
      reason: opts.risk === "high" ? "High-risk write requires explicit approval" : "Live mode requires approval for writes",
    };
  }
  // autonomous
  return { effect: "allow", reason: "Autonomous mode executes authorized writes" };
}
