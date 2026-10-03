// Anti-pattern: two external writes in a row, and nothing registered to reverse the first if the second fails.
declare const db: { insert(table: string, row: object): Promise<void> };
declare const cloud: { provision(kind: string): Promise<string> };

export async function onboard(customer: object) {
  await db.insert("customers", customer);
  await cloud.provision("vm");
}
