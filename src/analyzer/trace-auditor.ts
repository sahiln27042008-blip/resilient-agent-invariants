import * as fs from "fs";
import { ALL_RULES } from "../rules";
import { Trace, Violation } from "../types";

export function auditTrace(file: string): Violation[] {
  const trace = JSON.parse(fs.readFileSync(file, "utf8")) as Trace;
  if (!trace || !Array.isArray(trace.steps)) {
    throw new Error(`${file}: not a valid trace (expected { run_id, steps: [] })`);
  }
  const out: Violation[] = [];
  for (const rule of ALL_RULES) {
    if (rule.auditTrace) out.push(...rule.auditTrace(trace, file));
  }
  return out;
}
