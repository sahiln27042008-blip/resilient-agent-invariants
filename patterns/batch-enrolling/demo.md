## Pattern 09 - Batch Unrolling and Poison Pill Isolation

This directory prevents bulk API failures and hallucinated inputs from taking down concurrent agent workflows. It captures concurrency benefits without exposing active agent promises to batch-level HTTP 400 crashes.

Files in this directory:

engine.ts
The resilient batch gateway. It buffers concurrent tool requests inside a 40ms speculative window, maintains an in-memory promise correlation ledger, attempts bulk execution first, and automatically unrolls batches into parallel single-item requests when an external API rejects the payload due to validation errors.

repro.test.ts
The poison pill verification test. It simulates three concurrent agents calling a bulk endpoint where one agent submits a hallucinated, malformed email. It demonstrates that the bulk failure is intercepted, unrolled dynamically, and the two valid agents complete successfully while the single invalid agent is cleanly isolated.

How to run the verification:

Make sure you have Node 18 or higher and ts-node installed. Then run:

npx ts-node repro.test.ts

What the test verifies:

Speculative micro-batching: Requests arriving within 40ms are bundled into a single batch call.

Poison pill isolation: When a malformed record causes the mock bulk API to reject the batch with an HTTP 400 error, the gateway catches the exception instead of bubbling it up.

Dynamic unrolling: The batch is automatically split into individual requests. Alice and Charlie succeed via single-item fallback, while Bob receives a targeted error to self-correct in his own scratchpad.
