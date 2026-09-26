Pattern 08 - Action Permission Boundaries and Capability Leases

This folder prevents autonomous AI agents from causing company-wide damage by eliminating ambient tool permissions. It ensures agents only have access to the exact tools needed for their current workflow step, lets them request missing capabilities dynamically, and revokes access the moment work finishes.

Files in this directory:

engine.ts
The core authorization gatekeeper. It enforces three deterministic rules:

State-gated capability matrices that check whether a tool belongs to the active workflow step.
An ephemeral lease manager that issues temporary, scoped access tokens with hard expiration timers.
A workflow transition manager that turns human approval into a state change rather than a permanent security bypass.

repro.test.ts
The security verification script. It proves that dangerous actions like database deletion are blocked, tools from future steps are stopped before their time, scoped leases protect unauthorized customer records, and leases are revoked once state advances.

How to run the tests:

Make sure you have Node 18 or higher and ts-node installed. Then run:

npx ts-node repro.test.ts

What the test verifies:

Static state gating: An agent in the FIND_CUSTOMERS state can read CRM records, but calling email.send fails immediately because the workflow has not reached that step yet.

Hard blocks on destructive tools: Commands like database.delete are rejected at the code level, preventing prompt injections from doing real damage.

Scoped capability leasing: When an agent requests billing access for Customer 402, the runtime grants access to that specific record only. Attempting to query Customer 999 with the same lease is blocked.

Ephemeral cleanup: When the workflow moves from CHECK_BILLING to DRAFT_EMAIL, all active billing leases are automatically wiped from memory.

Scoped human approvals: While an agent sits in WAITING_FOR_APPROVAL, email sending is impossible. The human approval moves the state to SEND_EMAIL, unlocking the tool for that single step only.
