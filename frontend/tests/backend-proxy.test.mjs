// Authenticated proxy contract; real TLS test requires Owner-authorized existing files.
import { strict as assert } from "node:assert";
import { createServer as httpServer } from "node:http";
import { createServer as httpsServer, request as httpsRequest, Agent } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { once } from "node:events";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

const tlsFiles = [process.env.FWI_TLS_CERTFILE, process.env.FWI_TLS_KEYFILE, process.env.FWI_BACKEND_CA_FILE];
const tlsReady = tlsFiles.every(p => p && existsSync(p));
test("W-25: only the exact scoped routes and methods forward, and unrelated secrets are stripped", { skip: !tlsReady && 'BLOCKED: approved TLS files unavailable' }, async () => {
  const received = [];
  const backend = httpsServer({ cert: readFileSync(tlsFiles[0]), key: readFileSync(tlsFiles[1]) }, (req, res) => {
    received.push({ method: req.method, headers: req.headers, url: req.url });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ synthetic: true }));
  });
  let vite;
  try {
    // Vite treats port 0 as its default port; reserve a concrete free port instead.
    const probe = httpServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" });
    assert.ok(loaded);
    const config = loaded.config;
    assert.equal(config.server.host, "127.0.0.1");
    const [context, proxy] = Object.entries(config.server.proxy)[0];
    assert.equal(proxy.target, "https://127.0.0.1:8000");
    assert.equal(proxy.secure, true);
    vite = await createServer({ ...config, configFile: false,
      optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: {
        ...config.server, port,
        proxy: { [context]: { ...proxy, target: `https://127.0.0.1:${backend.address().port}` } },
      } });
    await vite.listen();
    const origin = `https://127.0.0.1:${vite.httpServer.address().port}`;
    const agent = new Agent({ ca: readFileSync(tlsFiles[2]), rejectUnauthorized: true });
    const fetch = (url, options = {}) => new Promise((resolve, reject) => {
      const request = httpsRequest(url, { method: options.method ?? 'GET', agent,
        headers: { host: '127.0.0.1:5173', ...options.headers } }, response => {
          response.resume(); response.on('end', () => resolve({ status: response.statusCode }));
        });
      request.on('error', reject); request.end(options.body);
    });
    const path = "/demo/v0.1/events/33333333-3333-4333-8333-333333333333";
    const jsonHeaders = { "Content-Type": "application/json", cookie: "__Host-fwi-session=synthetic-test-only; unrelated=strip-me", authorization: "synthetic-test-only", "proxy-authorization": "synthetic-proxy-only", origin: 'https://127.0.0.1:5173' };
    for (const suffix of ["", "/measurements"]) {
      const response = await fetch(origin + path + suffix, { headers: jsonHeaders });
      assert.equal(response.status, 200);
    }
    for (const url of ["/demo/v0.1/events", `${path}/measurements`]) {
      const response = await fetch(origin + url, { method: "POST", headers: jsonHeaders, body: "{}" });
      assert.equal(response.status, 200);
    }
    // P0 integration adds explicit list/read and metadata/proposal routes.
    // This backend is a proxy recorder; API validation/authorization stays server-side.
    const site = "22222222-2222-4222-8222-222222222222";
    const target = "33333333-3333-4333-8333-333333333333";
    const addedReads = [
      `/demo/v0.1/events?site_id=${site}&page=1&page_size=20`,
      `/demo/v0.1/data-quality?site_id=${site}`,
      "/demo/v0.1/master/namespaces",
      "/demo/v0.1/master/references?namespace=stage&include_inactive=true",
      "/demo/v0.1/master/references/history?namespace=stage&code=synthetic",
      `/demo/v0.1/evidence?target_kind=event&target_id=${target}`,
      `/demo/v0.1/reviews?target_kind=event&target_id=${target}`,
      `/demo/v0.1/export?site_id=${site}&dataset=events`,
    ];
    for (const url of addedReads) assert.equal((await fetch(origin + url, { headers: jsonHeaders })).status, 200);
    for (const url of ["/demo/v0.1/evidence", "/demo/v0.1/reviews"]) {
      assert.equal((await fetch(origin + url, { method: "POST", headers: jsonHeaders, body: "{}" })).status, 200);
    }
    // New read routes do not grant arbitrary query keys or master/export writes.
    for (const url of ["/demo/v0.1/events?unexpected=1", "/demo/v0.1/export?unexpected=1",
      "/demo/v0.1/evidence?site_id=unapproved", "/demo/v0.1/reviews?unexpected=1"]) {
      assert.equal((await fetch(origin + url, { headers: jsonHeaders })).status, 404);
    }
    for (const url of ["/demo/v0.1/master/references", "/demo/v0.1/export"]) {
      assert.equal((await fetch(origin + url, { method: "POST", headers: jsonHeaders, body: "{}" })).status, 404);
    }
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.equal((await fetch(origin + path, { method })).status, 405);
    }
    assert.equal((await fetch(origin + "/demo/v0.1/events?unexpected=1")).status, 404);
    assert.equal((await fetch(origin + path + "/audit")).status, 404);
    assert.equal((await fetch(origin + "/demo/v0.1/events/bad/measurements", { method: "POST", headers: jsonHeaders, body: "{}" })).status, 404);
    assert.equal((await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 404);
    assert.equal((await fetch(origin + "/demo/v0.1/events", { method: "POST", headers: { origin: 'https://127.0.0.1:5173' }, body: "{}" })).status, 415);
    assert.equal((await fetch(origin + "/demo/v0.1/events", { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: "{}" })).status, 403);
    assert.equal(received.length, 4 + addedReads.length + 2);
    assert.ok(received.every(r => (!r.headers.cookie || r.headers.cookie === '__Host-fwi-session=synthetic-test-only') && !r.headers.authorization && !r.headers["proxy-authorization"]));
    assert.deepEqual(received.map(r => r.method), ["GET", "GET", "POST", "POST", ...addedReads.map(() => "GET"), "POST", "POST"]);
  } finally {
    if (vite) await vite.close();
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});

