import { Severity, Violation } from "../types";
import { totals, usd } from "./terminal-reporter";

const ORDER: Severity[] = ["CRITICAL", "HIGH", "WARNING"];

export function renderMarkdown(targets: string[], vs: Violation[]): string {
  const t = totals(vs);
  const out: string[] = [
    "# AUDIT_REPORT",
    "",
    `**Targets:** ${targets.map((x) => "`" + x + "`").join(", ")}`,
    "",
    "| Severity | Count |",
    "|---|---|",
    ...ORDER.map((s) => `| ${s} | ${t.count(s)} |`),
    "",
    `**Result:** ${t.count("CRITICAL") > 0 ? "FAIL" : "PASS"}`,
    "",
  ];

  for (const sev of ORDER) {
    const group = vs.filter((v) => v.severity === sev);
    if (group.length === 0) continue;
    out.push(`## ${sev} (${group.length})`, "");
    for (const v of group) {
      const loc = v.location
        ? `${v.location.file}${v.location.line ? ":" + v.location.line : ""}${v.location.step !== undefined ? " step " + v.location.step : ""}`
        : "";
      out.push(`### \`${v.rule}\` (${v.source})`, "", v.message, "");
      if (loc) out.push(`- **Location:** \`${loc}\``);
      out.push(`- **Blast radius:** ${v.blastRadius}`, `- **Fix:** ${v.fix}`, `- **Pattern:** \`${v.pattern}\``, "");
    }
  }

  out.push(
    "## Financial exposure (estimates)",
    "",
    `- Token waste (per run, $10/M tokens): ${usd(t.waste)}`,
    `- Monthly risk (heuristic): ${usd(t.monthly)}`,
    "",
    "_Claim-check waste assumes 10,000 runs/month; other figures are rule-of-thumb placeholders._",
    "",
  );
  return out.join("\n");
}
