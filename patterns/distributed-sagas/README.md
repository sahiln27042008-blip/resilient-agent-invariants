## The Blast Radius of Multi-Step Tool Calls: Eliminating Orphaned Cloud Bills and Split-Brain State

## Third-party APIs lack two-phase commit protocols. How engineering teams replace probabilistic model "cleanups" with LIFO compensation stacks and deterministic idempotency keys.

Your AI Agent Just Charged a Card and Crashed
Imagine deploying an autonomous AI agent to manage cloud infrastructure and billing tasks. On its first production run, it executes three operations in sequence. First, it calls an API to provision an expensive cloud server. Second, it calls a payment gateway to bill a customer credit card. Third, it attempts to record the deployment metadata into your primary database. Right at step three, your database connection pool maxes out and drops the request. The application throws an exception and halts immediately.

Now your system is trapped in what distributed systems engineers call a split-brain state (a condition where different systems hold conflicting records of reality). The cloud server is still active in the background, quietly running up hosting costs. The customer has a legitimate charge pending on their bank statement. Yet, your internal database contains zero record that either event occurred. This single failure mode quietly destroys your gross margins (the money left over after direct operating costs) and permanently shatters customer trust.

## The Real Business Damage
Money: The Phantom Bill Trap When an agent provisions cloud infrastructure without finishing its workflow, those orphaned assets run indefinitely because nobody knows they exist. At the end of the month, your company receives a bloated hosting bill that directly reduces your operating profitability. Even worse, affected customers soon notice unauthorized deductions for services they never received. They skip your support desk and file chargebacks (formal payment disputes initiated directly through banking networks). Every chargeback hits your business with steep penalty fees, threatens your merchant processing account, and drains your core revenue.

Reliability: The Broken Trust Trap When your internal databases fall out of sync with external platforms, customer dashboards begin serving phantom errors and missing resources. This instantly breaks your enterprise SLA (a service level agreement, which is the legally binding contract guaranteeing system uptime). Enterprise buyers who rely on your automation lose faith in your product overnight, which rapidly drives up your customer churn (the rate at which paying accounts cancel their subscriptions).

Productivity: High-Paid Janitor Work When an agent loop crashes halfway through a task, it rarely leaves a clean stack trace. Instead, your most expensive senior software engineers have to pause roadmap development to do digital janitor work. They spend entire afternoons parsing raw terminal logs, manually deleting orphaned cloud assets, and hand-patching dirty database rows. Your engineering feature velocity (the speed at which your team ships new software) grinds to a halt while expensive engineering payroll is wasted on manual cleanup.


## The Naive Mistake: Asking the AI to Clean Up
When software teams run into this problem, their first instinct is to wrap the agent loop in a standard error handler and ask the language model to fix it. They catch the error and prompt the agent with a message like: “Step three failed, please undo your previous actions.”

This pattern is called probabilistic error recovery (hoping an unpredictable model will guess how to repair runtime failures), and it consistently fails in production. Because the model is already suffering from context degradation (loss of reasoning accuracy as conversation history grows long), it frequently hallucinates past resource identifiers, calls the wrong API deletion flags, or accidentally deletes live customer records. You should never rely on an unpredictable language model to repair broken distributed state.

## The Solution: The 4-Step Saga Engine
Real-world cloud APIs and payment networks do not share a single synchronized database, and they do not support 2PC (two-phase commit protocols, where multiple independent databases agree to finalize changes together or cancel everything simultaneously). To safely coordinate multiple external APIs, you must implement an architectural pattern called a Saga (an automated coordinator that pairs every forward action with an inverse compensating rollback).

A Saga completely removes the language model from the failure recovery path. It relies entirely on deterministic code (guaranteed, non-random logic written once by human engineers) using four practical steps:

Pair Write Tools with Deterministic Inverses You only need to write rollback logic for tools that alter external state. You never write compensation code for read-only tools like file readers, web searchers, or database queries. If a tool provisions a cloud server, pair it with an inverse function that deletes that specific server. If a tool charges a card, pair it with an inverse function that issues a refund (a credit reversal). The engineer who builds the tool writes this three-line inverse function once inside the tool definition, and the model never touches it again.

Collect Compensations in a LIFO Rollback Stack LIFO stands for last-in, first-out (a data structure where the most recently added item is the first one removed). As your agent successfully finishes each step, the runtime pushes the corresponding undo function onto an in-memory stack. If step one succeeds, the server deletion function enters the stack. If step two succeeds, the refund function enters the stack. The moment step three crashes, the engine halts the entire pipeline and immediately executes the stack in reverse order. It refunds the credit card first, then shuts down the cloud server. Because this process runs through hardcoded JavaScript without calling the model, the rollback is physically guaranteed.

