/** Cookie secrets stay HttpOnly. Only CSRF and non-authorizing context live in memory. */
import { isUUID } from './contract';

export type Identity = { principal_id: string; auth_context_id: string };
export type Session = Identity & { csrf_token: string; sites: { site_id: string; permissions: string[] }[] };
export type Intent = { intent_id: string; site_id: string; kind: 'event' | 'measurement';
  event_id: string | null; result_id: string | null; state: 'registered' | 'committed'; registered_at: string };
type State = { phase: 'checking' | 'anonymous' | 'ready' | 'blocked'; session: Session | null;
  site: string; generation: number; message: string; intents: Intent[] | null };
export class AuthFailure extends Error {
  constructor(public status: number, message = 'Konteks autentikasi tidak valid; data privat ditutup.') { super(message); }
}
export const AUTH_ORIGIN = 'https://127.0.0.1:5173';
let state: State = { phase: 'checking', session: null, site: '', generation: 0, message: '', intents: null };
const listeners = new Set<() => void>();
const active = new Set<AbortController>();
let channel: BroadcastChannel | null = null;
export const authSnapshot = () => state;
export function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: State) { state = next; listeners.forEach(fn => fn()); }
export function invalidateAuth(message = 'Periksa sesi sebelum membuka data privat.', phase: State['phase'] = 'anonymous') {
  active.forEach(c => c.abort()); active.clear();
  publish({ phase, session: null, site: '', generation: state.generation + 1, message, intents: null });
}
function identity(response: Response): Identity {
  const principal_id = response.headers.get('X-FWI-Principal') ?? '';
  const auth_context_id = response.headers.get('X-FWI-Auth-Context') ?? '';
  if (!isUUID(principal_id) || !isUUID(auth_context_id)) throw new AuthFailure(401);
  return { principal_id, auth_context_id };
}
function same(a: Identity, b: Identity) { return a.principal_id === b.principal_id && a.auth_context_id === b.auth_context_id; }
export function parseSession(raw: unknown, response: Response): Session {
  const value = raw as Session;
  const owner = identity(response);
  if (!value || !same(value, owner) || !/^[a-f0-9]{64}$/.test(value.csrf_token) || !Array.isArray(value.sites) ||
      value.sites.some(s => !s || !isUUID(s.site_id) || !Array.isArray(s.permissions) ||
        s.permissions.some(p => !['event.create','event.read','measurement.create','measurement.read'].includes(p))))
    throw new AuthFailure(401);
  return value;
}
async function wire(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  if (window.location.origin !== AUTH_ORIGIN) throw new AuthFailure(403, 'Demo autentikasi memerlukan HTTPS pada 127.0.0.1:5173.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  active.add(controller);
  // Race as well as abort: late responses cannot re-enter after a fetch implementation ignores abort.
  let timer: ReturnType<typeof setTimeout>;
  const finish = () => { clearTimeout(timer!); active.delete(controller); signal?.removeEventListener('abort', cancel); };
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')); finish(); }, { once: true });
  });
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error('Batas waktu permintaan backend terlampaui.')); controller.abort(); }, 10000);
  });
  try {
    const response = await Promise.race([fetch(path, { ...options, signal: controller.signal, credentials: 'same-origin',
      redirect: 'error', cache: 'no-store' }), timeout, aborted]);
    return { status: response.status, ok: response.ok, headers: response.headers,
      json: () => Promise.race([response.json(), timeout, aborted]).finally(finish) } as Response;
  } catch (error) { finish(); throw error; }
}
export async function checkSession(): Promise<void> {
  if (typeof BroadcastChannel === 'undefined') { invalidateAuth('Koordinasi tab tidak tersedia.', 'blocked'); return; }
  const expectedGeneration = state.generation;
  try {
    const response = await wire('/auth/session');
    if (!response.ok) throw new AuthFailure(response.status);
    const session = parseSession(await response.json(), response);
    if (state.generation !== expectedGeneration) return;
    const changed = state.session !== null && (!same(state.session, session) || JSON.stringify(state.session.sites) !== JSON.stringify(session.sites));
    if (changed) invalidateAuth('Sesi atau izin berubah. Data lama ditutup.', 'checking');
    const site = session.sites.some(s => s.site_id === state.site) ? state.site : session.sites[0]?.site_id ?? '';
    publish({ ...state, phase: 'ready', session, site, message: '' });
  } catch (error) {
    if (state.generation !== expectedGeneration) return;
    invalidateAuth(error instanceof AuthFailure && error.status === 401 ? 'Silakan masuk dengan akun sintetis.' :
      error instanceof AuthFailure ? error.message : 'Sesi tidak dapat diverifikasi. Data privat ditutup.',
      error instanceof AuthFailure && error.status === 401 ? 'anonymous' : 'blocked');
  }
}
export function selectSite(site: string) {
  if (!state.session?.sites.some(s => s.site_id === site)) throw new AuthFailure(403);
  active.forEach(c => c.abort());
  publish({ ...state, site, intents: null, generation: state.generation + 1 });
}
export function assertCurrent(expected: State) {
  if (state.phase !== 'ready' || !state.session || !expected.session || state.generation !== expected.generation ||
      !same(state.session, expected.session) || state.site !== expected.site) throw new AuthFailure(401);
}
export async function protectedJson(path: string, options: RequestInit = {}, signal?: AbortSignal) {
  const expected = state;
  assertCurrent(expected);
  try {
    const response = await wire(path, { ...options, headers: { ...options.headers,
      ...(options.method === 'POST' ? { 'X-CSRF-Token': expected.session!.csrf_token } : {}) } }, signal);
    assertCurrent(expected);
    if (response.status === 401) { invalidateAuth('Sesi berakhir atau dicabut.'); throw new AuthFailure(401); }
    if (!same(identity(response), expected.session!)) throw new AuthFailure(401);
    const value: unknown = await response.json();
    assertCurrent(expected);
    if (response.status === 403) { invalidateAuth('Akses ditolak; periksa sesi dan izin site.'); throw new AuthFailure(403); }
    return { response, value, context: expected };
  } catch (error) {
    if (error instanceof AuthFailure && state.generation === expected.generation) invalidateAuth(error.message);
    throw error;
  }
}
export function permits(permission: string) {
  return state.phase === 'ready' && !!state.session?.sites.find(s => s.site_id === state.site)?.permissions.includes(permission);
}
export async function login(username: string, password: string) {
  if (typeof BroadcastChannel === 'undefined') throw new AuthFailure(403, 'Koordinasi tab tidak tersedia.');
  invalidateAuth('', 'checking'); channel?.postMessage('transition');
  const generation = state.generation;
  try {
    const preauth = await wire('/auth/preauth');
    if (!preauth.ok) throw new AuthFailure(preauth.status);
    const bootstrap = await preauth.json() as { csrf_token: string };
    if (state.generation !== generation) throw new AuthFailure(401);
    if (!/^[a-f0-9]{64}$/.test(bootstrap.csrf_token)) throw new AuthFailure(401);
    const response = await wire('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-CSRF-Token': bootstrap.csrf_token }, body: JSON.stringify({ username, password }) });
    if (!response.ok) throw new AuthFailure(response.status, 'Login ditolak atau sementara dibatasi.');
    const issued = identity(response);
    await response.json();
    if (state.generation !== generation) throw new AuthFailure(401);
    const context = await wire('/auth/session');
    if (!context.ok) throw new AuthFailure(context.status);
    const session = parseSession(await context.json(), context);
    if (state.generation !== generation || !same(issued, session)) throw new AuthFailure(401);
    publish({ ...state, phase: 'ready', session, site: session.sites[0]?.site_id ?? '', message: '' });
  } catch (error) {
    if (state.generation === generation) invalidateAuth(error instanceof AuthFailure ? error.message :
      'Hasil login belum dapat dipastikan. Periksa sesi dengan GET; tidak ada retry otomatis.', 'blocked');
    throw error;
  } finally { channel?.postMessage('settled'); }
}
export async function logout() {
  const expected = state;
  if (!expected.session) return;
  invalidateAuth('', 'checking'); channel?.postMessage('transition');
  const generation = state.generation;
  try {
    const response = await wire('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-CSRF-Token': expected.session.csrf_token }, body: '{}' });
    if (response.status !== 200 || !same(identity(response), expected.session)) throw new AuthFailure(response.status);
    if (!(await response.json() as { logged_out?: boolean }).logged_out) throw new AuthFailure(401);
    if (state.generation === generation) invalidateAuth('Logout terkonfirmasi. Intent privat tetap tersimpan di server.');
  } catch {
    if (state.generation === generation) invalidateAuth('Logout belum terkonfirmasi. Data lokal ditutup; periksa sesi (GET).', 'blocked');
  } finally { channel?.postMessage('settled'); }
}
export function listenForAuthChanges() {
  if (typeof BroadcastChannel === 'undefined') {
    invalidateAuth('Koordinasi tab tidak tersedia; gunakan browser yang didukung.', 'blocked');
    return () => {};
  }
  channel = new BroadcastChannel('fwi-auth-context-v1');
  channel.onmessage = event => {
    if (event.data === 'transition') invalidateAuth('Perubahan sesi pada tab lain.', 'checking');
    if (event.data === 'settled') void checkSession();
  };
  const current = channel;
  return () => { current.close(); if (channel === current) channel = null; };
}
export async function readIntents(): Promise<Intent[]> {
  const { response, value, context } = await protectedJson('/auth/intents');
  if (!response.ok || !Array.isArray(value)) throw new Error('Intent privat belum dapat diverifikasi.');
  const records = value as Intent[];
  if (records.some(r => !r || !isUUID(r.intent_id) || !isUUID(r.site_id) ||
      !['event','measurement'].includes(r.kind) || !['registered','committed'].includes(r.state) ||
      (r.event_id !== null && !isUUID(r.event_id)) || (r.result_id !== null && !isUUID(r.result_id)))) throw new Error('Respons intent tidak valid.');
  const scoped = records.filter(r => r.site_id === state.site);
  assertCurrent(context);
  publish({ ...state, intents: scoped });
  return scoped;
}
