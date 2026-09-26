Pattern 12 - Event Compaction and Pruning

This directory stops event-sourced agent checkpoints from destroying database performance, burning disk IOPS, and bloating cloud storage bills.

Files in this directory:

compactor.ts
The core compaction engine. It keeps intermediate thoughts and tool chatter in fast temporary memory during execution, offloads responses larger than 250 bytes to object storage using SHA-256 claim-check tickets, and squashes the final history down to a minimal audit delta containing only the initial goal, executed mutations, and final result.

repro.test.ts
The benchmark test suite. It simulates an agent processing a 50KB JSON payload across multiple turns, proves that intermediate reasoning is wiped from the final record, and demonstrates a 99 percent reduction in data written to the primary database.

How to run the benchmark:

Make sure you have Node 18 or higher and ts-node installed. Then run:

npx ts-node repro.test.ts

What the test verifies:

Claim-Check Offloading: A 50KB API payload is stripped of its raw text and replaced with a deterministic 32-byte hash pointer before ever touching a database row.

Scratchpad Eviction: Intermediate reasoning loops from turns one and four are discarded upon completion, eliminating write amplification.

Audit Compliance: The final output and the exact mutation call to send_billing_email remain strictly preserved in the compacted snapshot for SOC2 audit lineage.
