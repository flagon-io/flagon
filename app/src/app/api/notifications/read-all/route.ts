import { NextResponse } from "next/server";
import { routeError } from "@/lib/route-error";
import { markAllNotificationsRead } from "@/lib/flagon-api";

export async function POST() {
  try {
    await markAllNotificationsRead();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return routeError(e, "Could not update notifications.");
  }
}
