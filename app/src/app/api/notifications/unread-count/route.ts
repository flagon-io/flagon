import { NextResponse } from "next/server";
import { unreadNotificationCount } from "@/lib/flagon-api";

export async function GET() {
  const count = await unreadNotificationCount().catch(() => 0);
  return NextResponse.json({ count });
}
