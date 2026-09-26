import { bus, redactApproval, snapshot, type ApprovalRequest } from "@/lib/store";
import { isOwner } from "@/lib/admin-auth";

/**
 * Server-sent events: the live feed the dashboard subscribes to. EventSource
 * cannot send the owner token, so with ADMIN_TOKEN set approvals arrive
 * redacted and the dashboard refetches /api/state with the token.
 */
export async function GET(req: Request) {
  const owner = isOwner(req);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      send("snapshot", snapshot({ owner }));
      const onEvent = (e: unknown) => send("event", e);
      const onLedger = (l: unknown) => send("ledger", l);
      const onApproval = (a: ApprovalRequest) => send("approval", owner ? a : redactApproval(a));
      const onReset = () => send("snapshot", snapshot({ owner }));
      bus.on("event", onEvent);
      bus.on("ledger", onLedger);
      bus.on("approval", onApproval);
      bus.on("reset", onReset);
      const ping = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 15_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        bus.off("event", onEvent);
        bus.off("ledger", onLedger);
        bus.off("approval", onApproval);
        bus.off("reset", onReset);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
