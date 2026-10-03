import { Severity, Violation } from "../types";

const COLOR: Record<Severity, string> = {
  CRITICAL: "\x1b[1;31m",
  HIGH: "\x1b[1;33m",
  WARNING: "\x1b[1;36m",
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const ORDER: Severity[] = ["CRITICAL", "HIGH", "WARNING"];

const BANNER = String.raw`
 ┌──────────────────────────────────────────────┐
 │   A G E N T   I N V A R I A N T S   A U D I T │
 │   local · offline · zero-egress               │
 └──────────────────────────────────────────────┘`;

export const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function totals(vs: Violation[]) {
  return {
    waste: vs.reduce((a, v) => a + (v.estimatedWasteUsd ?? 0), 0),
    monthly: vs.reduce((a, v) => a + (v.estimatedMonthlyRiskUsd ?? 0), 0),
    count: (s: Severity) => vs.filter((v) => v.severity === s).length,
  };
}

export function renderTerminal(targets: string[], vs: Violation[], color = true): string {
  const c = (s: Severity, t: string) => (color ? `${COLOR[s]}${t}${RESET}` : t);
  const dim = (t: string) => (color ? `${DIM}${t}${RESET}` : t);
  const t = totals(vs);
  const out: string[] = [BANNER, ""];
  out.push(` Targets : ${targets.join(", ")}`);
  out.push(
    ` Summary : ${c("CRITICAL", `${t.count("CRITICAL")} critical`)}  ${c("HIGH", `${t.count("HIGH")} high`)}  ${c("WARNING", `${t.count("WARNING")} warning`)}`,
  );
  out.push("");

  if (vs.length === 0) {
    out.push(" All invariants pass.");
    return out.join("\n");
  }

  for (const sev of ORDER) {
    const group = vs.filter((v) => v.severity === sev);
    if (group.length === 0) continue;
    out.push(c(sev, ` ── ${sev} (${group.length}) ──────────────────────────────`));
    for (const v of group) {
      const loc = v.location
        ? `${v.location.file}${v.location.line ? ":" + v.location.line : ""}${v.location.step !== undefined ? " step " + v.location.step : ""}`
        : "";
      out.push(`  [${v.rule}] ${v.message}`);
      if (loc) out.push(dim(`    at ${loc}`));
      out.push(`    blast radius : ${v.blastRadius}`);
      out.push(`    fix          : ${v.fix}`);
      out.push(`    pattern      : ${v.pattern}`);
      out.push("");
    }
  }

  out.push(" ── Financial exposure (estimates) ──────────────");
  out.push(`  Token waste (per run, $10/M tokens) : ${usd(t.waste)}`);
  out.push(`  Monthly risk (heuristic)            : ${usd(t.monthly)}`);
  out.push(dim("  Claim-check waste assumes 10,000 runs/month; other figures are rule-of-thumb placeholders."));
  out.push("");
  out.push(t.count("CRITICAL") > 0 ? " RESULT: FAIL (exit 1)" : " RESULT: PASS (exit 0)");
  return out.join("\n");
}
