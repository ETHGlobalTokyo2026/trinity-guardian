import type { Guardian, GuardianConfig, PaymentRequirements, Policy } from "./types.js";

export type { Decision, Guardian, GuardianConfig, GuardianVerdict, PaymentRequirements, Policy } from "./types.js";

const BASE_SEPOLIA = "eip155:84532";

export function createGuardian(config: GuardianConfig): Guardian {
  return {
    readPolicy(subname) {
      return config.readPolicy(subname);
    },

    async requestApproval(_reqs: PaymentRequirements, _reasons: string[]) {
      return false;
    },

    async checkPolicy(reqs, dailySpend) {
      let policy: Policy | null;
      try {
        policy = await config.readPolicy(config.agentSubname);
      } catch {
        return { decision: "hard_fail", reasons: ["policy read failed"] };
      }

      if (policy === null) {
        return { decision: "hard_fail", reasons: ["authority missing"] };
      }
      if (!policy.roleActive) {
        return { decision: "hard_fail", reasons: ["authority revoked"] };
      }

      if (reqs.network !== BASE_SEPOLIA) {
        return {
          decision: "hard_fail",
          reasons: [`network ${reqs.network} not allowed (Base Sepolia only)`],
        };
      }

      let flagged = false;
      try {
        flagged = await config.isFlagged(reqs.payTo);
      } catch (e) {
        return {
          decision: "hard_fail",
          reasons: [e instanceof Error ? e.message : String(e)],
        };
      }
      if (flagged) {
        return {
          decision: "hard_fail",
          reasons: ["Intercepta [mock]: address flagged — reported rugpull / scam entity"],
        };
      }

      if (policy.allowedAsset !== "" && policy.allowedAsset.toLowerCase() !== reqs.asset.toLowerCase()) {
        return { decision: "hard_fail", reasons: [`asset ${reqs.asset} is not allowed`] };
      }

      const reasons: string[] = [];
      const amount = BigInt(reqs.amount);
      if (amount > policy.perTxMax) reasons.push("amount exceeds perTxMax $5.00");
      if (dailySpend + amount > policy.dailyCap) {
        return {
          decision: "hard_fail",
          reasons: [...reasons, "dailySpend + amount would exceed dailyCap $50.00"],
        };
      }
      return reasons.length ? { decision: "soft_fail", reasons } : { decision: "pass", reasons: [] };
    },
  };
}
