import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const EVENT = new RegExp(`^/demo/v0\\.1/events/${UUID}$`);
const MEASUREMENTS = new RegExp(`^/demo/v0\\.1/events/${UUID}/measurements$`);
const EVENT_CREATE = "/demo/v0.1/events";

export default defineConfig({
  // Development-only scoped boundary. NOT backend authentication/authorization.
  plugins: [react(), tailwindcss(), {
    name: "fwi-synthetic-demo-scoped-proxy",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/demo/v0.1/")) { next(); return; }
        const route = request.url; // Query strings and encoded path variants deliberately fail the allowlist.
        const isEvent = EVENT.test(route);
        const isHistory = MEASUREMENTS.test(route);
        const method = request.method;
        const allowed = method === "GET" ? (isEvent || isHistory)
          : method === "POST" ? (route === EVENT_CREATE || isHistory) : false;
        if (!allowed) {
          response.statusCode = method === "GET" || method === "POST" ? 404 : 405;
          response.end("Synthetic demo route/method not allowed."); return;
        }
        // Only accept local dev host. These guards are not an authentication substitute.
        const host = request.headers.host || "";
        if (!/^127\.0\.0\.1(?::\d+)?$/.test(host)) {
          response.statusCode = 403; response.end("Development loopback only."); return;
        }
        if (method === "POST") {
          const origin = request.headers.origin;
          if (origin && origin !== `http://${host}`) {
            response.statusCode = 403; response.end("Cross-origin write denied."); return;
          }
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] || "")) {
            response.statusCode = 415; response.end("POST requires application/json."); return;
          }
        }
        next();
      });
    },
  }],
  server: {
    cors: false, // Same-origin proxy only; do not let Vite auto-approve preflight.
    host: "127.0.0.1",
    strictPort: true,
    proxy: {
      "^/demo/v0\\.1/events(?:/[0-9a-fA-F-]+(?:/measurements)?)?$": {
        target: process.env.FWI_LOCAL_SYNTHETIC_DEMO === "1" ? "http://127.0.0.1:18000" : "http://127.0.0.1:8000",
        configure(proxy) {
          proxy.on("proxyReq", request => {
            request.removeHeader("cookie");
            request.removeHeader("authorization");
            request.removeHeader("proxy-authorization");
          });
        },
      },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
