import { namehash, parseAbi, type Hex } from "viem";

export const RESOLVER = "0xf23345070E24cb42E0A87323F75b84a34d9D33f6" as const;
export const NAME = "momo.agents.trinityguard.eth";
export const TEXT_KEY = "com.trinityguard.perTxMax";
export const COIN_TYPE_ETH = 60n;

export type ProbeCandidate = {
  label: string;
  abi: ReturnType<typeof parseAbi>;
  functionName: "text" | "addr";
  args: readonly [Hex, string] | readonly [Hex, bigint] | readonly [Hex];
};

export type ContractReader = {
  readContract: (args: {
    address: typeof RESOLVER;
    abi: ProbeCandidate["abi"];
    functionName: ProbeCandidate["functionName"];
    args: ProbeCandidate["args"];
  }) => Promise<unknown>;
};

export type ProbeOutcome = {
  label: string;
  status: "hit" | "revert";
  detail: string;
};

export function dnsEncode(name: string): Hex {
  let encoded = "0x";
  for (const label of name.split(".")) {
    const labelBytes = new TextEncoder().encode(label);
    if (labelBytes.length === 0 || labelBytes.length > 63) {
      throw new Error(`Invalid DNS label in "${name}"`);
    }
    encoded += labelBytes.length.toString(16).padStart(2, "0");
    for (const byte of labelBytes) {
      encoded += byte.toString(16).padStart(2, "0");
    }
  }
  return `${encoded}00` as Hex;
}

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[rpc]").split("\n")[0]?.slice(0, 240) ?? "reverted";
}

export function recordCandidates(): ProbeCandidate[] {
  const dnsName = dnsEncode(NAME);
  const node = namehash(NAME);
  return [
    {
      label: "text(bytes,string)",
      abi: parseAbi(["function text(bytes name, string key) view returns (string)"]),
      functionName: "text",
      args: [dnsName, TEXT_KEY],
    },
    {
      label: "text(bytes32,string)",
      abi: parseAbi(["function text(bytes32 node, string key) view returns (string)"]),
      functionName: "text",
      args: [node, TEXT_KEY],
    },
    {
      label: "addr(bytes,uint256)",
      abi: parseAbi(["function addr(bytes name, uint256 coinType) view returns (bytes)"]),
      functionName: "addr",
      args: [dnsName, COIN_TYPE_ETH],
    },
    {
      label: "addr(bytes32)",
      abi: parseAbi(["function addr(bytes32 node) view returns (address)"]),
      functionName: "addr",
      args: [node],
    },
  ];
}

export async function probeRecords(reader: ContractReader): Promise<ProbeOutcome[]> {
  const outcomes: ProbeOutcome[] = [];
  for (const candidate of recordCandidates()) {
    try {
      const result = await reader.readContract({
        address: RESOLVER,
        abi: candidate.abi,
        functionName: candidate.functionName,
        args: candidate.args,
      });
      outcomes.push({ label: candidate.label, status: "hit", detail: String(result) });
    } catch (error) {
      outcomes.push({ label: candidate.label, status: "revert", detail: safeError(error) });
    }
  }
  return outcomes;
}

export function formatProbeReport(outcomes: ProbeOutcome[]): string {
  const hits = outcomes.filter((outcome) => outcome.status === "hit").length;
  const lines = [
    "PermissionedResolver record probe",
    `Resolver: ${RESOLVER}`,
    `Name: ${NAME}`,
    `Text key: ${TEXT_KEY}`,
    "Read only. No transaction will be sent.",
    "",
  ];
  for (const outcome of outcomes) {
    if (outcome.status === "hit") {
      lines.push(`HIT  ${outcome.label}`, `     result: ${outcome.detail}`);
    } else {
      lines.push(`REVERT  ${outcome.label}`, `        ${outcome.detail}`);
    }
  }
  lines.push("", hits === 0 ? "No candidate getter succeeded." : `Succeeded: ${hits}`);
  return lines.join("\n");
}
