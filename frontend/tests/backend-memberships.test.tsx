import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import BackendMembershipPage from '@/pages/BackendMembershipPage';
import { authSnapshot, invalidateAuth, selectSite } from '@/backend/auth';
import { changeMembership, membershipLocked, readMemberships, type Member } from '@/backend/memberships';
import { authResponse, prepareSession, sessionA } from './backend-auth-fixture';
const admin = { ...sessionA, sites: sessionA.sites.map(s => ({ ...s, permissions: [...s.permissions, 'membership.manage'] })) };
const target: Member = { principal_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', username: 'synthetic_reader',
  role: 'reader', active: true, eligible: true, enabled: true };
const audit = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const success = { principal_id: target.principal_id, site_id: admin.sites[0].site_id, role: 'writer', active: true, audit_id: audit };
beforeEach(async () => { sessionStorage.clear(); await prepareSession(admin); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });
function mockWire(post: () => Promise<Response> = async () => authResponse(success)) {
  const mock = vi.fn(async (_path: string, options?: RequestInit) => options?.method === 'POST' ? post() : authResponse([target]));
  vi.stubGlobal('fetch', mock); return mock;
}
it('ordinary reader has no admin page or direct client submission', async () => {
  await prepareSession(); const mock = mockWire(); render(<BackendMembershipPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Tidak ada izin');
  await expect(readMemberships(new AbortController().signal)).rejects.toThrow('Tidak ada izin');
  expect(await changeMembership(target,'change_role','writer','test')).toBe('rejected');
  expect(mock).not.toHaveBeenCalled();
});
it('renders roster and sends exact site, target, state, reason and CSRF once', async () => {
  const mock = mockWire(); const user = userEvent.setup(); render(<BackendMembershipPage />);
  await screen.findByRole('option',{ name: target.username });
  await user.selectOptions(screen.getByLabelText('Anggota roster lokasi'), target.principal_id);
  await user.selectOptions(screen.getByLabelText('Peran operasional'), 'writer');
  await user.type(screen.getByLabelText('Alasan perubahan'), 'synthetic reason');
  await user.click(screen.getByRole('button',{ name: 'Ubah peran' }));
  expect(await screen.findByRole('status')).toHaveTextContent('audit tersimpan bersama');
  const posts = mock.mock.calls.filter(c => c[1]?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ site_id: admin.sites[0].site_id, principal_id: target.principal_id,
    action: 'change_role', role: 'writer', reason: 'synthetic reason', expected_role: 'reader', expected_active: true });
  expect(posts[0][1]!.headers).toMatchObject({ 'X-CSRF-Token': admin.csrf_token });
  expect(membershipLocked(target.principal_id)).toBe(false);
});
it('UNKNOWN survives GET, remount/refresh and logout/login; no manual unlock or second POST', async () => {
  const mock = mockWire(async () => authResponse({},503));
  expect(await changeMembership(target,'change_role','writer','test')).toBe('unknown');
  const view = render(<BackendMembershipPage />); const user = userEvent.setup();
  await screen.findByRole('option',{ name: target.username });
  await user.selectOptions(screen.getByLabelText('Anggota roster lokasi'),target.principal_id);
  expect(screen.getByRole('alert')).toHaveTextContent('Pengiriman terkunci');
  await user.type(screen.getByLabelText('Alasan perubahan'),'reason');
  expect(screen.getByRole('button',{ name: 'Ubah peran' })).toBeDisabled();
  expect(screen.queryByRole('button',{ name: /akui|konfirmasi hasil/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{ name: 'Muat ulang daftar (GET)' }));
  await waitFor(() => expect(mock.mock.calls.filter(c => !c[1]?.method)).toHaveLength(2));
  expect(membershipLocked(target.principal_id)).toBe(true);
  view.unmount(); invalidateAuth(); await prepareSession(admin); mockWire();
  render(<BackendMembershipPage />); await screen.findByRole('option',{ name: target.username });
  expect(membershipLocked(target.principal_id)).toBe(true);
  expect(await changeMembership(target,'change_role','writer','test')).toBe('unknown');
  expect(mock.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1);
});
it('UNKNOWN for one target does not block a different eligible target', async () => {
  const mock = mockWire(async () => authResponse({},503));
  expect(await changeMembership(target,'revoke',null,'test')).toBe('unknown');
  const other = { ...target, principal_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };
  expect(membershipLocked(other.principal_id)).toBe(false);
  expect(await changeMembership(other,'revoke',null,'test')).toBe('unknown');
  expect(mock.mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(2);
});
it('self-management and ineligible principals are rejected before dispatch', async () => {
  const mock = mockWire();
  expect(await changeMembership({ ...target, principal_id: admin.principal_id },'revoke',null,'test')).toBe('rejected');
  expect(await changeMembership({ ...target, eligible: false },'grant','writer','test')).toBe('rejected');
  expect(mock).not.toHaveBeenCalled();
});
it('a definitive stale-state 409 is rejected and a malformed success stays UNKNOWN', async () => {
  mockWire(async () => authResponse({},409));
  expect(await changeMembership(target,'revoke',null,'test')).toBe('rejected');
  expect(membershipLocked(target.principal_id)).toBe(false);
  mockWire(async () => authResponse({ ...success, site_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
  expect(await changeMembership(target,'change_role','writer','test')).toBe('unknown');
  expect(membershipLocked(target.principal_id)).toBe(true);
});
it('storage failure fails closed without a POST', async () => {
  const mock = mockWire(); vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('unavailable'); });
  expect(await changeMembership(target,'revoke',null,'test')).toBe('unknown');
  expect(mock).not.toHaveBeenCalled();
});
it.each([401,403])('%s closes private data without replay', async status => {
  const mock = mockWire(async () => authResponse({},status));
  expect(await changeMembership(target,'revoke',null,'test')).toBe('unknown');
  expect(authSnapshot().session).toBeNull(); expect(mock).toHaveBeenCalledTimes(1);
});
it('late roster after actor transition is not rendered', async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r; })));
  render(<BackendMembershipPage />);
  await act(async () => { invalidateAuth(); resolve(authResponse([target])); await Promise.resolve(); });
  expect(screen.queryByRole('option',{name:target.username})).not.toBeInTheDocument();
});
it('late roster after authorized site switch cannot expose old site members', async () => {
  const siteB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const multisite = { ...admin, sites: [...admin.sites, { site_id: siteB, permissions: ['membership.manage'] }] };
  await prepareSession(multisite);
  let resolve!: (r: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r; })));
  render(<BackendMembershipPage />);
  const old = resolve;
  await act(async () => { selectSite(siteB); old(authResponse([target],200,multisite)); await Promise.resolve(); });
  expect(screen.queryByRole('option',{name:target.username})).not.toBeInTheDocument();
});

it('an admin can revoke existing site access when grant eligibility is absent', async () => {
  const mock = mockWire(async () => authResponse({ ...success, role:'reader', active:false }));
  expect(await changeMembership({ ...target, eligible:false },'revoke',null,'remove existing access')).toBe('saved');
  expect(mock).toHaveBeenCalledTimes(1);
});
