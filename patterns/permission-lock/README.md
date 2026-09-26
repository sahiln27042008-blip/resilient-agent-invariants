## Your AI Agent Shouldn't Have Permission to Do Everything

Why giving agents global tool access creates massive security blast radiuses, why hiding tools in prompts is not real security, and how to enforce state-gated capability leases.

Imagine a manager tells an autonomous company AI: "Find the customers who left because of Bug-402, write them an apology, offer them a discount to return, and create an engineering report." It sounds like a standard autonomous workflow. The agent queries your customer records, identifies the churned accounts, verifies the bug reports, drafts an apology email, gets manager approval, and sends the message. But then, while inspecting customer notes, the agent notices that several users requested refunds. The model thinks: "I should verify billing history to see if their refunds went through."

That sounds completely reasonable. But if you gave that agent global access to your tool catalog, that innocent thought opens a nightmare. To check billing history, the agent might now have active access to your entire Stripe account, database deletion endpoints, GitHub repositories, production deployment pipelines, and internal communication channels. It only needed to read three customer invoices, but you gave it the keys to the entire company [Ambient Authority Antipattern]. One hallucinated parameter or malicious piece of scraped data [Prompt Injection Vector] can turn a routine customer success task into a catastrophic data wipeout.

## When engineering teams run into this problem, they usually swing between two broken extremes.

First is the God Mode Trap [Excessive Capability Exposure]. You give the agent every tool it might ever need across the entire company. The agent is flexible and rarely gets stuck, but its blast radius is infinite [Unbounded Blast Radius]. If an agent writing an apology email still has access to database deletion or payment refunds, you are one bad token away from an unrecoverable disaster.

Second is the Walled Garden Trap [Over-Restriction Failure]. You panic about security and give the agent only three narrow tools. The agent starts its task, discovers an edgecase where it genuinely needs to inspect an invoice to answer the user's question, hits a wall, and dies. The system is completely secure only because it is completely useless.

The solution is not to lock the agent in an empty box, nor is it to give it permanent admin credentials. The architectural invariant is simple: the model may request any capability it needs, but a deterministic runtime decides whether that capability is granted, how long it lasts, and what exact data it can touch [The Principle of Least Privilege].

## There are four security realities that most agent frameworks completely miss.

First, hiding a tool schema is not authorization [Visibility vs. Authorization]. Most developers think that if they omit a tool from the prompt schema, the system is safe. That is a visibility boundary, not a security boundary. If your underlying API server still accepts execution requests for billing refunds, any prompt injection or multi-agent message that knows the function name can invoke it directly. Authorization checks must live in the deterministic code layer underneath the model, completely independent of what is printed in the prompt text.

Second, workflow drift turns good tasks into catastrophes [State Boundary Violations]. An agent starts with a clear business task: analyze customer feedback. Fourteen turns later, having followed an obscure chain of thought, it decides it needs to clean up old database records, modify access permissions, or close GitHub issues. The model did not crash; it simply drifted. A production runtime must know where the execution currently lives in the business workflow and reject any action that does not belong to that specific state.

Third, approval fatigue destroys human control [HITL Desensitization]. If an agent asks a human manager for approval every thirty seconds—"Can I read billing?", "Can I search Jira?", "Can I inspect users?"—the human stops reading. They click approve blindly just to get their own work done. Capability requests must have strict automated policy tiers: safe read actions within the current workflow scope are handled automatically, while irreversible actions trigger scoped, context-rich approvals.

Fourth, human approval cannot be a global boolean [The Escaped Sandbox Trap]. Never store human approval as a single true flag. If a human approves an agent's request to send a specific customer email, that does not mean the agent is now trusted to do whatever it wants for the rest of the day. Human approval must be a strict state transition: it moves the workflow from waiting for approval to sending the email, unlocking exactly one capability for one specific execution frame.

In a broken setup, the agent has active ambient authority over all fifty tools at all times. While investigating a customer bug, the model can decide to call database deletion on record 402, and the execution layer runs it immediately because the model asked for it.

In a resilient setup, the runtime enforces state-gated capability leases. The workflow starts in the draft email state, where only drafting text is allowed. If the model attempts to delete a database row, the runtime rejects it in one millisecond. When the model requests billing read access for customer 402, the runtime policy engine verifies the reason, checks the scope, and issues an ephemeral five-minute lease. The workflow advances, reads the invoice, moves forward to send the email, and the billing lease automatically expires back to zero.

## To lock this down, production runtimes follow five hard rules:

Map capabilities to workflow states [State-Gated Permissions]. Permissions belong to the workflow step, never to the agent identity. When the agent is searching for customers, it can only read CRM records. When it moves to drafting an email, it can only generate text. It cannot physically fire off emails or touch billing until the state machine officially transitions.

Enforce hard execution bouncers [Deterministic Authorization Layer]. Every single tool execution must pass through a strict gatekeeper function before running. The gatekeeper checks three things: what workflow is running, what state it is currently in, and whether this specific capability is explicitly permitted in that state. If the answer is no, execution halts instantly with an authorization error.

Use just-in-time capability requests [Autonomous Lease Requests]. When an agent genuinely discovers it needs an unlisted capability to finish a job, it does not crash. It emits a structured lease request containing the requested tool, the business rationale, and the target resource IDs. The runtime evaluates the request against security policies.

Issue ephemeral, scoped leases [Time-Bounded Capability Leases]. When a capability is granted, it is never permanent. It receives a strict time-to-live, like five minutes, and a locked data scope, such as three specific customer IDs. The second the workflow step completes or the timer expires, the lease is destroyed.

Treat approvals as workflow transitions [Scoped Approval Routing]. A human approval does not grant ambient trust. It acts as the key that turns the lock from an inactive state to an active state. If the human approves an email draft, the runtime transitions the state to send email for that single message, executes the send, and immediately locks the capability behind it.

The model can think, investigate, and request capabilities. But it can never grant itself permission. The runtime knows the workflow, validates the state, checks the scope, and governs the execution boundary. That is how you let agents do complex enterprise work without handing them the keys to the entire company.
