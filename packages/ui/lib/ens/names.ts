/** Name layout: <agentLabel>.<parentLabel>.eth, sellers as <label>.<parentLabel>.eth */
export const ENS_PARENT_LABEL = process.env.ENS_PARENT_LABEL ?? "payguard";
export const ENS_AGENT_LABEL = process.env.ENS_AGENT_LABEL ?? "momo";
export const ENS_SELLER_LABEL = process.env.ENS_SELLER_LABEL ?? "weather";
export const ENS_PARENT_NAME = `${ENS_PARENT_LABEL}.eth`;
export const ENS_AGENT_NAME = `${ENS_AGENT_LABEL}.${ENS_PARENT_NAME}`;
export const ENS_SELLER_NAME = `${ENS_SELLER_LABEL}.${ENS_PARENT_NAME}`;

/** Our own UserRegistry proxy (the registry for <parent>.eth) and PermissionedResolver proxy, from `pnpm mandate setup`. */
export const ENS_USER_REGISTRY = (process.env.ENS_USER_REGISTRY?.trim() || undefined) as `0x${string}` | undefined;
export const ENS_RESOLVER = (process.env.ENS_RESOLVER?.trim() || undefined) as `0x${string}` | undefined;

export function ensConfigured(): boolean {
  return Boolean(ENS_USER_REGISTRY && ENS_RESOLVER);
}
