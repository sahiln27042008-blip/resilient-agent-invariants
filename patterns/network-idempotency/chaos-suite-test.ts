import {
  DistributedLedgerStore,
  ResilientNetworkGateway,
  ExternalError
} from "./guardrail-engine";

// Mock Payment Gateway that enforces real upstream idempotency validation
class MockStripeGateway {
  private ledger = new Map<string, { chargeId: string; amount: number; canonicalPayload: string }>();
  public totalHits = 0;
  public totalChargesSettled = 0;

  public async charge(key: string, payload: { amount: number; customer: string }, chaosDrop = false) {
    this.totalHits++;

    // Check upstream idempotency table
    if (this.ledger.has(key)) {
      console.log(`   -> [REMOTE STRIPE] Key '${key}' recognized. Returning stored receipt.`);
      return this.ledger.get(key)!;
    }

    // Create charge
    this.totalChargesSettled++;
    const receipt = {
      chargeId: `ch_${Math.random().toString(36).substring(2, 9)}`,
      amount: payload.amount,
      canonicalPayload: JSON.stringify(payload)
    };
    this.ledger.set(key, receipt);
    console.log(`   -> [REMOTE STRIPE] NEW CHARGE SETTLED: ${receipt.chargeId} for $${payload.amount}`);

    // Chaos Mode: Drop the network connection immediately after committing
    if (chaosDrop) {
      console.log("   -> [CHAOS FAULT] Server commits, but network drops before HTTP 200 is delivered!");
      const socketErr: ExternalError = new Error("ECONNRESET: Connection closed prematurely by upstream peer.");
      socketErr.code = "ECONNRESET";
      throw socketErr;
    }

    return receipt;
  }

  // Reconciliation lookup endpoint
  public async getTransactionStatus(key: string) {
    if (this.ledger.has(key)) {
      return { exists: true, receipt: this.ledger.get(key) };
    }
    return { exists: false };
  }
}

async function runChaosSuite() {
  const store = new DistributedLedgerStore();
  const reconQueue: Array<{ key: string; runId: string; stepId: string }> = [];
  const gateway = new ResilientNetworkGateway(store, reconQueue);
  const stripe = new MockStripeGateway();

  console.log("================================================================================");
  console.log("TEST 1: CONCURRENT WORKER RACE COLLISION");
  console.log("================================================================================");

  const payload = { amount: 500, customer: "cust_enterprise_88" };

  // Worker 1 and Worker 2 fire simultaneously
  const worker1Promise = gateway.executeMutation(
    "run_batch_001",
    "billing_step",
    payload,
    async (key) => {
      // Simulate real latency
      await new Promise((r) => setTimeout(r, 40));
      return await stripe.charge(key, payload);
    }
  );

  const worker2Promise = gateway.executeMutation(
    "run_batch_001",
    "billing_step",
    payload,
    async (key) => {
      return await stripe.charge(key, payload);
    }
  );

  const outcomes = await Promise.allSettled([worker1Promise, worker2Promise]);
  console.log("\nRace Condition Results:");
  console.log("Worker 1 Status:", outcomes[0].status);
  console.log("Worker 2 Status:", outcomes[1].status);
  if (outcomes[1].status === "rejected") {
    console.log("Worker 2 Rejection Reason:", (outcomes[1] as PromiseRejectedResult).reason.message);
  }

  console.log("\n================================================================================");
  console.log("TEST 2: DROPPED SOCKET & AMBIGUOUS TERMINATION");
  console.log("================================================================================");

  try {
    await gateway.executeMutation(
      "run_batch_002",
      "billing_step",
      payload,
      async (key) => {
        // Drops response on every attempt, exhausting retries
        return await stripe.charge(key, payload, true);
      },
      { maxRetries: 2, baseBackoffMs: 20 }
    );
  } catch (err: any) {
    console.log(`[CAUGHT EXPECTED RUNTIME FAULT]: ${err.message}`);
  }

  console.log("\n================================================================================");
  console.log("TEST 3: TWO-PHASE BACKGROUND RECONCILIATION PASS");
  console.log("================================================================================");

  console.log(`Active Items in Reconciliation Dead-Letter Queue: ${reconQueue.length}`);
  
  // Run background worker to query remote status
  await gateway.runReconciliationWorker(async (key) => {
    return await stripe.getTransactionStatus(key);
  });

  const finalRecord = await store.get("idem:run_batch_002:billing_step");
  console.log("Final Ledger State in Database:", finalRecord?.status);
  console.log("Verified Recovered Receipt:", finalRecord?.response);

  console.log("\n================================================================================");
  console.log("FINAL AUDIT VERIFICATION");
  console.log("================================================================================");
  console.log(`Total Inbound Network Requests Received by Stripe: ${stripe.totalHits}`);
  console.log(`Total Actual Dollar Charges Created: ${stripe.totalChargesSettled}`);
  
  if (stripe.totalChargesSettled === 2) {
    console.log("\n[INVARIANT VERIFIED]: Zero duplicate charges. Both workflows resolved deterministically.");
  } else {
    console.error("\n[CRITICAL VIOLATION]: Double billing occurred!");
  }
}

runChaosSuite();
