/** Human names for the CAIP-2 networks this app touches; unknown ids fall back to the raw id. */
const CHAIN_NAMES: Record<string, string> = {
  "eip155:1": "Ethereum",
  "eip155:11155111": "Sepolia",
  "eip155:8453": "Base",
  "eip155:84532": "Base Sepolia",
};

export function networkName(caip2: string | undefined): string {
  if (!caip2) return "unknown network";
  return CHAIN_NAMES[caip2] ?? caip2;
}
