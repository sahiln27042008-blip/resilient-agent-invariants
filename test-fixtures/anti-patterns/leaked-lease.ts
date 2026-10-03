// Anti-pattern: a DB connection stays checked out while waiting on a model call.
declare const pool: {
  connect(): Promise<{ query(sql: string, args?: unknown[]): Promise<unknown>; release(): void }>;
};
declare const llm: { messages: { create(args: unknown): Promise<{ text: string }> } };

export async function answer(userId: string) {
  const client = await pool.connect();
  const profile = await client.query("SELECT * FROM profiles WHERE id = $1", [userId]);
  const reply = await llm.messages.create({ prompt: JSON.stringify(profile) });
  client.release();
  return reply.text;
}
