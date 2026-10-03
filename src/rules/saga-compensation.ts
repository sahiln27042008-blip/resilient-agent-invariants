import { Rule, SourceFile, Trace, Violation } from "../types";
import { lines, violation } from "./util";

// Writes to something that looks like an external service/store. Bare Map/Set-style
// `.delete()` / `.update()` on `this.x` are in-memory and deliberately not counted.
const SERVICE_WRITE =
  /\b(db|client|repo\w*|api|http|stripe|axios|prisma|sql|store|service|gateway|cloud|aws|s3)\w*\.(create|update|delete|put|post|patch)\w*\(/i;
const DISTINCT_WRITE = /\.(insert|destroy|provision|charge)\w*\(/i;
const HTTP_WRITE = /method:\s*['"`](POST|PATCH|DELETE|PUT)['"`]/i;
const WRITE_CALL = {
  test: (l: string) =>
    !/^\s*(\/\/|\*|\/\*)/.test(l) && (HTTP_WRITE.test(l) || SERVICE_WRITE.test(l) || DISTINCT_WRITE.test(l)),
};
const COMPENSATION = /(compensat|rollback|undo|saga|unwind)/i;

export const sagaCompensation: Rule = {
  id: "saga-compensation",

  scanCode(file: SourceFile): Violation[] {
    const writes: number[] = [];
    lines(file.text).forEach((l, i) => {
      if (WRITE_CALL.test(l)) writes.push(i + 1);
    });
    if (writes.length < 2 || COMPENSATION.test(file.text)) return [];
    return [
      violation({
        rule: "saga-compensation",
        source: "code",
        message: `${writes.length} write steps (lines ${writes.join(", ")}) with no compensation / rollback handler`,
        fix: "Push an undo function onto a LIFO stack after each write; on failure, pop and run them in reverse order.",
        location: { file: file.path, line: writes[writes.length - 1] },
        estimatedMonthlyRiskUsd: 3000,
      }),
    ];
  },

  auditTrace(trace: Trace, path: string): Violation[] {
    const writes = trace.steps.filter((s) => s.mutating);
    if (writes.length < 2) return [];
    return writes
      .filter((s) => !s.compensation_registered)
      .map((s) =>
        violation({
          rule: "saga-compensation",
          source: "trace",
          message: `Step ${s.step} (${s.tool ?? "write"}) is part of a ${writes.length}-write workflow with no compensation registered`,
          fix: "Register a compensating action on the LIFO stack before moving to the next step.",
          location: { file: path, step: s.step },
          estimatedMonthlyRiskUsd: 3000,
        }),
      );
  },
};
