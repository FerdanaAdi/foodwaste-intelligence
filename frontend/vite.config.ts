import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';

const approvedOrigin = 'https://127.0.0.1:5173';
const tlsPaths = [process.env.FWI_TLS_CERTFILE, process.env.FWI_TLS_KEYFILE, process.env.FWI_BACKEND_CA_FILE];
const tlsReady = tlsPaths.every(Boolean);
const https = tlsReady ? { cert: readFileSync(tlsPaths[0]!), key: readFileSync(tlsPaths[1]!) } : undefined;

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
        if (!request.url?.startsWith('/auth/') && !request.url?.startsWith("/demo/v0.1/")) { next(); return; }
        const route = request.url; // Query strings and encoded path variants deliberately fail the allowlist.
        const isEvent = EVENT.test(route);
        const isHistory = MEASUREMENTS.test(route);
        const method = request.method;
        const allowed = method === "GET" ? (isEvent || isHistory || ['/auth/preauth','/auth/session','/auth/intents'].includes(route))
          : method === "POST" ? (route === EVENT_CREATE || isHistory || ['/auth/login','/auth/logout','/auth/intents'].includes(route)) : false;
        if (!allowed) {
          response.statusCode = method === "GET" || method === "POST" ? 404 : 405;
          response.end("Synthetic demo route/method not allowed."); return;
        }
        // Only accept local dev host. These guards are not an authentication substitute.
        // HTTPS browsers negotiate HTTP/2, whose authority replaces Host.
        // Reject absence, disagreement and every non-exact authority.
        const authorities = [request.headers.host, request.headers[':authority']].filter(v => v !== undefined);
        if (!authorities.length || authorities.some(v => v !== '127.0.0.1:5173')) {
          response.statusCode = 403; response.end("Development loopback only."); return;
        }
        if (request.headers.origin !== undefined && request.headers.origin !== approvedOrigin) {
          response.statusCode = 403; response.end('Unapproved origin.'); return;
        }
        if (method === "POST") {
          const origin = request.headers.origin;
          if (origin !== approvedOrigin) {
            response.statusCode = 403; response.end("Cross-origin write denied."); return;
          }
          if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] || "")) {
            response.statusCode = 415; response.end("POST requires application/json."); return;
          }
        }
        if (!tlsReady || !request.socket.encrypted) {
          response.statusCode = 503; response.end('Approved HTTPS certificate configuration required.'); return;
        }
        next();
      });
    },
  }],
  server: {
    cors: false, // Same-origin proxy only; do not let Vite auto-approve preflight.
    host: "127.0.0.1",
    port: 5173,
    https,
    strictPort: true,
    proxy: {
      "^/(?:auth/(?:preauth|session|login|logout|intents)|demo/v0\\.1/events(?:/[0-9a-fA-F-]+(?:/measurements)?)?)$": {
        target: 'https://127.0.0.1:8000',
        secure: true,
        agent: tlsReady ? new Agent({ ca: readFileSync(tlsPaths[2]!), rejectUnauthorized: true }) : undefined,
        configure(proxy) {
          proxy.on("proxyReq", request => {
            const cookies = String(request.getHeader('cookie') ?? '').split(';').map(v => v.trim())
              .filter(v => /^__Host-fwi-(?:session|preauth)=/.test(v));
            if (cookies.length) request.setHeader('cookie', cookies.join('; ')); else request.removeHeader('cookie');
            request.removeHeader("authorization");
            request.removeHeader("proxy-authorization");
            for (const name of ['forwarded','x-forwarded-for','x-forwarded-proto','x-forwarded-host','x-real-ip']) request.removeHeader(name);
          });
        },
      },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
