import { CQRS_MAX_READ_TOOLS, Rule, SourceFile, Trace, Violation } from "../types";
import { violation } from "./util";

const READ_TOOL = /name:\s*['"`]((get|list|fetch|read|find|search|query|lookup)[\w-]*)['"`]/gi;

export const cqrsToolSurface: Rule = {
  id: "cqrs-tool-surface",

  scanCode(file: SourceFile): Violation[] {
    const names = new Set<string>();
    for (const m of file.text.matchAll(READ_TOOL)) names.add(m[1]);
    if (names.size <= CQRS_MAX_READ_TOOLS) return [];
    return [
      violation({
        rule: "cqrs-tool-surface",
        source: "code",
        message: `${names.size} bespoke read tools defined (limit ${CQRS_MAX_READ_TOOLS}): ${[...names].join(", ")}`,
        fix: "Replace the read tools with one query tool over an in-memory SQL/DuckDB read model (CQRS information plane).",
        location: { file: file.path },
      }),
    ];
  },

  auditTrace(trace: Trace, path: string): Violation[] {
    const names = new Set<string>();
    for (const s of trace.steps) {
      if (s.tool && !s.mutating && (s.method ?? "GET").toUpperCase() === "GET") names.add(s.tool);
    }
    if (names.size <= CQRS_MAX_READ_TOOLS) return [];
    return [
      violation({
        rule: "cqrs-tool-surface",
        source: "trace",
        message: `Run used ${names.size} distinct read tools (limit ${CQRS_MAX_READ_TOOLS})`,
        fix: "Expose a single SQL query tool over a read model instead of many bespoke GET tools.",
        location: { file: path },
      }),
    ];
  },
};
