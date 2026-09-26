export type Decision = "pass" | "soft_fail" | "hard_fail";

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
}

export interface Policy {
  roleActive: boolean;
  perTxMax: bigint;
  dailyCap: bigint;
  allowedAsset: string;
}

export interface GuardianVerdict {
  decision: Decision;
  reasons: string[];
}

export interface Guardian {
  readPolicy(subname: string): Promise<Policy | null>;
  checkPolicy(reqs: PaymentRequirements, dailySpend: bigint): Promise<GuardianVerdict>;
  requestApproval(reqs: PaymentRequirements, reasons: string[]): Promise<boolean>;
}

export interface GuardianConfig {
  agentSubname: string;
  readPolicy(subname: string): Promise<Policy | null>;
  isFlagged(payTo: string): boolean | Promise<boolean>;
}
