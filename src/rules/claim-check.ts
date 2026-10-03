import {
  BYTES_PER_TOKEN,
  CLAIM_CHECK_MAX_BYTES,
  Rule,
  SourceFile,
  TOKEN_PRICE_PER_M_USD,
  Trace,
  Violation,
} from "../types";
import { lines, violation } from "./util";

// Assumption used for monthly projection only. Change as needed.
export const ASSUMED_RUNS_PER_MONTH = 10_000;

const RAW_TOOL_OUTPUT = /role:\s*['"]tool['"].*content:\s*(JSON\.stringify|result|output|data)/;
const HAS_CLAIM_CHECK = /(sha256|claim.?check|createHash)/i;

export const claimCheck: Rule = {
  id: "claim-check",

  scanCode(file: SourceFile): Violation[] {
    if (HAS_CLAIM_CHECK.test(file.text)) return [];
    const out: Violation[] = [];
    lines(file.text).forEach((l, i) => {
      if (RAW_TOOL_OUTPUT.test(l)) {
        out.push(
          violation({
            rule: "claim-check",
            source: "code",
            message: `Tool output appended raw to the message array at line ${i + 1} (no claim-check pointer in file)`,
            fix: `Store payloads over ${CLAIM_CHECK_MAX_BYTES} bytes out-of-band; put a SHA-256 pointer in the prompt.`,
            location: { file: file.path, line: i + 1 },
          }),
        );
      }
    });
    return out;
  },

  auditTrace(trace: Trace, path: string): Violation[] {
    const out: Violation[] = [];
    const total = trace.steps.length;
    trace.steps.forEach((s, idx) => {
      const bytes = s.payload_bytes ?? 0;
      if (bytes <= CLAIM_CHECK_MAX_BYTES || s.claim_check) return;
      // The raw payload is re-sent on every later step, so cost grows with remaining steps.
      const resends = Math.max(total - idx - 1, 0) + 1;
      const tokens = (bytes / BYTES_PER_TOKEN) * resends;
      const wasteUsd = (tokens / 1_000_000) * TOKEN_PRICE_PER_M_USD;
      out.push(
        violation({
          rule: "claim-check",
          source: "trace",
          message: `Step ${s.step} embeds ${bytes} B inline (limit ${CLAIM_CHECK_MAX_BYTES} B); re-sent ${resends}x`,
          fix: "Offload to a claim-check store and pass a SHA-256 pointer instead of the payload.",
          location: { file: path, step: s.step },
          estimatedWasteUsd: wasteUsd,
          estimatedMonthlyRiskUsd: wasteUsd * ASSUMED_RUNS_PER_MONTH,
        }),
      );
    });
    return out;
  },
};
