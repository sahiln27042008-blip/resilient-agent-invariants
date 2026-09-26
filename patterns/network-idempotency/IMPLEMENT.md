Pattern 04 - Network Guardrails and Idempotency

This folder stops your agents from double-charging credit cards, duplicating database rows, or spamming broken APIs when an internet connection drops mid-flight.

Files in this directory:

1. gateway.ts
The core guardrail engine. It creates deterministic SHA-256 keys from the workflow ID, step name, and payload so every retry shares the exact same fingerprint. It also checks whether an error is a temporary network blip or a permanent 400 error, adds random jitter to retries, tracks mutations in a local write-ahead ledger, and runs out-of-band lookups to check if a dropped request actually went through on the remote server.
2. repro.test.ts
The chaos test suite. It simulates a payment provider charging five hundred dollars and then intentionally dropping the connection right before returning the 200 OK. It also tests what happens when an agent sends a broken payload.

How to run the tests:

Make sure you have Node 18 or higher and ts-node installed. Then run:

npx ts-node repro.test.ts

What the test verifies:

Test 1: Dropped socket after a completed charge
The mock bank commits the charge, but the connection dies with an ECONNRESET socket error. The engine catches the crash, runs a reconciliation check using the deterministic key, finds the completed transaction, and adopts the receipt. It sends only one physical POST request. The customer is charged exactly once.

Test 2: Terminal 400 bad request error
The agent passes an invalid email address. The engine recognizes HTTP 400 as a permanent input error rather than a temporary network blip and aborts immediately on attempt one. Total retries: zero. Zero rate-limit waste, zero burned compute.
