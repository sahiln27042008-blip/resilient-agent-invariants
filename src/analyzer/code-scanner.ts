import * as fs from "fs";
import * as path from "path";
import { ALL_RULES } from "../rules";
import { Violation } from "../types";

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
// Skipped only when walking a directory; an explicitly named file is always scanned.
const TEST_FILE = /([.-](test|spec)|^(repro|demo)-[\w-]*|chaos-suite[\w-]*)\.[cm]?[jt]sx?$/i;

export function collectCodeFiles(target: string): string[] {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out: string[] = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...collectCodeFiles(p));
    else if (CODE_EXT.has(path.extname(entry.name)) && !TEST_FILE.test(entry.name)) out.push(p);
  }
  return out;
}

export function scanCode(target: string): Violation[] {
  const out: Violation[] = [];
  for (const file of collectCodeFiles(target)) {
    const text = fs.readFileSync(file, "utf8");
    for (const rule of ALL_RULES) {
      if (rule.scanCode) out.push(...rule.scanCode({ path: file, text }));
    }
  }
  return out;
}
