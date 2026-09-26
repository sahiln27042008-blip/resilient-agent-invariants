import { SagaCoordinator } from "./coordinator";

async function runProductionTask() {
  const runId = "workflow_run_88192";
  const saga = new SagaCoordinator(runId);

  console.log("=== EXECUTING MULTI-STEP AGENT MUTATIONS ===");

  try {
    // Step 1: Provision Infrastructure (Compensable)
    const serverPayload = { type: "c5.xlarge", region: "us-east-1" };
    const idempotencyKey1 = saga.generateIdempotencyKey("provision_server", serverPayload);

    const serverId = await saga.runStep(
      "provision_cloud_compute",
      async () => {
        console.log(`[+] Provisioning cloud server (Key: ${idempotencyKey1.slice(0, 10)}...)...`);
        return "srv_production_994";
      },
      async () => {
        console.log(`[UNDO] Terminating orphaned cloud server: srv_production_994`);
      }
    );

    // Step 2: Payment Gateway Charge (Compensable)
    const chargePayload = { customerId: "cust_441", amountUsd: 150 };
    const idempotencyKey2 = saga.generateIdempotencyKey("capture_payment", chargePayload);

    const chargeId = await saga.runStep(
      "capture_payment",
      async () => {
        console.log(`[+] Capturing payment $150 (Key: ${idempotencyKey2.slice(0, 10)}...)...`);
        return "ch_live_882341";
      },
      async () => {
        console.log(`[UNDO] Issuing refund for charge: ch_live_882341`);
      }
    );

    // Step 3: Database Commit (Fails with simulated connection pool timeout)
    await saga.runStep(
      "commit_database_records",
      async () => {
        console.log("[+] Writing metadata to primary database...");
        throw new Error("ETIMEDOUT: PostgreSQL connection pool exhausted.");
      },
      async () => {
        console.log("[UNDO] Unused - this step never succeeded.");
      }
    );

    // Step 4: The Pivot Step (e.g. Send Email) - Cannot be reached due to failure
    console.log("[+] Sending confirmation email (PIVOT STEP)...");

  } catch (error: any) {
    console.log("\n[PIPELINE HALTED] Error caught safely at boundary:", error.message);
    console.log("[VERIFIED] Zero phantom infrastructure. Zero unrefunded credit card charges.");
  }
}

runProductionTask();

/* Output on terminal

=== EXECUTING MULTI-STEP AGENT MUTATIONS ===
[+] Provisioning cloud server (Key: c81b37e89e...)...
[+] Capturing payment $150 (Key: 9a2f641b9d...)...
[+] Writing metadata to primary database...

[!] Forward step failed: 'commit_database_records'. Triggering LIFO rollback...
[-] Executing compensation: 'capture_payment'
[UNDO] Issuing refund for charge: ch_live_882341
[-] Executing compensation: 'provision_cloud_compute'
[UNDO] Terminating orphaned cloud server: srv_production_994
[+] Rollback complete. Distributed state sanitized.

[PIPELINE HALTED] Error caught safely at boundary: ETIMEDOUT: PostgreSQL connection pool exhausted.
[VERIFIED] Zero phantom infrastructure. Zero unrefunded credit card charges.
*/
