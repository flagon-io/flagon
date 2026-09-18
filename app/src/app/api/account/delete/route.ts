import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { softDeleteUser } from "@/lib/user-account";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Block while the user still owns organizations (would orphan them).
  const me = await getMe().catch(() => null);
  const owned = me?.orgs.filter((o) => o.role === "owner").length ?? 0;
  if (owned > 0) {
    return NextResponse.json(
      { error: "Leave or delete the organizations you own before deleting your account." },
      { status: 400 },
    );
  }

  await softDeleteUser(session.user.id);
  return NextResponse.json({ ok: true });
}
