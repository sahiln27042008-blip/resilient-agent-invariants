import { DurableStepEngine } from "./engine";

// Shared simulated storage to simulate a worker rebooting and loading from disk/DB
let globalStorageSnapshot = "";

async function executeCustomerWorkflow(durable: DurableStepEngine, simulateCrashOnStep3 = false) {
  // Step 1: Expensive Research (Takes tokens + API calls)
  const research = await durable.step("research", async () => {
    console.log("   -> [API] Querying 12 web sources and processing documents ($0.45)...");
    return {
      sources: 12,
      summary: "Market trends indicate strong demand for resilient agent runtimes.",
      details: "Raw web scrape data padding text ".repeat(15), // > 250 bytes
    };
  });

  // Step 2: Synthesis & Analysis
  const analysis = await durable.step("analysis", async () => {
    console.log("   -> [LLM] Running synthesis model on research results ($0.30)...");
    return {
      sentiment: "positive",
      recommendedTier: "enterprise",
      riskScore: 0.12,
    };
  });

  // Step 3: Side-Effect (CRM Mutation) - Simulating network failure or hard process kill
  const crm = await durable.step(
    "crm-update",
    async (idempotencyKey) => {
      if (simulateCrashOnStep3) {
        console.log("   -> [CRASH] Network drops or worker dies immediately after execution!");
        throw new Error("SIGKILL: Container evicted / Network partition during CRM update.");
      }
      console.log(`   -> [EXTERNAL API] Mutating CRM with key: ${idempotencyKey}`);
      return { crmRecordId: "crm_rec_9921", updated: true };
    },
    { maxRetries: 1 }
  );

  // Step 4: Final Report Generation
  const report = await durable.step("report-generation", async () => {
    console.log("   -> [RENDER] Creating PDF customer report...");
    return { reportUrl: "s3://reports/customer_intel_9921.pdf" };
  });

  return report;
}

async function runKillTest() {
  const executionId = "exec_workflow_prod_001";
  
  console.log("==================================================================");
  console.log("ATTEMPT 1: WORKFLOW RUNS AND DIES ON STEP 3 (CRM UPDATE)");
  console.log("==================================================================");
  
  const worker1 = new DurableStepEngine(executionId);

  try {
    await executeCustomerWorkflow(worker1, true); // simulateCrashOnStep3 = true
  } catch (err: any) {
    console.log(`[PROCESS HALTED] Worker 1 died as expected: ${err.message}`);
    // Save checkpoint snapshot to persistent storage
    globalStorageSnapshot = worker1.dumpState();
  }

  console.log("\n==================================================================");
  console.log("ATTEMPT 2: WORKER REBOOTS, HYDRATES STATE, RESUMES WORKFLOW");
  console.log("==================================================================");

  const worker2 = new DurableStepEngine(executionId);
  // Hydrate previous state
  worker2.loadState(globalStorageSnapshot);

  // Run the exact same workflow code again (with crash disabled)
  const finalResult = await executeCustomerWorkflow(worker2, false);

  console.log("\n[SUCCESS] Final Output:", finalResult);
  console.log("==================================================================");
}

runKillTest();
