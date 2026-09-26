import { ResilientBatchGateway } from "./engine";

interface ContactPayload {
  name: string;
  email: string;
}

interface ContactResult {
  success: boolean;
  contactId: string;
}

// Simulated mock bulk provider (e.g., Salesforce/HubSpot bulk API)
async function mockBulkApi(contacts: ContactPayload[]): Promise<ContactResult[]> {
  // If any single contact has an invalid email, fail the entire bulk request with HTTP 400
  const hasPoisonPill = contacts.some((c) => !c.email.includes("@"));
  if (hasPoisonPill) {
    throw new Error("HTTP 400 Bad Request: Malformed payload detected in batch.");
  }

  return contacts.map((c, i) => ({
    success: true,
    contactId: "id_bulk_" + (i + 100),
  }));
}

// Simulated fallback single endpoint
async function mockSingleApi(contact: ContactPayload): Promise<ContactResult> {
  if (!contact.email.includes("@")) {
    throw new Error(`HTTP 400: Invalid email address format (${contact.email})`);
  }
  return {
    success: true,
    contactId: "id_single_" + Math.floor(Math.random() * 1000),
  };
}

async function runPoisonPillVerification() {
  console.log("==================================================================");
  console.log("TESTING BATCH POISON PILL ISOLATION & DYNAMIC UNROLLING");
  console.log("==================================================================");

  const gateway = new ResilientBatchGateway<ContactPayload, ContactResult>(
    mockBulkApi,
    mockSingleApi,
    10,
    40
  );

  let successCount = 0;
  let isolatedFailureCount = 0;

  // Agent 1: Valid payload
  const agent1 = gateway
    .execute({ name: "Alice", email: "alice@company.com" })
    .then((res) => {
      console.log(`[+] Agent 1 (Alice) Success: ${res.contactId}`);
      successCount++;
    })
    .catch((err) => console.error("[-] Agent 1 Unexpected Failure:", err.message));

  // Agent 2: Poison Pill (Hallucinated broken email string)
  const agent2 = gateway
    .execute({ name: "Bob", email: "bob_hallucinated_invalid_email" })
    .then((res) => {
      console.log(`[-] Agent 2 (Bob) Unexpected Success: ${res.contactId}`);
    })
    .catch((err) => {
      console.log(`[!] Agent 2 (Bob) Isolated Poison Pill: ${err.message}`);
      isolatedFailureCount++;
    });

  // Agent 3: Valid payload
  const agent3 = gateway
    .execute({ name: "Charlie", email: "charlie@company.com" })
    .then((res) => {
      console.log(`[+] Agent 3 (Charlie) Success: ${res.contactId}`);
      successCount++;
    })
    .catch((err) => console.error("[-] Agent 3 Unexpected Failure:", err.message));

  await Promise.all([agent1, agent2, agent3]);

  console.log("\n==================================================================");
  console.log("VERIFICATION METRICS");
  console.log("==================================================================");
  console.log(`Successful Agent Executions: ${successCount}/2 (Target: 2)`);
  console.log(`Isolated Poison Pill Rejections: ${isolatedFailureCount}/1 (Target: 1)`);

  if (successCount === 2 && isolatedFailureCount === 1) {
    console.log("[SUCCESS] Dynamic unrolling isolated the poison pill without crashing healthy agents.");
  } else {
    console.error("[FAILURE] Blast radius leak detected.");
  }
}

runPoisonPillVerification();
