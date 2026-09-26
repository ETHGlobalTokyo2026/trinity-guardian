import type { ApprovalClient } from "./types.js";

function apiBase() {
  return process.env.APPROVAL_API_URL ?? "http://localhost:3000";
}

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: string };
}

export function httpApprovalClient(log: (line: string) => void = () => {}): ApprovalClient {
  const base = apiBase();
  return {
    async create(input) {
      const res = await fetch(`${base}/api/approvals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await readJson(res);
      if (!res.ok || !body.id) throw new Error(body.error ?? `approval create failed (${res.status})`);
      log(`World ID approval ${body.id} — submit a proof to POST /api/approvals/${body.id}`);
      return { id: body.id };
    },
    async wait(id) {
      const deadline = Date.now() + Number(process.env.APPROVAL_TIMEOUT_MS ?? 5 * 60_000) + 2_000;
      while (Date.now() < deadline) {
        const res = await fetch(`${base}/api/approvals/${id}`, { cache: "no-store" });
        const body = await readJson(res);
        if (!res.ok) throw new Error(body.error ?? `approval read failed (${res.status})`);
        if (body.status && body.status !== "pending") return { status: body.status };
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      return { status: "expired" };
    },
    async consume(id) {
      const res = await fetch(`${base}/api/approvals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "consume" }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error ?? `approval consume failed (${res.status})`);
      return { ok: true };
    },
  };
}
