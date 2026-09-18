import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required." }, { status: 400 });
  }

  try {
    const result = await agentMessage(orgId, messages);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The assistant is unavailable.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
