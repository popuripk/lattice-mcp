import type { AuditEvent, AuditSink } from "./types.js";

export class MemoryAuditSink {
  readonly events: AuditEvent[] = [];

  sink: AuditSink = (event) => {
    this.events.push(event);
  };

  last(n = 20): AuditEvent[] {
    return this.events.slice(-n).reverse();
  }

  filter(tool: string): AuditEvent[] {
    return this.events.filter((e) => e.tool === tool);
  }
}

export function jsonlSink(write: (line: string) => void): AuditSink {
  return (event) => write(JSON.stringify(event) + "\n");
}
