import { NextResponse } from "next/server";
import { routeError, badRequest } from "@/lib/route-error";
import { agentMessage, type AgentMessage } from "@/lib/flagon-api";

// Thin proxy: the browser posts here; the server gateway forwards to the Go
// API's agent with the internal token + verified user identity.
export async function POST(request: Request) {
  let orgId = "";
  let messages: AgentMessage[] = [];
  try {
    const body = await request.json();
    orgId = typeof body.orgId === "string" ? body.orgId : "";
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return badRequest("Invalid request.");
  }
  if (!orgId) {
    return badRequest("orgId is required.");
  }

  try {
    const result = await agentMessage(orgId, messages);
    return NextResponse.json(result);
  } catch (e) {
    return routeError(e, "The assistant is unavailable.");
  }
}
