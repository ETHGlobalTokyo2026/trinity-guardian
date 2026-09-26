/**
 * Read an env var, falling back when it is unset *or blank*. Hosting dashboards
 * (Vercel) happily store `X402_NETWORK=""`, and `??` would pass that empty
 * string straight through.
 */
export function envOr(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}
