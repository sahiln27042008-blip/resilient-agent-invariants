import * as fs from "fs";
import * as path from "path";
import { auditTrace } from "./analyzer/trace-auditor";
import { scanCode } from "./analyzer/code-scanner";
import { renderMarkdown } from "./reporter/markdown-reporter";
import { renderTerminal } from "./reporter/terminal-reporter";
import { Violation } from "./types";

const USAGE = `Usage: agent-invariants audit <target...> [--md [file]] [--json] [--no-color]

  <target>   a .ts/.js file, a directory, or a trace .json file
  --md       also write a markdown report (default: AUDIT_REPORT.md)
  --json     print violations as JSON instead of the terminal report
  --no-color disable ANSI colors

Exit code: 1 if any CRITICAL violation, otherwise 0.`;

export function run(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (cmd !== "audit" || rest.length === 0 || rest.includes("--help")) {
    console.log(USAGE);
    return cmd === "audit" && rest.includes("--help") ? 0 : 2;
  }

  const targets: string[] = [];
  let md: string | null = null;
  let json = false;
  let color = process.stdout.isTTY === true;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") json = true;
    else if (a === "--no-color") color = false;
    else if (a === "--md") {
      const next = rest[i + 1];
      if (next && !next.startsWith("--") && next.endsWith(".md")) {
        md = next;
        i++;
      } else md = "AUDIT_REPORT.md";
    } else targets.push(a);
  }

  const violations: Violation[] = [];
  try {
    for (const t of targets) {
      if (!fs.existsSync(t)) throw new Error(`target not found: ${t}`);
      if (path.extname(t) === ".json") violations.push(...auditTrace(t));
      else violations.push(...scanCode(t));
    }
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 2;
  }

  if (json) console.log(JSON.stringify(violations, null, 2));
  else console.log(renderTerminal(targets, violations, color));

  if (md) {
    fs.writeFileSync(md, renderMarkdown(targets, violations));
    if (!json) console.log(`\n Markdown report written to ${md}`);
  }

  return violations.some((v) => v.severity === "CRITICAL") ? 1 : 0;
}
