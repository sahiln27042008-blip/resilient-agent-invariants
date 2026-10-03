import { Rule, SourceFile, Violation } from "../types";
import { lines, violation } from "./util";

const SHELL_CALL = /\b(exec|execSync|spawn|spawnSync|execFileSync)\s*\(/;
const ISOLATED = /(\bfork\s*\(|new\s+Worker\s*\(|worker_threads|cluster\.fork)/;
const DRAINED = /(stdout\.on\(\s*['"]data|stdout\.resume\(|stdout\.pipe\(|stdio:\s*['"]ignore['"]|stdio:\s*['"]inherit['"])/;

export const processIsolation: Rule = {
  id: "process-isolation",

  scanCode(file: SourceFile): Violation[] {
    if (ISOLATED.test(file.text)) return [];
    const drained = DRAINED.test(file.text);
    const out: Violation[] = [];
    lines(file.text).forEach((l, i) => {
      const m = SHELL_CALL.exec(l);
      if (!m) return;
      const call = m[1];
      const isSpawn = call.startsWith("spawn");
      // spawn with a drained stdout is the one case that is not an instant deadlock risk,
      // but it still runs on the main process with no supervisor, so only downgrade the message.
      out.push(
        violation({
          rule: "process-isolation",
          source: "code",
          message: isSpawn && !drained
            ? `${call}() at line ${i + 1} runs on the main process and its stdout pipe is never drained`
            : `${call}() at line ${i + 1} runs on the main process with no worker/supervisor boundary`,
          fix: "Run untrusted scripts in a forked worker supervised over IPC, with timeouts and drained pipes.",
          location: { file: file.path, line: i + 1 },
          estimatedMonthlyRiskUsd: 8000,
        }),
      );
    });
    return out;
  },
};
