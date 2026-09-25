import { NextResponse } from "next/server";
import { getMe } from "@/lib/flagon-api";
import { getSession } from "@/lib/session";
import { routeError } from "@/lib/route-error";
import { softDeleteUser } from "@/lib/user-account";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block while the user still owns organizations (would orphan them). If the
  // ownership check itself fails (API down), refuse rather than delete blind.
  let owned: number;
  try {
    const me = await getMe();
    owned = me?.orgs.filter((o) => o.role === "owner").length ?? 0;
  } catch (e) {
    return routeError(e, "Could not verify your organizations. Try again.");
  }
  if (owned > 0) {
    return NextResponse.json(
      { error: "Leave or delete the organizations you own before deleting your account." },
      { status: 409 },
    );
  }

  await softDeleteUser(session.user.id);
  return NextResponse.json({ ok: true });
}
