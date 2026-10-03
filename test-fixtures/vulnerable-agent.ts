// Intentionally vulnerable agent. Used only to verify the auditor. Do not copy.
import { exec } from "child_process";

declare const pool: { connect(): Promise<{ query(sql: string, args?: unknown[]): Promise<unknown>; release(): void }> };
declare const llm: { messages: { create(args: unknown): Promise<{ text: string }> } };

// Read tools: 6 bespoke endpoints (should be one SQL tool).
export const tools = [
  { name: "get_user" },
  { name: "list_orders" },
  { name: "fetch_invoice" },
  { name: "find_customer" },
  { name: "search_tickets" },
  { name: "read_inventory" },
];

// 1. Connection held across an LLM call.
export async function summarizeOrder(orderId: string) {
  const client = await pool.connect();
  await client.query("BEGIN");
  const row = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  const completion = await llm.messages.create({ prompt: JSON.stringify(row) });
  await client.query("UPDATE orders SET summary = $1 WHERE id = $2", [completion.text, orderId]);
  await client.query("COMMIT");
  client.release();
}

// 2 + 3. Mutations with no key and no way back if step two fails.
export async function provisionCustomer(payload: object) {
  await fetch("https://billing.example.com/charge", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await fetch("https://infra.example.com/vm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// 4. Raw tool output pushed straight into the prompt.
export function appendToolResult(messages: any[], result: unknown) {
  messages.push({ role: "tool", content: JSON.stringify(result) });
}

// 5. Untrusted script run on the main event loop.
export function runUserScript(script: string) {
  exec(`node -e "${script}"`, (err, stdout) => {
    console.log(err ?? stdout);
  });
}
