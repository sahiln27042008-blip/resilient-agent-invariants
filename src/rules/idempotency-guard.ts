import { Rule, SourceFile, Trace, Violation } from "../types";
import { lines, violation } from "./util";

const MUTATING_CALL =
  /(method:\s*['"`](POST|PATCH|DELETE|PUT)['"`]|\b(axios|http|client)\.(post|patch|delete|put)\(|stripe\.\w+\.create\(|\.charge\()/i;
const KEY = /idempot/i;
// Key passed as the first argument, e.g. stripe.charge(key, payload)
const KEYED_ARG = /\.\w+\(\s*\w*(idem|key)\w*\s*[,)]/i;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

export const idempotencyGuard: Rule = {
  id: "idempotency-guard",

  scanCode(file: SourceFile): Violation[] {
    const out: Violation[] = [];
    const ls = lines(file.text);
    ls.forEach((l, i) => {
      if (COMMENT.test(l) || !MUTATING_CALL.test(l) || KEYED_ARG.test(l)) return;
      const window = ls.slice(Math.max(i - 4, 0), i + 8).join("\n");
      if (KEY.test(window)) return;
      out.push(
        violation({
          rule: "idempotency-guard",
          source: "code",
          message: `Mutating call at line ${i + 1} has no idempotency key nearby`,
          fix: "Send an Idempotency-Key header = sha256(run_id + step + payload) and retry only on classified transient errors.",
          location: { file: file.path, line: i + 1 },
          estimatedMonthlyRiskUsd: 2000,
        }),
      );
    });
    return out;
  },

  auditTrace(trace: Trace, path: string): Violation[] {
    return trace.steps
      .filter((s) => (s.mutating || MUTATING_METHODS.has((s.method ?? "").toUpperCase())) && !s.idempotency_key)
      .map((s) =>
        violation({
          rule: "idempotency-guard",
          source: "trace",
          message: `Step ${s.step} (${s.tool ?? s.method ?? "mutation"}) mutated state without an idempotency key`,
          fix: "Derive a deterministic key from run_id + step + payload and attach it to every write.",
          location: { file: path, step: s.step },
          estimatedMonthlyRiskUsd: 2000,
        }),
      );
  },
};
