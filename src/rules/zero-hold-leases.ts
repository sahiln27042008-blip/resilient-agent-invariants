import { LEASE_MAX_HELD_MS, Rule, SourceFile, Trace, Violation } from "../types";
import { lines, violation } from "./util";

const ACQUIRE = /(pool\.connect\(\)|query\(\s*['"`]BEGIN)/;
const RELEASE = /(\.release\(\)|['"`]COMMIT['"`]|['"`]ROLLBACK['"`])/;
const SLOW_AWAIT = /await\s+.*(fetch\(|axios|openai|anthropic|llm|completion|messages\.create|chat\.|generate\(|http)/i;

export const zeroHoldLeases: Rule = {
  id: "zero-hold-leases",

  scanCode(file: SourceFile): Violation[] {
    const out: Violation[] = [];
    const ls = lines(file.text);
    for (let i = 0; i < ls.length; i++) {
      if (!ACQUIRE.test(ls[i])) continue;
      for (let j = i + 1; j < ls.length; j++) {
        if (RELEASE.test(ls[j])) break;
        if (SLOW_AWAIT.test(ls[j])) {
          out.push(
            violation({
              rule: "zero-hold-leases",
              source: "code",
              message: `DB connection acquired at line ${i + 1} is held across a slow await at line ${j + 1}`,
              fix: "Release the connection before the LLM/network call; re-acquire for the write (zero-hold lease).",
              location: { file: file.path, line: j + 1 },
              estimatedMonthlyRiskUsd: 5000,
            }),
          );
          break;
        }
      }
      // do not re-flag the same lease from an inner BEGIN
      if (out.length > 0 && out[out.length - 1].location?.line !== undefined && out[out.length - 1].location!.line! > i) {
        i = out[out.length - 1].location!.line! - 1;
      }
    }
    return out;
  },

  auditTrace(trace: Trace, path: string): Violation[] {
    return trace.steps
      .filter((s) => (s.db_connection_held_ms ?? 0) > LEASE_MAX_HELD_MS)
      .map((s) =>
        violation({
          rule: "zero-hold-leases",
          source: "trace",
          message: `Step ${s.step} held a DB connection for ${s.db_connection_held_ms}ms (limit ${LEASE_MAX_HELD_MS}ms)`,
          fix: "Hold leases only for the DB statement; never across streaming frames or model calls.",
          location: { file: path, step: s.step },
          estimatedMonthlyRiskUsd: 5000,
        }),
      );
  },
};
