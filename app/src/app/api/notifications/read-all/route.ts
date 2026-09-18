import { NextResponse } from "next/server";
import { markAllNotificationsRead } from "@/lib/flagon-api";

export async function POST() {
  try {
    await markAllNotificationsRead();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not update notifications." }, { status: 400 });
  }
}
