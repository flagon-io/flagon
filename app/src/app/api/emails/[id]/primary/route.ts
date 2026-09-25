import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { routeError } from "@/lib/route-error";
import { setPrimaryUserEmail } from "@/lib/user-emails";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await setPrimaryUserEmail(session.user.id, id);
    return NextResponse.json({ status: true });
  } catch (e) {
    return routeError(e, "Something went wrong.");
  }
}
