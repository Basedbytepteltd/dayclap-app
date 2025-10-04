export function getAdminList() {
  const raw = (import.meta.env.VITE_ADMIN_EMAILS || '').toString().toLowerCase();
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  // Sensible fallback to keep access if env is missing
  if (list.length === 0) return ['admin@example.com'];
  return list;
}

export function isAdminEmail(email) {
  if (!email) return false;
  const e = String(email).toLowerCase().trim();
  return getAdminList().includes(e);
}
