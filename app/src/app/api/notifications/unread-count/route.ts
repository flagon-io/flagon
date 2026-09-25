import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { unreadNotificationCount } from "@/lib/flagon-api";

export async function GET() {
  try {
    const count = await unreadNotificationCount();
    return NextResponse.json({ count });
  } catch (e) {
    return routeError(e);
  }
}
