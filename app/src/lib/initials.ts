/** Up to two uppercase initials for an avatar fallback (name, then username, then email). */
export function initials(p: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const base = (p.name || p.username || p.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
