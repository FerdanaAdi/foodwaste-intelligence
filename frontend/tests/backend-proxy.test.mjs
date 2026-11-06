// Real loopback HTTP verification of the development proxy; no database writes.
import { strict as assert } from "node:assert";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createServer, loadConfigFromFile } from "vite";

test("development proxy allows only scoped GETs and strips credentials", async () => {
  const received = [];
  const backend = httpServer((req, res) => {
    received.push({ method: req.method, headers: req.headers, url: req.url });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ synthetic: true }));
  });
  let vite;
  try {
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" });
    assert.ok(loaded);
    const config = loaded.config;
    assert.equal(config.server.host, "127.0.0.1");
    const [context, proxy] = Object.entries(config.server.proxy)[0];
    assert.equal(proxy.target, "http://127.0.0.1:8000");
    // Only this test redirects the fixed loopback target to an ephemeral fake backend.
    vite = await createServer({ ...config, configFile: false,
      optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: {
      ...config.server, port: 0,
      proxy: { [context]: { ...proxy, target: `http://127.0.0.1:${backend.address().port}` } },
    } });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const path = "/demo/v0.1/events/33333333-3333-4333-8333-333333333333";
    for (const suffix of ["", "/measurements"]) {
      const response = await fetch(origin + path + suffix, { headers: { cookie: "synthetic=test", authorization: "synthetic-test-only" } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { synthetic: true });
    }
    for (const method of ["POST", "PATCH", "DELETE"]) {
      assert.equal((await fetch(origin + path, { method })).status, 405);
    }
    assert.equal((await fetch(origin + "/demo/v0.1/events")).status, 404);
    assert.equal((await fetch(origin + path + "/audit")).status, 404);
    assert.equal(received.length, 2);
    assert.ok(received.every(r => r.method === "GET" && !r.headers.cookie && !r.headers.authorization));
  } finally {
    if (vite) await vite.close();
    backend.closeAllConnections();
    await new Promise(resolve => backend.close(resolve));
  }
});
