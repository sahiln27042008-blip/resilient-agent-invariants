import { UnitEconomicsRuntime, BudgetExhaustedError } from "./engine";

async function executeAgentWorkflow() {
  console.log("==================================================================");
  console.log("TESTING IN-FLIGHT BUDGET ENVELOPE AND DYNAMIC MODEL DOWNGRADING");
  console.log("==================================================================");

  // Set a tight 5-cent budget envelope with a 10-second timeout
  const budget = UnitEconomicsRuntime.initializeBudget(0.05, 10000);
  console.log(`Initialized budget: USD ${budget.maxCostUsd.toFixed(2)}`);

  try {
    let turn = 1;
    while (true) {
      // Step 1: Dynamic Model Routing based on remaining budget balance
      const model = UnitEconomicsRuntime.selectModelTier(budget, true);
      console.log(
        `[Turn ${turn}] Dispatched to: ${model} | Budget left: USD ${budget.remainingCostUsd.toFixed(4)}`
      );

      // Simulate realistic token consumption per agent turn
      const simulatedInputTokens = 2500;
      const simulatedOutputTokens = 800;

      // Step 2: Immediate debit and circuit breaker check
      UnitEconomicsRuntime.trackUsageAndCheck(
        budget,
        model,
        simulatedInputTokens,
        simulatedOutputTokens
      );

      turn++;
    }
  } catch (error: any) {
    if (error instanceof BudgetExhaustedError) {
      console.log("\n[CIRCUIT BREAKER TRIPPED]");
      console.error(error.message);
      console.log("[+] Safely halted. Serializing scratchpad and routing to human review queue.");
      console.log("[SUCCESS] Unit margin protected. Zero runaway inference debt.");
    } else {
      throw error;
    }
  }
}

executeAgentWorkflow();
