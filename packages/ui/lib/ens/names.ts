import { envOr } from "../env";

/** Name layout: <agentLabel>.<parentLabel>.eth, sellers as <label>.<parentLabel>.eth */
export const ENS_PARENT_LABEL = envOr("ENS_PARENT_LABEL", "payguard");
export const ENS_AGENT_LABEL = envOr("ENS_AGENT_LABEL", "momo");
export const ENS_SELLER_LABEL = envOr("ENS_SELLER_LABEL", "weather");
export const ENS_PARENT_NAME = `${ENS_PARENT_LABEL}.eth`;
export const ENS_AGENT_NAME = `${ENS_AGENT_LABEL}.${ENS_PARENT_NAME}`;
export const ENS_ROGUE_LABEL = "rogue";
export const ENS_ROGUE_NAME = `${ENS_ROGUE_LABEL}.${ENS_PARENT_NAME}`;
export const ENS_SELLER_NAME = `${ENS_SELLER_LABEL}.${ENS_PARENT_NAME}`;

/** Default label is the dashboard agent. Any other label is a sibling under the same parent. */
export function agentIdentity(label = ENS_AGENT_LABEL): { label: string; name: string } {
  if (label === ENS_AGENT_LABEL) return { label: ENS_AGENT_LABEL, name: ENS_AGENT_NAME };
  if (label === ENS_ROGUE_LABEL) return { label: ENS_ROGUE_LABEL, name: ENS_ROGUE_NAME };
  return { label, name: `${label}.${ENS_PARENT_NAME}` };
}

/** Our own UserRegistry proxy (the registry for <parent>.eth) and PermissionedResolver proxy, from `pnpm mandate setup`. */
export const ENS_USER_REGISTRY = (process.env.ENS_USER_REGISTRY?.trim() || undefined) as `0x${string}` | undefined;
export const ENS_RESOLVER = (process.env.ENS_RESOLVER?.trim() || undefined) as `0x${string}` | undefined;

export function ensConfigured(): boolean {
  return Boolean(ENS_USER_REGISTRY && ENS_RESOLVER);
}
