/** Synthetic admin only. One dispatch; no replay or GET-based UNKNOWN unlock. */
import { assertCurrent, authSnapshot, permits, protectedJson } from './auth';
import { isUUID } from './contract';
export type Member = { principal_id: string; username: string; role: 'reader' | 'writer' | null;
  active: boolean | null; eligible: boolean; enabled: boolean };
export type MemberAction = 'grant' | 'change_role' | 'revoke' | 'reactivate';
function key(target: string) {
  const auth = authSnapshot();
  if (!auth.session || !isUUID(target) || !isUUID(auth.site)) throw new Error('Sesi tidak tersedia.');
  return `fwi-membership-pending:${auth.session.principal_id}:${auth.site}:${target}`;
}
export function membershipLocked(target: string) {
  try { return sessionStorage.getItem(key(target)) !== null; } catch { return true; }
}
export async function readMemberships(signal: AbortSignal): Promise<Member[]> {
  const site = authSnapshot().site;
  if (!permits('membership.manage')) throw new Error('Tidak ada izin administrasi lokasi ini.');
  const { response, value } = await protectedJson(`/auth/memberships?site_id=${encodeURIComponent(site)}`, {}, signal);
  if (!response.ok || !Array.isArray(value) || value.some(m => !m || !isUUID(m.principal_id) ||
      typeof m.username !== 'string' || ![null,'reader','writer'].includes(m.role) ||
      (m.active !== null && typeof m.active !== 'boolean') || typeof m.eligible !== 'boolean' || typeof m.enabled !== 'boolean'))
    throw new Error('Daftar akses tidak dapat diverifikasi.');
  return value as Member[];
}
export async function changeMembership(member: Member, action: MemberAction, role: string | null, reason: string) {
  const expected = authSnapshot();
  if (!permits('membership.manage') || expected.session?.principal_id === member.principal_id ||
      (!member.eligible && action !== 'revoke') || !reason.trim() || reason.trim().length > 1000)
    return 'rejected' as const;
  let storageKey: string;
  try {
    storageKey = key(member.principal_id);
    if (sessionStorage.getItem(storageKey) !== null) return 'unknown' as const;
    sessionStorage.setItem(storageKey, 'pending');
    if (sessionStorage.getItem(storageKey) !== 'pending') return 'unknown' as const;
  } catch { return 'unknown' as const; }
  try {
    const { response, value } = await protectedJson('/auth/memberships', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site_id: expected.site,
        principal_id: member.principal_id, action, role, reason: reason.trim(),
        expected_role: member.role, expected_active: member.active }) });
    assertCurrent(expected);
    if (response.status === 200) {
      const v = value as { principal_id?: string; site_id?: string; role?: string; active?: boolean; audit_id?: string };
      const nextRole = action === 'grant' || action === 'change_role' ? role : member.role;
      const nextActive = action !== 'revoke';
      if (v?.principal_id !== member.principal_id || v.site_id !== expected.site || v.role !== nextRole ||
          v.active !== nextActive || !isUUID(v.audit_id ?? '')) return 'unknown' as const;
      sessionStorage.removeItem(storageKey);
      return 'saved' as const;
    }
    if ([400,401,403,404,409,422].includes(response.status)) {
      sessionStorage.removeItem(storageKey); return 'rejected' as const;
    }
  } catch { /* The original acknowledgement is not definitive; retain evidence. */ }
  return 'unknown' as const;
}
