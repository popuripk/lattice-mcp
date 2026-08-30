import { createHash } from "node:crypto";

/** Stable, non-secret hash of args for audit (never log raw PII by default). */
export function hashArgs(args: unknown): string {
  const json = JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  return createHash("sha256").update(json ?? "null").digest("hex").slice(0, 16);
}

export function newTraceId(): string {
  return `lat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
