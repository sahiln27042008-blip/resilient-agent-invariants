Autonomous AI Agent Runtime Infrastructure
The 12 Pillars of Production Reliability for Enterprise Agent Systems
Most AI agent frameworks are designed for local demos where surviving five conversational turns feels like a breakthrough. They crumble under live enterprise traffic. Autonomous agents are not lightweight HTTP requests; they are probabilistic, resource-heavy, distributed state machines that run for minutes, consume variable compute, and trigger physical state mutations across external APIs.

This repository provides a zero-dependency, drop-in suite of distributed systems patterns designed specifically for autonomous agent runtimes. Each pattern targets a specific physical failure mode: context window explosion, memory leaks, dropped network sockets, database connection pool exhaustion, thundering herd retry storms, and unbudgeted inference spend.

## 🛠️ CLI Tool: Invariant Linter & Trace Auditor
We provide a zero-egress, local CLI that audits agent code and JSON traces against distributed systems reliability invariants.
👉 See [AGENT_INVARIANTS.md](./AGENT_INVARIANTS.md) for full usage, rules matrix, and CI integration.

Pattern Catalog & Directory Index
Folder names below match what is on disk in patterns/. Pillars 07 and 10 have no folder in this repo yet.

01. Memory Boundary (patterns/blackboard/)
Enforces an O(1) epistemic state machine that stores verified facts in a persistent blackboard and evicts conversational scratchpad chatter before token costs compound quadratically.

02. Information Plane CQRS (patterns/0-and-infinite-tools/)
Separates large data retrieval from prompt context using embedded DuckDB in local RAM. The agent queries data using SQL without stuffing raw tables into the context window.

03. Durable Execution (patterns/durable-execution/)
Wraps steps in a persistent state ledger backed by content-addressable storage pointers. Interrupted workers resume at the exact step boundary without duplicate model calls.

04. Network Guardrails (patterns/network-idempotency/)
Derives deterministic SHA-256 idempotency keys, classifies transient versus terminal errors, applies jitter backoff, and reconciles remote state to eliminate phantom double-charges.

05. Distributed State (patterns/distributed-sagas/)
Maintains an append-only compensation stack. If a multi-step operation fails midway, rollback routines execute in reverse LIFO order to unwind external side-effects cleanly.

06. Host OS Boundary (patterns/process-isolation/)
Runs code execution, Python scripts, and native tool libraries in child processes over isolated IPC pipes. Hard segfaults and memory leaks are contained without crashing the host Node.js server.

07. Execution Termination (not yet in this repo)
Planned: admission concurrency gates, bounded queues with backpressure, three-state circuit breakers, and hard execution deadlines via native AbortController.

08. Capability Leases (patterns/permission-lock/ and patterns/zero-hold-leases/)
Binds permissions to workflow states rather than agent identity. Issues time-bounded, resource-scoped capability leases and releases long-lived database connection locks before token streaming.

09. Batch API Unrolling (patterns/batch-enrolling/)
Buffers requests in a 40ms speculative window. When an external bulk endpoint rejects a batch due to one agent's malformed record (HTTP 400), it unrolls into single requests so healthy agents succeed.

11. Unit Economics (patterns/unit-economics/)
Wraps tasks in immutable dollar-denominated budget envelopes. Tracks token usage against pricing tables in real time, cascades reasoning models from frontier to lightweight tiers, and terminates runaway loops.

12. Event Compaction (patterns/event-compaction/)
Offloads tool payloads larger than 250 bytes to object storage using SHA-256 claim-check tickets. Terminal compaction squashes intermediate reasoning loops into a 4KB audit delta.

Detailed Pattern Architecture
01. Memory Boundary & Blackboard State
Folder: patterns/blackboard/

Artifacts: README.md

Mechanism: Separates working memory into an epistemic state machine (known facts, verified hypotheses, active blockers) and aggressively evicts conversational scratchpad chatter after every tool dispatch. Prevents quadratic context growth.

02. Information Plane CQRS
Folder: patterns/0-and-infinite-tools/

Artifacts: demo.py, README.md

Mechanism: Decouples raw business data transit from the prompt boundary using an embedded in-memory OLAP engine (DuckDB). The agent inspects schemas, synthesizes targeted SQL, and extracts scalar answers directly in local RAM without dumping 10,000 JSON rows into the LLM context.

03. Durable Execution & Artifact Pointers
Folder: patterns/durable-execution/

Artifacts: engine.ts, kill-test.ts, README.md

Mechanism: Wraps each atomic step in a write-ahead checkpoint ledger backed by a content-addressable storage pointer. If a container reboots on step 14 of 20, the worker hydrates from the exact state boundary with zero duplicate model calls or re-executed mutations.

04. Network Guardrails & Deterministic Idempotency
Folder: patterns/network-idempotency/

Artifacts: guardrail-engine.ts, chaos-suite-test.ts, IMPLEMENT.md, README.md

Mechanism: Derives deterministic SHA-256 idempotency keys from the workflow ID, step name, and canonical payload. Classifies errors (transient vs. terminal), applies full decorrelated jitter backoff, and runs out-of-band state lookups before retrying dropped connections to prevent duplicate transactions.

05. Distributed State & LIFO Sagas
Folder: patterns/distributed-sagas/

Artifacts: coordinator.ts, repro.test.ts, README.md

