// Shared types for @trinity/agent — contract from plan/task-agent.md

export interface PaymentRequirements {
  scheme: string;
  network: string; // CAIP-2, e.g. "eip155:84532"
  amount: string; // atomic units (USDC 6 decimals)
  asset: string; // token contract address
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, string>;
}

export interface X402Quote {
  x402Version: number;
  error: string;
  resource: { url: string; description?: string; mimeType?: string };
  accepts: PaymentRequirements[];
}

export type Decision = "pass" | "soft_fail" | "hard_fail";

/** Until @trinity/guardian lands: minimal shape the agent calls. */
export interface GuardianVerdict {
  decision: Decision;
  reasons: string[];
  layers?: unknown[]; // richer per-layer detail once guardian package lands
}

export type AskHuman = (reqs: PaymentRequirements, reasons: string[]) => Promise<boolean>;

export interface SpendState {
  spendToday: bigint;
  txCount: number;
  window: string; // ISO UTC date "2026-09-26"
  lastUpdated: Date;
}

export type PaymentEventType =
  | "quote_received"
  | "guardian_checking"
  | "guardian_verdict"
  | "approval_requested"
  | "approval_response"
  | "signing"
  | "paid"
  | "refused";

export interface PaymentEvent {
  type: PaymentEventType;
  timestamp: Date;
  agentName: string;
  resource: string;
  payTo?: string;
  amount?: string;
  asset?: string;
  network?: string;
  verdict?: GuardianVerdict;
  approvalRequested?: boolean;
  approved?: boolean;
  txHash?: string;
  reason?: string;
}

export type PaymentEventHandler = (event: PaymentEvent) => void;

export interface BuyOptions {
  askHuman?: AskHuman;
  onEvent?: PaymentEventHandler;
}

export interface BuyResult {
  status: "paid" | "refused" | "unexpected";
  payTo?: string;
  amount?: string;
  txHash?: string;
  reason?: string;
  spendState: SpendState;
}
