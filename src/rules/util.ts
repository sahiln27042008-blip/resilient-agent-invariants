import { Severity, RuleId, Violation } from "../types";

export function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function violation(
  v: Omit<Violation, "blastRadius" | "severity" | "pattern" | "rule"> & { rule: RuleId },
): Violation {
  const meta = META[v.rule];
  return { ...v, severity: meta.severity, blastRadius: meta.blastRadius, pattern: meta.pattern };
}

export const META: Record<RuleId, { severity: Severity; blastRadius: string; pattern: string }> = {
  "zero-hold-leases": {
    severity: "CRITICAL",
    blastRadius: "Database pool starvation knocks offline innocent users",
    pattern: "patterns/zero-hold-leases",
  },
  "claim-check": {
    severity: "HIGH",
    blastRadius: "Context window saturation, quadratic TTFT latency, and gross margin erosion",
    pattern: "patterns/event-compaction (also patterns/blackboard)",
  },
  "idempotency-guard": {
    severity: "CRITICAL",
    blastRadius: "Dropped sockets (ECONNRESET) trigger duplicate billing or phantom state",
    pattern: "patterns/network-idempotency",
  },
  "saga-compensation": {
    severity: "HIGH",
    blastRadius: "Mid-flight failure creates split-brain state and orphaned cloud resources",
    pattern: "patterns/distributed-sagas",
  },
  "process-isolation": {
    severity: "CRITICAL",
    blastRadius: "Native segfaults or unbuffered 64KB stdout pipes deadlock the entire Node.js server",
    pattern: "patterns/process-isolation",
  },
  "cqrs-tool-surface": {
    severity: "WARNING",
    blastRadius: "Bespoke read tools bloat the tool surface, prompt tokens, and selection errors",
    pattern: "patterns/0-and-infinite-tools",
  },
};
