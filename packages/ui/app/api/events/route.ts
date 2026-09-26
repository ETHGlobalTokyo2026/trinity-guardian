import { bus, snapshot } from "@/lib/store";

/** Server-sent events: the live feed the dashboard subscribes to. */
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      send("snapshot", snapshot());
      const onEvent = (e: unknown) => send("event", e);
      const onLedger = (l: unknown) => send("ledger", l);
      const onApproval = (a: unknown) => send("approval", a);
      const onReset = () => send("snapshot", snapshot());
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
