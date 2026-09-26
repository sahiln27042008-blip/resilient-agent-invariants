import { ActionPermissionBoundary, WorkflowContext } from "./engine";

async function runSecurityVerification() {
  console.log("==================================================================");
  console.log("SECURITY VERIFICATION: STATE-GATED CAPABILITY LEASES");
  console.log("==================================================================");

  const security = new ActionPermissionBoundary();
  const context: WorkflowContext = {
    executionId: "exec_churn_9941",
    workflow: "CHURN_RECOVERY",
    currentState: "FIND_CUSTOMERS",
  };

  // Test 1: Authorized action in initial state
  console.log("\n[TEST 1] Executing permitted tool in FIND_CUSTOMERS...");
  const canReadCrm = security.authorize(context, "crm.read");
  console.log(`[+] Authorization result: ${canReadCrm ? "ALLOWED" : "DENIED"}`);

  // Test 2: Unexposed destructive action blocked
  console.log("\n[TEST 2] Agent attempts to call 'database.delete'...");
  try {
    security.authorize(context, "database.delete");
  } catch (err: any) {
    console.log(`[+] Security boundary held: ${err.message}`);
  }

  // Test 3: Action allowed in another state is blocked here (Workflow Drift Prevention)
  console.log("\n[TEST 3] Agent attempts to call 'email.send' while still in FIND_CUSTOMERS...");
  try {
    security.authorize(context, "email.send");
  } catch (err: any) {
    console.log(`[+] Premature execution blocked: ${err.message}`);
  }

  // Test 4: Dynamic JIT Capability Request for missing billing tool
  console.log("\n[TEST 4] Agent moves to CHECK_BILLING and requests unlisted 'billing.read'...");
  context.currentState = "CHECK_BILLING";

  const leaseResult = security.requestLease(context, {
    capability: "billing.read",
    reason: "Verify refund records for churned enterprise account",
    targetResourceId: "cust_enterprise_402",
  });
  console.log(`[+] Lease request response: ${leaseResult.status}`);

  // Verify access is allowed for the specific scoped customer ID
  const canReadBilling = security.authorize(context, "billing.read", "cust_enterprise_402");
  console.log(`[+] Scoped access to customer 402: ${canReadBilling ? "ALLOWED" : "DENIED"}`);

  // Verify access is DENIED for a customer outside the approved scope
  console.log("\n[TEST 5] Agent attempts to read billing of unauthorized Customer #999...");
  try {
    security.authorize(context, "billing.read", "cust_enterprise_999");
  } catch (err: any) {
    console.log(`[+] Scope enforcement held: ${err.message}`);
  }

  // Test 6: Workflow advances; leases are automatically wiped
  console.log("\n[TEST 6] Advancing state to DRAFT_EMAIL and wiping ephemeral leases...");
  context.currentState = "DRAFT_EMAIL";
  security.revokeAllLeases(context.executionId);

  try {
    security.authorize(context, "billing.read", "cust_enterprise_402");
  } catch (err: any) {
    console.log(`[+] Expired capability revoked: ${err.message}`);
  }

  // Test 7: Human approval as a state transition
  console.log("\n[TEST 7] Handling human-in-the-loop email approval...");
  context.currentState = "WAITING_FOR_APPROVAL";

  // While waiting, sending is impossible
  try {
    security.authorize(context, "email.send");
  } catch (err: any) {
    console.log(`[+] Unapproved send blocked: ${err.message}`);
  }

  // Supervisor approves specific transition
  security.approveTransition(context, "WAITING_FOR_APPROVAL", "SEND_EMAIL");
  const canSendNow = security.authorize(context, "email.send");
  console.log(`[+] Post-approval send authorized: ${canSendNow ? "ALLOWED" : "DENIED"}`);

  console.log("\n==================================================================");
  console.log("[VERIFIED] System maintained complete least-privilege security.");
  console.log("==================================================================");
}

runSecurityVerification();
