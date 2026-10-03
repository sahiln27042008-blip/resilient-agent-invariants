export type Severity = "CRITICAL" | "HIGH" | "WARNING";

export type RuleId =
  | "zero-hold-leases"
  | "claim-check"
  | "idempotency-guard"
  | "saga-compensation"
  | "process-isolation"
  | "cqrs-tool-surface";

export interface Violation {
  rule: RuleId;
  severity: Severity;
  source: "code" | "trace";
  message: string;
  blastRadius: string;
  pattern: string; // repo folder, e.g. patterns/08-capability-leases
  fix: string;
  location?: { file: string; line?: number; step?: number };
  estimatedWasteUsd?: number; // token waste, per occurrence
  estimatedMonthlyRiskUsd?: number;
}

export interface SourceFile {
  path: string;
  text: string;
}

export interface TraceStep {
  step: number;
  tool?: string;
  method?: string; // GET | POST | PATCH | DELETE ...
  mutating?: boolean;
  payload_bytes?: number;
  claim_check?: string; // sha256 pointer if offloaded
  db_connection_held_ms?: number;
  idempotency_key?: string;
  compensation_registered?: boolean;
}

export interface Trace {
  run_id: string;
  steps: TraceStep[];
}

export interface Rule {
  id: RuleId;
  scanCode?(file: SourceFile): Violation[];
  auditTrace?(trace: Trace, path: string): Violation[];
}

export interface AuditResult {
  target: string;
  violations: Violation[];
}

export const TOKEN_PRICE_PER_M_USD = 10;
export const BYTES_PER_TOKEN = 4;
export const CLAIM_CHECK_MAX_BYTES = 250;
export const LEASE_MAX_HELD_MS = 500;
export const CQRS_MAX_READ_TOOLS = 5;
