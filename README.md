# resilient-agent-invariants

## Autonomous AI Agent Runtime Infrastructure
The 12 Pillars of Production Reliability for Enterprise Agent Systems

Most AI agent frameworks are built for quick local demos where running five turns without crashing feels like a victory. They fall apart under real enterprise production traffic. Autonomous agents are not lightweight web requests; they are probabilistic, resource-heavy, distributed processes that run for minutes, consume unpredictable memory, and make real-world mutations across external APIs.

This repository provides zero-dependency, production-grade distributed systems patterns designed specifically for AI agent runtimes. Every pattern addresses a specific physical failure point in computing: context explosion, memory leaks, dropped network sockets, database lockouts, retry storms, and unbudgeted inference spend.

## Repository Structure and Pattern Catalog

Pattern 01: Memory Boundary and Blackboard State
Folder: patterns/01-memory-blackboard/
Files: blackboard.ts, repro.test.ts, README.md
Protects: The LLM context window.
Enforces an O(1) epistemic state machine that stores verified facts in a persistent blackboard and aggressively evicts conversational scratchpad chatter before token costs compound quadratically.

Pattern 02: Information Plane CQRS
Folder: patterns/02-information-plane-cqrs/
Files: demo.py, query.sql, README.md
Protects: Prompt data transit boundaries.
Separates large data retrieval from prompt context using embedded DuckDB in local RAM. The agent queries and filters millions of rows using SQL without stuffing raw database tables into the language model.

Pattern 03: Durable Execution and Artifact Pointers
Folder: patterns/03-durable-checkpoint-resume/
Files: engine.ts, kill-test.ts, README.md
Protects: Worker lifecycles and recovery costs.
Wraps execution steps in a persistent state ledger. When a server container crashes halfway through a twenty-minute job, it resumes directly at the unfinished step with zero duplicate model calls or wasted compute.

Pattern 04: Network Guardrails and Deterministic Idempotency
Folder: patterns/04-network-idempotency/
Files: gateway.ts, repro.test.ts, README.md
Protects: External third-party state (banks, CRMs, cloud resources).
Derives deterministic SHA-256 idempotency keys, separates temporary network blips from permanent 400 errors, adds decorrelated jitter backoff, and runs out-of-band reconciliation to prevent phantom double-billing when network connections drop mid-flight.

Pattern 05: Distributed State and LIFO Compensation Sagas
Folder: patterns/05-distributed-sagas/
Files: saga.ts, repro.test.ts, README.md
Protects: Multi-service business consistency.
Maintains an in-memory compensation stack. If a five-step provisioning workflow fails at step four, the engine automatically executes rollback routines in reverse order to release reserved resources and refund pending charges.

Pattern 06: Host OS Boundary and Process Isolation
Folder: patterns/06-process-isolation/
Files: supervisor.ts, worker.ts, repro.test.ts, README.md
Protects: The Node.js server and Linux kernel.
Runs untrusted Python scripts, WASM binaries, and native tool libraries inside isolated child processes with IPC pipes. Hard segfaults, memory leaks, and infinite loops are contained and recycled without taking down the main server.

Pattern 07: Execution Termination and Load Shedding
Folder: patterns/07-execution-termination/
Files: engine.ts, repro.test.ts, README.md
Protects: Server CPU, queue memory, and downstream services.
Combines admission concurrency gates, bounded queues that shed excess load via backpressure, three-state circuit breakers that stop hammering broken APIs, and hard execution deadlines that kill zombie workers.

Pattern 08: Action Permission Boundaries and Zero-Hold Resource Leases
Folder: patterns/08-capability-leases/
Files: engine.ts, lease.ts, repro.test.ts, README.md
Protects: Database connection pools and company-wide security surfaces.
Releases SQL connection leases before starting long-running model token streams. Enforces state-gated permission matrices that issue temporary, scoped leases for unlisted tools and wipes them when state advances.

Pattern 09: Batch API Poison Pills and Dynamic Unrolling
Folder: patterns/09-batch-unrolling/
Files: engine.ts, repro.test.ts, README.md
Protects: Multi-tenant batch queues and SLA uptime.
Buffers requests in a 40ms speculative window. When an external bulk endpoint fails with an HTTP 400 error due to one agent hallucinating an invalid record, the gateway dynamically unrolls the batch into single requests so the forty-nine healthy agents succeed without delay.

Pattern 11: Unit Economics Runtime and Enveloped Budgets
Folder: patterns/11-unit-economics/
Files: engine.ts, repro.test.ts, README.md
Protects: Company gross margins and balance sheets.
Wraps tasks in immutable financial envelopes. An in-flight decrementing ledger debits exact token usage against provider rate cards in real time, automatically downgrades models from frontier to lightweight tiers as runway thins, and trips a non-catchable kill switch when the budget hits zero.

Pattern 12: Event Compaction and State Pruning
Folder: patterns/12-event-compaction/
Files: compactor.ts, repro.test.ts, README.md
Protects: Primary database disks, IOPS capacity, and storage bills.
Replaces bulky tool responses with SHA-256 claim-check tickets in object storage and runs post-execution log compaction that squashes multi-megabyte reasoning loops into lean four-kilobyte audit snapshots for long-term SOC2 compliance.

Prerequisites

Node.js version 18 or higher
TypeScript and ts-node:
npm install -D typescript ts-node @types/node

For Pattern 02 (Information Plane CQRS):
Python 3.10+ and duckdb:
pip install duckdb

How to Run the Chaos Test Suites

Every pattern directory contains an isolated reproduction script that injects network failures, process crashes, or poison pills to prove that the architecture survives distributed system failures.

To run individual tests:

Pattern 01 (Blackboard Context Bound):
npx ts-node patterns/01-memory-blackboard/repro.test.ts

Pattern 03 (Checkpoint Kill Test):
npx ts-node patterns/03-durable-checkpoint-resume/kill-test.ts

Pattern 04 (Network Socket Drop Repro):
npx ts-node patterns/04-network-idempotency/repro.test.ts

Pattern 05 (Saga LIFO Rollback Repro):
npx ts-node patterns/05-distributed-sagas/repro.test.ts

Pattern 06 (Native Segfault Containment Repro):
npx ts-node patterns/06-process-isolation/repro.test.ts

Pattern 07 (Spike Surge and Circuit Breaker Repro):
npx ts-node patterns/07-execution-termination/repro.test.ts

Pattern 08 (Scoped Permission Lease Repro):
npx ts-node patterns/08-capability-leases/repro.test.ts

Pattern 09 (Batch Poison Pill Isolation Repro):
npx ts-node patterns/09-batch-unrolling/repro.test.ts

Pattern 11 (Unit Economics Budget Repro):
npx ts-node patterns/11-unit-economics/repro.test.ts

Pattern 12 (Log Compaction Benchmark):
npx ts-node patterns/12-event-compaction/repro.test.ts

Core Engineering Invariants

Do not ask the language model to manage its own reliability. A prompt instruction is a polite suggestion; a distributed systems runtime is an unyielding law.

An HTTP socket failure does not mean the business operation failed. Separate request outcomes from external state mutations using deterministic idempotency keys and active reconciliation.

Keep temporary reasoning out of permanent databases. Keep intermediate thoughts in fast memory, offload large payloads using cryptographic hash pointers, and squash audit trails the millisecond tasks complete.

Kill tests beat architectural claims. If an agent framework cannot survive a SIGKILL command halfway through a workflow without losing state or double-billing a customer, it is not ready for enterprise production.
