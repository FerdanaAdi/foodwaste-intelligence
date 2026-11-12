import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import fixture from './fixtures/backend-detail.json';
import { authResponse, prepareSession, sessionA } from './backend-auth-fixture';
import { authSnapshot, checkSession, invalidateAuth, selectSite, type Session } from '@/backend/auth';
import { CAPTURE_JOURNAL_KEY } from '@/backend/write';
import userEvent from '@testing-library/user-event';

class Channel {
  static all = new Set<Channel>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor() { Channel.all.add(this); }
  postMessage(data: unknown) { for (const peer of Channel.all) if (peer !== this) peer.onmessage?.({ data } as MessageEvent); }
  close() { Channel.all.delete(this); }
}
const sessionB: Session = { ...sessionA, principal_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  auth_context_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', csrf_token: 'b'.repeat(64) };
const path = `/backend-demo/events/${fixture.event.event_id}`;
function domainResponse(url: string, label='private-A', owner=sessionA) {
  return authResponse(url.endsWith('/measurements') ? [{ ...fixture.measurement, provenance: label }] : fixture.event, 200, owner);
}
function routes(owner: Session, domain: (url: string, options?: RequestInit) => Promise<Response>, intents: unknown[] = []) {
  return vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/auth/session') return authResponse(owner, 200, owner);
    if (url === '/auth/intents') return authResponse(intents, 200, owner);
    return domain(url, options);
  });
}
function mount() { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }
beforeEach(async () => { sessionStorage.clear(); vi.stubGlobal('BroadcastChannel', Channel); await prepareSession(); });
afterEach(() => { cleanup(); invalidateAuth(); vi.unstubAllGlobals(); Channel.all.clear(); vi.useRealTimers(); });

it.each([sessionB, { ...sessionA, auth_context_id: sessionB.auth_context_id }])(
  'rejects delayed actor/session-A data after a new context becomes active', async next => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(r => { resolve = r; });
    vi.stubGlobal('fetch', routes(sessionA, async () => pending));
    mount();
    await screen.findByText('Memuat catatan kejadian…');
    vi.stubGlobal('fetch', routes(next, async url => domainResponse(url, 'private-new-session', next)));
    await act(async () => { await checkSession(); });
    await screen.findByText('private-new-session');
    await act(async () => resolve(domainResponse(path, 'private-A', sessionA)));
    expect(screen.queryByText('private-A')).not.toBeInTheDocument();
    expect(screen.getByText('private-new-session')).toBeInTheDocument();
  });

it('logout cancels an in-flight protected request and ignores late private data', async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(r => { resolve = r; });
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', routes(sessionA, async (url, options) => {
    if (url === '/auth/logout') return authResponse({ logged_out: true });
    signal = options?.signal as AbortSignal; return pending;
  }));
  mount(); await screen.findByText('Memuat catatan kejadian…');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keluar' })));
  await screen.findByText(/Logout terkonfirmasi/);
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(domainResponse(path, 'private-after-logout')));
  expect(screen.queryByText('private-after-logout')).not.toBeInTheDocument();
});

it('cross-tab transition closes private UI, then revalidates without sharing credentials', async () => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount(); await screen.findByText('private-A');
  const other = new Channel();
  await act(async () => other.postMessage('transition'));
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
  vi.stubGlobal('fetch', routes(sessionB, async url => domainResponse(url, 'private-B', sessionB)));
  await act(async () => other.postMessage('settled'));
  await screen.findByText('private-B');
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
});

it.each(['missing', 'mismatch'])('fails closed on %s response metadata', async mode => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount(); await screen.findByText('private-A');
  vi.stubGlobal('fetch', routes(sessionA, async () => {
    const response = authResponse({ ...fixture.event, event_type: 'private-invalid' }, 200, sessionB);
    if (mode === 'missing') response.headers.delete('X-FWI-Auth-Context');
    return response;
  }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Muat ulang/ })));
  await screen.findByRole('heading', { name: 'Masuk ke FWI' });
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
  expect(screen.queryByText('private-invalid')).not.toBeInTheDocument();
});

it.each([401, 403])('session/permission denial HTTP %s closes all private state', async status => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount(); await screen.findByText('private-A');
  vi.stubGlobal('fetch', routes(sessionA, async () => authResponse({ detail: 'denied' }, status)));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Muat ulang/ })));
  await screen.findByRole('heading', { name: 'Masuk ke FWI' });
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
});

it('revalidates external cookie/session changes on focus and clears old visible data', async () => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount(); await screen.findByText('private-A');
  vi.stubGlobal('fetch', routes(sessionB, async url => domainResponse(url, 'private-B', sessionB)));
  await act(async () => fireEvent(window, new Event('blur')));
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
  await act(async () => fireEvent(window, new Event('focus')));
  await screen.findByText('private-B');
});