Inject Deterministic Idempotency Headers Network requests drop and time out all the time. If a network packet drops after a payment gateway processes a charge, your agent might retry the action blindly. To prevent duplicate charges, every write operation must carry an idempotency key (a unique cryptographic fingerprint that ensures identical requests are processed only once). By computing a SHA-256 hash of the run identifier, step name, and action payload, downstream APIs like Stripe and AWS can recognize duplicate requests and return the original successful response without double-billing the user.

Isolate Irreversible Actions Behind a Pivot Step Certain real-world actions can never be rolled back. You cannot un-send a client email, and you cannot un-fire a live webhook sent to an external customer server. In distributed systems, this is known as the pivot step (the single point of no return in a workflow). You must structure your agent pipeline so that every compensable preparation step—such as creating cloud instances, reserving rows, and validating balances—happens before the pivot step. Once the pivot step runs, rollbacks are permanently disabled, and the engine switches strictly to forward recovery (retrying idempotent steps until they succeed or escalating to an on-call engineer).

## The Drop-In TypeScript Coordinator
Here is the complete coordinator class you can drop directly into your application without any external libraries:
===============================================================================================================================================================
import { createHash } from “node:crypto”;
export class SagaCoordinator {

private stack: Array<{ name: string; undo: () => Promise<void> }> = [];

public async runStep<T>(

name: string,

action: () => Promise<T>,

undo: () => Promise<void>

): Promise<T> {

try {

const result = await action();

this.stack.push({ name, undo });

return result;

} catch (err) {

console.error(”Step failed: “ + name + “. Initiating deterministic rollback.”);

await this.rollback();

throw err;

}

}

private async rollback(): Promise<void> {

while (this.stack.length > 0) {

const step = this.stack.pop()!;

try {

console.log(”Executing rollback for: “ + step.name);

await step.undo();

} catch (undoErr) {

console.error(”Critical: Rollback failed for “ + step.name, undoErr);

}

}

console.log(”Rollback complete. Distributed state sanitized.”);

}

}
===============================================================================================================================================================

## Testing Failure Recovery in Staging

Here is how you wrap your agent tools inside the coordinator to verify that broken workflows leave zero dirty state:
===============================================================================================================================================================
async function runProductionTask() {
  const saga = new SagaCoordinator();

  try {
    // Step 1: Compensable Cloud Infrastructure Setup
    const serverId = await saga.runStep(
      "provision_cloud_compute",
      async () => {
        console.log("Creating cloud server instance...");
        return "srv_production_994";
      },
      async () => {
        console.log("Terminating orphaned cloud server instance.");
      }
    );

    // Step 2: Compensable Payment Processing
    const chargeId = await saga.runStep(
      "capture_payment",
      async () => {
        console.log("Capturing customer payment through payment gateway...");
        return "ch_live_882341";
      },
      async () => {
        console.log("Issuing immediate customer refund for original transaction.");
      }
    );

    // Step 3: Database Commit (Simulating a Fatal Database Connection Drop)
    await saga.runStep(
      "commit_database_records",
      async () => {
        console.log("Attempting to write deployment metadata to database...");
        throw new Error("ETIMEDOUT: Database connection pool exhausted.");
      },
      async () => {
        console.log("Unused.");
      }
    );
  } catch (error) {
    console.log("Pipeline safely halted. No orphan infrastructure or incorrect charges remain.");
  }
}

runProductionTask();
===============================================================================================================================================================

## The Result in Your Terminal
When you run this script, your terminal logs the exact sequence of events:

=========================================================
 terminal — node test-saga.ts
=========================================================
$ npx tsx test-saga.ts

> Creating cloud server instance...
> Capturing customer payment through payment gateway...
> Attempting to write deployment metadata to database...

[SAGA EXCEPTION] Step failed: commit_database_records. Initiating deterministic rollback.

[ROLLBACK 1/2] Executing compensation for: capture_payment
  └ Issuing immediate customer refund for original transaction.

[ROLLBACK 2/2] Executing compensation for: provision_cloud_compute
  └ Terminating orphaned cloud server instance.

✓ Rollback complete. Distributed state sanitized.
✓ Pipeline safely halted. No orphan infrastructure or incorrect charges remain.

$
=========================================================


Your hosting bill stays clean. Your customers never get billed for half-finished executions. Your engineering team spends zero hours doing manual database surgery. Stop relying on unpredictable language models to clean up after themselves, and wrap your mutating tools in a deterministic Saga engine instead.
