// Real loopback HTTP verification of scoped synthetic GET/POST development proxy.
import { strict as assert } from "node:assert";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

test("W-25: only the exact scoped routes and methods forward, and secrets are stripped", async () => {
  const received = [];
  const backend = httpServer((req, res) => {
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
    assert.equal(proxy.target, "http://127.0.0.1:8000");
    vite = await createServer({ ...config, configFile: false,
      optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: {
        ...config.server, port,
        proxy: { [context]: { ...proxy, target: `http://127.0.0.1:${backend.address().port}` } },
      } });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const path = "/demo/v0.1/events/33333333-3333-4333-8333-333333333333";
    const jsonHeaders = { "Content-Type": "application/json", cookie: "synthetic=test", authorization: "synthetic-test-only", "proxy-authorization": "synthetic-proxy-only", origin };
    for (const suffix of ["", "/measurements"]) {
      const response = await fetch(origin + path + suffix, { headers: jsonHeaders });
      assert.equal(response.status, 200);
    }
    for (const url of ["/demo/v0.1/events", `${path}/measurements`]) {
      const response = await fetch(origin + url, { method: "POST", headers: jsonHeaders, body: "{}" });
      assert.equal(response.status, 200);
    }
    for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
      assert.equal((await fetch(origin + path, { method })).status, 405);
    }
    assert.equal((await fetch(origin + "/demo/v0.1/events")).status, 404);
    assert.equal((await fetch(origin + path + "/audit")).status, 404);
    assert.equal((await fetch(origin + "/demo/v0.1/events/bad/measurements", { method: "POST", headers: jsonHeaders, body: "{}" })).status, 404);
    assert.equal((await fetch(origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 404);
    assert.equal((await fetch(origin + "/demo/v0.1/events", { method: "POST", body: "{}" })).status, 415);
    assert.equal((await fetch(origin + "/demo/v0.1/events", { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: "{}" })).status, 403);
    assert.equal(received.length, 4);
    assert.ok(received.every(r => !r.headers.cookie && !r.headers.authorization && !r.headers["proxy-authorization"]));
    assert.deepEqual(received.map(r => r.method), ["GET", "GET", "POST", "POST"]);
  } finally {
    if (vite) await vite.close();
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});