it('keeps registered intent unconfirmed, never POSTs during refresh-style recovery', async () => {
  sessionStorage.setItem(CAPTURE_JOURNAL_KEY, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  const fetcher = routes(sessionA, async url => domainResponse(url), [{
    intent_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', site_id: sessionA.sites[0].site_id,
    kind: 'event', state: 'registered', event_id: null, result_id: null, registered_at: '2026-11-07T12:00:00Z',
  }]);
  vi.stubGlobal('fetch', fetcher);
  render(<MemoryRouter initialEntries={['/backend-demo/capture']}><App /></MemoryRouter>);
  await screen.findByText(/UNCONFIRMED:/);
  expect(screen.getByRole('button', { name: 'Simpan kejadian' })).toBeDisabled();
  expect(fetcher.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
  expect(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
});

it('permission changes reset the page and do not expose writer controls to reader', async () => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  render(<MemoryRouter initialEntries={['/backend-demo/capture']}><App /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Simpan kejadian' });
  const reader = { ...sessionA, sites: [{ ...sessionA.sites[0], permissions: ['event.read','measurement.read'] }] };
  vi.stubGlobal('fetch', routes(reader, async url => domainResponse(url, 'reader', reader)));
  await act(async () => checkSession());
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Simpan kejadian' })).not.toBeInTheDocument());
  expect(authSnapshot().session?.sites[0].permissions).toEqual(['event.read','measurement.read']);
});

it('legacy unbound journals are blocked without displaying or deleting their private contents', async () => {
  const legacy = JSON.stringify({ operation: 'event', eventId: 'private-legacy-event', state: 'unknown' });
  sessionStorage.setItem(CAPTURE_JOURNAL_KEY, legacy);
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Journal lama belum terikat actor');
  expect(screen.queryByText('private-legacy-event')).not.toBeInTheDocument();
  expect(sessionStorage.getItem(CAPTURE_JOURNAL_KEY)).toBe(legacy);
});

it('site switching discards a delayed GET and never renders the previous site records', async () => {
  const siteB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const multi = { ...sessionA, sites: [...sessionA.sites, { site_id: siteB, permissions: ['event.read','measurement.read'] }] };
  await prepareSession(multi);
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(r => { resolve = r; });
  vi.stubGlobal('fetch', routes(multi, async () => pending));
  mount(); await screen.findByText('Memuat catatan kejadian…');
  vi.stubGlobal('fetch', routes(multi, async () => authResponse({ detail: 'Not found' }, 404, multi)));
  await act(async () => selectSite(siteB));
  await waitFor(() => expect(authSnapshot().site).toBe(siteB));
  await act(async () => resolve(domainResponse(path, 'private-old-site', multi)));
  expect(screen.queryByText('private-old-site')).not.toBeInTheDocument();
  expect(screen.queryByText('private-A')).not.toBeInTheDocument();
});

it('login bootstraps pre-auth CSRF, uses cookies and never persists credentials', async () => {
  invalidateAuth();
  let logged = false;
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/auth/preauth') return authResponse({ csrf_token: 'c'.repeat(64) });
    if (url === '/auth/login') { logged = true; return authResponse({ csrf_token: sessionA.csrf_token }); }
    if (url === '/auth/session') return logged ? authResponse(sessionA) : authResponse({}, 401);
    if (url === '/auth/intents') return authResponse([]);
    return domainResponse(url);
  });
  vi.stubGlobal('fetch', fetcher);
  mount();
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Akun sintetis'), 'site_a_writer');
  await user.type(screen.getByLabelText('Password'), 'synthetic-only-password');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
  await screen.findByLabelText('Lokasi dapur yang dapat diakses');
  const loginCall = vi.mocked(fetch).mock.calls.find(call => call[0] === '/auth/login')!;
  expect(loginCall[1]?.credentials).toBe('same-origin');
  expect((loginCall[1]?.headers as Record<string,string>)['X-CSRF-Token']).toBe('c'.repeat(64));
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
  expect(fetcher.mock.calls.filter(call => call[0] === '/auth/login')).toHaveLength(1);
});

it('delayed private intent body from an old actor cannot overwrite the new actor recovery view', async () => {
  vi.stubGlobal('fetch', routes(sessionA, async url => domainResponse(url)));
  mount(); await screen.findByText('private-A');
  let resolve!: (body: unknown) => void;
  const body = new Promise<unknown>(r => { resolve = r; });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ...authResponse(null), json: () => body })));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Periksa intent (GET saja)' })));
  vi.stubGlobal('fetch', routes(sessionB, async url => domainResponse(url, 'private-B', sessionB)));
  await act(async () => checkSession());
  await screen.findByText('private-B');
  await act(async () => resolve([{ intent_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    site_id: sessionA.sites[0].site_id, kind: 'event', state: 'committed',
    event_id: '99999999-9999-4999-8999-999999999999', result_id: '99999999-9999-4999-8999-999999999999', registered_at: '2026-11-07T12:00:00Z' }]));
  expect(document.querySelector('a[href*="99999999"]')).toBeNull();
  expect(authSnapshot().intents).toEqual([]);
});


it('accepts the actual combined P1/P2 session permissions including alert reads and acknowledgements', async () => {
  const combined = { ...sessionA, sites: sessionA.sites.map(site => ({ ...site,
    permissions: [...site.permissions, 'p1.create', 'trends.read', 'alert.read', 'alert.ack'] })) };
  vi.stubGlobal('fetch', routes(combined, async () => { throw new Error('no domain call expected'); }));
  await checkSession();
  expect(authSnapshot().phase).toBe('ready');
  expect(authSnapshot().session?.sites[0]?.permissions).toContain('alert.ack');
});
