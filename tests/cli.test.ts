import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(__dirname, "..");
const bin = path.join(root, "bin", "agent-invariants.ts");

function audit(...args: string[]) {
  const r = spawnSync(process.execPath, ["-r", "ts-node/register", bin, "audit", ...args, "--no-color"], {
    cwd: root,
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

test("vulnerable agent fails with every code rule flagged", () => {
  const { code, out } = audit("./test-fixtures/vulnerable-agent.ts");
  assert.equal(code, 1, out);
  for (const rule of [
    "zero-hold-leases",
    "claim-check",
    "idempotency-guard",
    "saga-compensation",
    "process-isolation",
    "cqrs-tool-surface",
  ]) {
    assert.match(out, new RegExp(`\\[${rule}\\]`), `missing ${rule}`);
  }
  assert.match(out, /CRITICAL/);
  assert.match(out, /patterns\/zero-hold-leases/);
  assert.match(out, /RESULT: FAIL/);
});

test("sample trace fails: lease leak, claim-check bloat, missing idempotency, no compensation", () => {
  const { code, out } = audit("./test-fixtures/sample-trace.json");
  assert.equal(code, 1, out);
  assert.match(out, /held a DB connection for 2400ms/);
  assert.match(out, /Step 3 embeds 4800 B/);
  assert.doesNotMatch(out, /Step 6 embeds/); // has a claim-check pointer
  assert.match(out, /without an idempotency key/);
  assert.match(out, /no compensation registered/);
  assert.match(out, /Token waste/);
});

test("clean file passes with exit 0", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-"));
  const f = path.join(dir, "clean.ts");
  fs.writeFileSync(f, "export const add = (a: number, b: number) => a + b;\n");
  const { code, out } = audit(f);
  assert.equal(code, 0, out);
  assert.match(out, /All invariants pass/);
});

test("--md writes AUDIT_REPORT markdown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-"));
  const md = path.join(dir, "AUDIT_REPORT.md");
  audit("./test-fixtures/vulnerable-agent.ts", "--md", md);
  const text = fs.readFileSync(md, "utf8");
  assert.match(text, /# AUDIT_REPORT/);
  assert.match(text, /## CRITICAL/);
});

test("missing target exits 2", () => {
  assert.equal(audit("./nope.ts").code, 2);
});

test("no false positives: keyed charge(key, ...) and in-memory Map.delete", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-"));
  const f = path.join(dir, "ok.ts");
  fs.writeFileSync(
    f,
    [
      "const pending = new Map<string, number>();",
      "export async function run(stripe: any, key: string, payload: object) {",
      "  await stripe.charge(key, payload);",
      "  pending.delete(key);",
      "  this.activeLeases.delete(key);",
      "}",
      "",
    ].join("\n"),
  );
  const { code, out } = audit(f);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /\[idempotency-guard\]/);
  assert.doesNotMatch(out, /\[saga-compensation\]/);
});

test("directory scan skips test/demo files but explicit file is still scanned", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-"));
  const bad = 'import { exec } from "child_process";\nexec("ls");\n';
  fs.writeFileSync(path.join(dir, "thing.test.ts"), bad);
  assert.equal(audit(dir).code, 0);
  assert.equal(audit(path.join(dir, "thing.test.ts")).code, 1);
});

// ---- Isolated anti-pattern fixtures: each must trigger exactly its own rule. ----
type Finding = { rule: string; severity: string; source: string };

function auditJson(...args: string[]) {
  const r = audit(...args, "--json");
  return { code: r.code, findings: JSON.parse(r.out.trim()) as Finding[] };
}

const ANTI: Array<[file: string, rule: string, severity: string, exit: number]> = [
  ["leaked-lease.ts", "zero-hold-leases", "CRITICAL", 1],
  ["naked-exec.ts", "process-isolation", "CRITICAL", 1],
  ["unkeyed-mutation.ts", "idempotency-guard", "CRITICAL", 1],
  ["raw-payload.ts", "claim-check", "HIGH", 0],
  ["uncompensated-saga.ts", "saga-compensation", "HIGH", 0],
  ["bloated-cqrs.ts", "cqrs-tool-surface", "WARNING", 0],
];

for (const [file, rule, severity, exit] of ANTI) {
  test(`anti-pattern ${file} -> only ${rule} (${severity}), exit ${exit}`, () => {
    const { code, findings } = auditJson(`./test-fixtures/anti-patterns/${file}`);
    assert.deepEqual([...new Set(findings.map((f) => f.rule))], [rule], JSON.stringify(findings));
    assert.ok(findings.every((f) => f.severity === severity && f.source === "code"));
    assert.equal(code, exit);
  });
}

test("anti-patterns directory yields CRITICAL, HIGH and WARNING across all six rules", () => {
  const { code, findings } = auditJson("./test-fixtures/anti-patterns");
  assert.equal(code, 1);
  assert.deepEqual(
    [...new Set(findings.map((f) => f.rule))].sort(),
    ANTI.map((a) => a[1]).sort(),
  );
  for (const sev of ["CRITICAL", "HIGH", "WARNING"]) {
    assert.ok(findings.some((f) => f.severity === sev), `no ${sev} finding`);
  }
});
