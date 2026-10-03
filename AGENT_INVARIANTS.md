# agent-invariants

A local linter and trace auditor for AI agent pipelines. It checks agent code and JSON run traces against six distributed-systems invariants that commonly cause production incidents: DB pool starvation, duplicate side effects, pipe deadlocks, and context bloat.

It runs offline. The source in `src/` imports only `fs` and `path` and contains no network code. It never executes the code it scans.

## Quickstart

```bash
npm install

# Audit a file, a directory, or a trace
npx ts-node bin/agent-invariants.ts audit ./src/agent.ts
npx ts-node bin/agent-invariants.ts audit ./src/
npx ts-node bin/agent-invariants.ts audit ./traces/run-1049.json

# Mix targets and write a markdown report
npx ts-node bin/agent-invariants.ts audit ./src/ ./traces/run-1049.json --md AUDIT_REPORT.md
```

Try it on the bundled fixtures (these fail on purpose):

```bash
npx ts-node bin/agent-invariants.ts audit ./test-fixtures/vulnerable-agent.ts ./test-fixtures/sample-trace.json
```

## Rules

| Rule | Severity | Flags in code | Flags in a trace | Pattern |
|---|---|---|---|---|
| `zero-hold-leases` | CRITICAL | DB connection acquired, then a slow `await` (LLM or fetch) before release/COMMIT | step with `db_connection_held_ms` > 500 | `patterns/zero-hold-leases` |
| `idempotency-guard` | CRITICAL | POST/PATCH/DELETE/PUT or `.charge()` with no idempotency key nearby | mutating step with no `idempotency_key` | `patterns/network-idempotency` |
| `process-isolation` | CRITICAL | `exec`/`execSync`/`spawn*` in a file with no `fork`/`Worker` | not checked | `patterns/process-isolation` |
| `claim-check` | HIGH | tool output pushed raw into the messages array | step with `payload_bytes` > 250 and no `claim_check` pointer | `patterns/event-compaction`, `patterns/blackboard` |
| `saga-compensation` | HIGH | 2+ external writes and no compensation/rollback code in the file | 2+ mutating steps without `compensation_registered` | `patterns/distributed-sagas` |
| `cqrs-tool-surface` | WARNING | more than 5 read-tool names | more than 5 distinct GET tools in a run | `patterns/0-and-infinite-tools` |

## Trace format

```json
{
  "run_id": "run_001",
  "steps": [
    { "step": 1, "tool": "get_user", "method": "GET", "payload_bytes": 120 },
    { "step": 2, "tool": "charge_card", "method": "POST", "mutating": true,
      "idempotency_key": "…", "compensation_registered": true },
    { "step": 3, "tool": "get_report", "payload_bytes": 9000, "claim_check": "sha256:…" }
  ]
}
```

Only these structural fields are read: `step`, `tool`, `method`, `mutating`, `payload_bytes`, `claim_check`, `db_connection_held_ms`, `idempotency_key`, `compensation_registered`. Payload contents are not needed.

## Options

```
Usage: agent-invariants audit <target...> [--md [file.md]] [--json] [--no-color]

  <target>    a .ts/.js file, a directory, or a trace .json file
  --md        also write a markdown report (default: AUDIT_REPORT.md)
  --json      print findings as JSON instead of the terminal report
  --no-color  disable ANSI colors
```

Exit codes: `0` no CRITICAL findings, `1` at least one CRITICAL finding, `2` usage error or target not found.

When scanning a **directory**, files named `*.test.*`, `*.spec.*`, `repro-*`, `demo-*` and `chaos-suite*` are skipped, as are `node_modules`, `.git` and `dist`. A file you name explicitly is always scanned.

## CI

```yaml
name: agent-invariants
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx ts-node bin/agent-invariants.ts audit ./src/agents/ --md AUDIT_REPORT.md
```

The step fails the job when the CLI exits 1. (The CLI sets `process.exitCode`, which propagates normally. Some Windows tool harnesses report the shell's exit code instead of the CLI's; read the printed `RESULT:` line there.)

## Dollar figures

- **Token waste** (`claim-check`) is calculated: bytes ÷ 4 = tokens, times the number of later steps that re-send the payload, times $10 per million tokens. The monthly projection assumes 10,000 runs a month (`ASSUMED_RUNS_PER_MONTH` in `src/rules/claim-check.ts`).
- **Monthly risk** for the other rules uses fixed placeholder constants (leases 5000, idempotency 2000, saga 3000, process-isolation 8000). They are not measurements or industry benchmarks. Treat them as relative weights and change them to match your own incident costs.

## Limitations (v0.1)

- Detection is line-level regex, not an AST. It does not follow variables across functions or files, so expect false positives and false negatives on real code.
- `saga-compensation` and `claim-check` decide per file: any mention of rollback/compensation words, or `sha256`/`claim check`/`createHash`, clears the whole file.
- `saga-compensation` only counts writes to service-looking receivers (`db`, `client`, `api`, `stripe`, `prisma`, …), `.insert/.charge/.provision/.destroy`, and `method: "POST"`-style calls. Writes through other names are missed.
- `idempotency-guard` accepts any `idempot*` text within a few lines, or a first argument named like `key`.
- Calibration so far: the bundled fixtures, plus this repo's `patterns/` folder (clean after tuning). `patterns/` contains correct implementations, not anti-patterns, so it measures false positives only, not misses.

## Tests

```bash
npm test
```
