import { NextResponse } from "next/server";
import { getScenario } from "@/lib/agent/scenarios";
import { runScenario } from "@/lib/agent/client";

/**
 * Kick off one agent purchase. The run continues in the background (it may
 * park for minutes waiting for the owner); progress streams over /api/events.
 * Pass `wait: true` to block until the run finishes (handy for curl).
 */
export async function POST(req: Request) {
  const { scenario: id, wait } = (await req.json().catch(() => ({}))) as { scenario?: string; wait?: boolean };
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return NextResponse.json({ error: "unknown scenario" }, { status: 400 });
  const run = runScenario(scenario);
  if (wait) return NextResponse.json(await run);
  run.catch(() => {});
  return NextResponse.json({ started: true, scenario: scenario.id }, { status: 202 });
}

export const maxDuration = 300;
