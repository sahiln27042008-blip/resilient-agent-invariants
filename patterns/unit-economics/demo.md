Pattern 11 - Unit Economics Runtime and Enveloped Budgets

This directory stops autonomous AI agents from burning through cloud inference budgets, running up massive API invoices on simple support tickets, and bleeding gross margins during edge-case reasoning loops.

Files in this directory:

engine.ts
The core unit economics coordinator. It wraps incoming tasks in an immutable financial envelope with hard USD spend limits and wall-clock execution ceilings. It maintains an in-flight decrementing cost ledger that deducts token expenses against exact provider pricing tables after every turn, dynamically downgrades models from frontier tiers to lightweight tiers as funds deplete, and fires a non-catchable interrupt when the budget hits zero.

repro.test.ts
The simulation test script. It initiates an agent loop configured with a strict five-cent USD budget and a ten-second wall-clock ceiling. It forces the agent through four turns of complex reasoning, demonstrates the automatic model downgrade from Sonnet to Haiku, and catches the circuit breaker kill switch before the task can overspend.

How to run the benchmark:

Make sure you have Node 18 or higher and ts-node installed. Then run:

npx ts-node repro.test.ts

What the test verifies:

In-flight cost tracking: Every turn calculates exact token pricing in real time and deducts it from the remaining balance instead of waiting for a post-hoc log.

Dynamic tier cascading: When the remaining envelope drops below five cents, the runtime automatically switches from Claude 3.5 Sonnet to Claude 3.5 Haiku to preserve runway.

Hard circuit breaker termination: On turn four, when the remaining balance drops to zero, the engine halts immediately with a BudgetExhaustedError, protecting company margins and routing the task cleanly to a human review queue.
