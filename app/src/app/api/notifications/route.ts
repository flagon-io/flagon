import { NextResponse } from "next/server";
import { listNotifications } from "@/lib/flagon-api";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit")) || 30;
  try {
    const notifications = await listNotifications(limit);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
