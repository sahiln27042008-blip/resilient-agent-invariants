import { Rule } from "../types";
import { claimCheck } from "./claim-check";
import { cqrsToolSurface } from "./cqrs-tool-surface";
import { idempotencyGuard } from "./idempotency-guard";
import { processIsolation } from "./process-isolation";
import { sagaCompensation } from "./saga-compensation";
import { zeroHoldLeases } from "./zero-hold-leases";

export const ALL_RULES: Rule[] = [
  zeroHoldLeases,
  claimCheck,
  idempotencyGuard,
  sagaCompensation,
  processIsolation,
  cqrsToolSurface,
];
