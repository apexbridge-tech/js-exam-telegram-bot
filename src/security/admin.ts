export function isAdmin(tgUserId: number | undefined): boolean {
  if (!tgUserId) return false;
  const raw = process.env.ADMIN_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite);
  return ids.includes(tgUserId);
}
