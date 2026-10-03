// Anti-pattern: a tool result (often several KB) goes straight into the prompt history.
type Message = { role: string; content: string };

export function recordToolResult(messages: Message[], result: unknown) {
  messages.push({ role: "tool", content: JSON.stringify(result) });
}
