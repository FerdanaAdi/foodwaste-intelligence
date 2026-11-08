/** Explicit authenticated wire fixtures; domain spies still count domain requests only. */
import { vi } from 'vitest';
import { checkSession, invalidateAuth, readIntents, type Session } from '@/backend/auth';
import { CAPTURE_JOURNAL_KEY } from '@/backend/write';
export const sessionA: Session = {
  principal_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  auth_context_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', csrf_token: 'a'.repeat(64),
  sites: [{ site_id: '22222222-2222-4222-8222-222222222222',
    permissions: ['event.create', 'event.read', 'measurement.create', 'measurement.read'] }],
};
export function authResponse(value: unknown, status=200, owner=sessionA): Response {
  return { status, ok: status >= 200 && status < 300,
    headers: new Headers({ 'X-FWI-Principal': owner.principal_id, 'X-FWI-Auth-Context': owner.auth_context_id }),
    json: async () => value } as Response;
}
export async function prepareSession(owner=sessionA) {
  invalidateAuth('', 'checking');
  vi.stubGlobal('fetch', vi.fn(async (path: string) => authResponse(path === '/auth/session' ? owner : [], 200, owner)));
  await checkSession(); await readIntents();
}
export function installDomainFetch(domain: (path: string, options?: RequestInit) => Promise<Response>) {
  const calls = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === '/auth/session') return authResponse(sessionA);
    if (path === '/auth/intents') {
      if (options?.method === 'POST') return authResponse({ intent_id: crypto.randomUUID(), state: 'registered' }, 201);
      const marker = sessionStorage.getItem(CAPTURE_JOURNAL_KEY);
      return authResponse(marker ? [{ intent_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        site_id: sessionA.sites[0].site_id, kind: 'event', event_id: null, result_id: null,
        state: 'registered', registered_at: '2026-11-07T12:00:00Z' }] : []);
    }
    const response = await domain(path, options);
    return { ...response, status: response.status ?? 200,
      headers: response.headers ?? authResponse(null).headers } as Response;
  });
  vi.stubGlobal('fetch', calls);
  return calls;
}
export function domainCalls() { return vi.mocked(fetch).mock.calls.filter(call => String(call[0]).startsWith('/demo/')); }
