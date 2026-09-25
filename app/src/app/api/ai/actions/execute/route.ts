import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
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
    return badRequest("Invalid request.");
  }
  if (!orgId || !tool) {
    return badRequest("orgId and tool are required.");
  }

  try {
    const result = await agentExecute(orgId, tool, input);
    return NextResponse.json({ result });
  } catch (e) {
    return routeError(e, "Could not complete the action.");
  }
}
