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

export interface GuardianVerdict {
  decision: Decision;
  reasons: string[];
  layers?: unknown[]; // richer per-layer detail once guardian package lands
}

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

export type ApprovalCreate = {
  agent: string;
  amount: string;
  asset: string;
  payTo: string;
  network: string;
  reason: string;
  resource: string;
  decision: "soft_fail";
};

export interface ApprovalClient {
  create(input: ApprovalCreate): Promise<{ id: string }>;
  wait(id: string): Promise<{ status: string }>;
  consume(id: string): Promise<{ ok: true }>;
}

export interface BuyOptions {
  approval?: ApprovalClient;
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