test('no TLS configuration or cleartext socket can forward a protected operation', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
  const handlers = [];
  for (const plugin of loaded.config.plugins) {
    if (plugin?.name === 'fwi-synthetic-demo-scoped-proxy') plugin.configureServer({ middlewares: { use: fn => handlers.push(fn) } });
  }
  const probe = (url, method='GET', headers={}) => {
    let status, forwarded = false;
    handlers[0]({ url, method, socket: { encrypted: false }, headers: { host: '127.0.0.1:5173', ...headers } },
      { set statusCode(value) { status = value; }, end() {} }, () => { forwarded = true; });
    assert.equal(forwarded, false);
    return status;
  };
  assert.equal(probe('/auth/session'), 503);
  assert.equal(probe('/auth/login', 'POST', { origin: 'https://127.0.0.1:5173', 'content-type': 'application/json' }), 503);
  assert.equal(probe('/demo/v0.1/events', 'POST', { origin: 'https://evil.invalid', 'content-type': 'application/json' }), 403);
  assert.equal(probe('/auth/session?extra=1'), 404);
  assert.equal(probe('/auth/logout', 'DELETE'), 405);
  assert.equal(probe('/auth/session', 'GET', { host: undefined, ':authority': '127.0.0.1:5173' }), 503);
  assert.equal(probe('/auth/session', 'GET', { ':authority': 'foreign.invalid' }), 403);
  assert.equal(probe('/auth/session', 'GET', { host: undefined }), 403);
});

test('proxy forwards only FWI cookies and removes credential/peer spoofing headers', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
  const proxy = Object.values(loaded.config.server.proxy)[0];
  let callback;
  proxy.configure({ on: (name, fn) => { if (name === 'proxyReq') callback = fn; } });
  const headers = new Map(Object.entries({ cookie: '__Host-fwi-session=opaque; unrelated=private; __Host-fwi-preauth=opaque-preauth',
    authorization: 'strip', 'proxy-authorization': 'strip', 'x-forwarded-for': 'strip', 'forwarded': 'strip',
    'x-csrf-token': 'synthetic-csrf', 'x-fwi-intent': 'synthetic-intent' }));
  callback({ getHeader: name => headers.get(name), setHeader: (name, value) => headers.set(name, value), removeHeader: name => headers.delete(name) });
  assert.equal(headers.get('cookie'), '__Host-fwi-session=opaque; __Host-fwi-preauth=opaque-preauth');
  assert.equal(headers.get('x-csrf-token'), 'synthetic-csrf');
  assert.equal(headers.get('x-fwi-intent'), 'synthetic-intent');
  assert.equal(headers.has('authorization') || headers.has('proxy-authorization') || headers.has('x-forwarded-for') || headers.has('forwarded'), false);
  assert.equal(proxy.target, 'https://127.0.0.1:8000');
  assert.equal(proxy.secure, true);
});


test('combined P0/P1/P2 allowlists preserve TLS, query and method boundaries', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
  let handler;
  for (const plugin of loaded.config.plugins) {
    if (plugin?.name === 'fwi-synthetic-demo-scoped-proxy')
      plugin.configureServer({ middlewares: { use: fn => { handler = fn; } } });
  }
  const key = Object.keys(loaded.config.server.proxy)[0];
  const probe = (url, method='GET') => {
    let status, forwarded = false;
    handler({ url, method, socket: { encrypted: false }, headers: {
      host: '127.0.0.1:5173', origin: 'https://127.0.0.1:5173', 'content-type': 'application/json' } },
      { set statusCode(value) { status = value; }, end() {} }, () => { forwarded = true; });
    assert.equal(forwarded, false);
    return status;
  };
  const site = '22222222-2222-4222-8222-222222222222';
  for (const path of [`/p1/v0.1/trends?site_id=${site}&date_from=2026-11-01&date_to=2026-11-09`,
    `/p1/v0.1/receipts?site_id=${site}`, '/p2/v0.1/recommendations/rules', '/p2/v0.1/kpi',
    `/demo/v0.1/events?site_id=${site}`]) {
    assert.equal(new RegExp(key).test(path), true);
    assert.equal(probe(path), 503); // allowed route still cannot bypass TLS
  }
  assert.equal(probe('/p1/v0.1/receipts', 'POST'), 503);
  assert.equal(probe('/p1/v0.1/receipts?unexpected=1'), 404);
  assert.equal(probe('/p2/v0.1/recommendations/rules?unexpected=1'), 404);
  assert.equal(probe('/p1/v0.1/receipts', 'DELETE'), 405);
});
