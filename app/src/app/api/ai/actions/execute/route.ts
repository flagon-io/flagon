import { NextResponse } from "next/server";
import { agentExecute } from "@/lib/flagon-api";

// Executes a confirmed agent action (human-in-the-loop). The action runs as the
// verified user in the Go API, so permissions/RLS still apply.
export async function POST(request: Request) {
  let orgId = "";
  let tool = "";
  let input: unknown = {};
  try {
    const body = await request.json();
    orgId = typeof body.orgId === "string" ? body.orgId : "";
    tool = typeof body.tool === "string" ? body.tool : "";
    input = body.input ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!orgId || !tool) {
    return NextResponse.json({ error: "orgId and tool are required." }, { status: 400 });
  }

  try {
    const result = await agentExecute(orgId, tool, input);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not complete the action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