Mechanism: Tracks forward mutations on an append-only compensation stack. If a five-step provisioning workflow fails halfway through, the coordinator walks backwards in strict Last-In, First-Out (LIFO) order, executing compensating transactions to release provisioned infrastructure, void authorizations, and clean up orphaned state.

06. Host OS Boundary & Process Isolation
Folder: patterns/process-isolation/

Artifacts: demo-supervisor.ts, demo-worker.ts, README.md

Mechanism: Isolates code-execution engines, untrusted scripts, and native C/C++ tools inside dedicated child processes communicated over isolated IPC pipes. Catches hard SIGSEGV native crashes, memory leaks, and infinite loops at the operating system boundary without crashing the parent runtime.

07. Execution Termination & Admission Control
Not yet in this repo (no folder).

08. Action Permission Boundaries & Zero-Hold Leases
Folders: patterns/permission-lock/, patterns/zero-hold-leases/

Artifacts: permission-lock/engine.ts, permission-lock/repro-test.ts, permission-lock/demo.md, zero-hold-leases/lease.ts, zero-hold-leases/repro-test.ts, README.md in each

Mechanism: Prevents prompt-injection lateral movement by binding capabilities to workflow states rather than the agent's identity. Issues time-bounded, resource-scoped capability leases on demand and releases long-lived database connection locks before initiating streaming LLM calls.

09. Batch API Poison Pills & Dynamic Unrolling
Folder: patterns/batch-enrolling/

Artifacts: engine.ts, repro.test.ts, demo.md, README.md

Mechanism: Collects tool dispatches across concurrent sessions inside a 40ms speculative window. If a bulk endpoint rejects the entire batch due to a single agent's hallucinated parameter (HTTP 400), the gateway catches the rejection and unrolls the batch into parallel single requests, isolating the failure to the broken agent while the healthy operations proceed.

11. Unit Economics Runtime & Enveloped Budgets
Folder: patterns/unit-economics/

Artifacts: engine.ts, repro.test.ts, demo.md, README.md

Mechanism: Wraps every execution in an immutable dollar-denominated envelope. Tracks token consumption against provider pricing tables in real time, dynamically cascades reasoning from frontier models down to lightweight models as margins compress, and triggers a hard circuit breaker if a loop exhausts its budget.

12. Event Compaction & Pruning
Folder: patterns/event-compaction/

Artifacts: compactor.ts, repro.test.ts, demo.md, README.md

Mechanism: Eliminates database write amplification by offloading tool payloads larger than 250 bytes to object storage using SHA-256 claim-check tickets. Runs terminal log compaction to squash intermediate reasoning loops into a 4KB audit delta containing only the input, committed side effects, and final output.

Getting Started
Prerequisites
Node.js: v18.0.0 or higher

TypeScript & ts-node:

Bash
npm install -D typescript ts-node @types/node
Python (for Pattern 02):

Bash
pip install duckdb
Running the Demos and Chaos Test Suites
Pattern directories include executable scripts that inject deliberate network partitions, process faults, or payload poison pills to verify that the runtime boundaries hold. Not every folder has one; see the Artifacts lines above.

Bash
# Pattern 02: Information Plane CQRS (DuckDB Token Reduction)
python patterns/0-and-infinite-tools/demo.py

# Pattern 03: Durable Execution (SIGKILL Mid-Step Resume)
npx ts-node patterns/durable-execution/kill-test.ts

# Pattern 04: Network Guardrails (Dropped Socket & Deduplication)
npx ts-node patterns/network-idempotency/chaos-suite-test.ts

# Pattern 05: Distributed Sagas (LIFO Compensating Rollback)
npx ts-node patterns/distributed-sagas/repro.test.ts

# Pattern 06: Process Isolation (Native SIGSEGV Containment)
npx ts-node patterns/process-isolation/demo-supervisor.ts

# Pattern 08: Capability Leases (Scope Escaping & Zero-Hold Sockets)
npx ts-node patterns/permission-lock/repro-test.ts
npx ts-node patterns/zero-hold-leases/repro-test.ts

# Pattern 09: Batch Unrolling (Poison Pill Isolation)
npx ts-node patterns/batch-enrolling/repro.test.ts

# Pattern 11: Unit Economics (In-Flight Budget Kill Switch)
npx ts-node patterns/unit-economics/repro.test.ts

# Pattern 12: Event Compaction (Claim-Check Offloading & Squashing)
npx ts-node patterns/event-compaction/repro.test.ts
Architectural Principles
System Guarantees Over System Prompts: A prompt instruction is a non-deterministic request; a runtime boundary is an enforceable physical law. Never rely on the LLM to govern its own safety, rate limits, or budgets.

Network Timeouts Are Not Business Failures: An HTTP socket reset means connectivity was lost, not that the remote server failed to commit the mutation. Bind every mutating operation to a deterministic identity and verify reality before retrying.

Keep Ephemeral State Out of Primary Storage: Treat intermediate scratchpad reasoning as hot, volatile cache. Persist only the minimal committed delta to transactional databases.

Assume Hostility at Every Integration Boundary: Child tools crash with segfaults, third-party APIs experience outages, downstream bulk endpoints reject good inputs, and models hallucinate bad schemas. Build runtimes that isolate blast radiuses to individual frames.
