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
// New demo routes (WP-01..WP-06). Queries are validated against per-route
// allowlists below; anything outside still fails closed.
const LEDGER_LIST = "/demo/v0.1/events";
const DATA_QUALITY = "/demo/v0.1/data-quality";
const MASTER_NAMESPACES = "/demo/v0.1/master/namespaces";
const MASTER_REFERENCES = "/demo/v0.1/master/references";
const MASTER_HISTORY = "/demo/v0.1/master/references/history";
const EVIDENCE = "/demo/v0.1/evidence";
const REVIEWS = "/demo/v0.1/reviews";
const EXPORT = "/demo/v0.1/export";
const QUERY_KEYS: Record<string, string[]> = {
  [LEDGER_LIST]: ["site_id", "event_type", "stage_code", "operation_date_from", "operation_date_to", "page", "page_size"],
  [DATA_QUALITY]: ["site_id", "stage_code", "operation_date_from", "operation_date_to"],
  [MASTER_REFERENCES]: ["namespace", "include_inactive"],
  [MASTER_HISTORY]: ["namespace", "code"],
  [EVIDENCE]: ["target_kind", "target_id"],
  [REVIEWS]: ["target_kind", "target_id"],
  [EXPORT]: ["site_id", "dataset", "event_type", "stage_code", "operation_date_from", "operation_date_to"],
};

// Provisional P1/P2 candidate routes; same dev-only allowlist discipline as above.
const DATE = "\\d{4}-\\d{2}-\\d{2}";
const LINEAGE_TYPE = "(?:waste_event|lot|batch|delivery|meal_service)";
const KPI_CODE = "[A-Z]{2}-[0-9]{2}";
const P1_GET = new RegExp(`^/p1/v0\\.1/(?:receipts/${UUID}|receipts/${UUID}/lots|lots/${UUID}` +
  `|recipes/${UUID}|batches/${UUID}|deliveries/${UUID}|services/${UUID}` +
  `|lineage/${LINEAGE_TYPE}/${UUID}|events/${UUID}/dispositions)$`);
const P1_GET_QUERY = new RegExp(`^/p1/v0\\.1/receipts\\?site_id=${UUID}$` +
  `|^/p1/v0\\.1/trends\\?site_id=${UUID}&date_from=${DATE}&date_to=${DATE}$`);
const P2_GET = new RegExp(`^/p2/v0\\.1/kpi$|^/p2/v0\\.1/kpi/${KPI_CODE}/preview` +
  `(?:\\?(?:numerator_basis=[a-z_]+&denominator_basis=[a-z_]+|numerator_basis=[a-z_]+|denominator_basis=[a-z_]+))?$` +
  `|^/p2/v0\\.1/cost-references/${UUID}(?:/valuation)?$` +
  `|^/p2/v0\\.1/recommendations/rules$` +
  `|^/p2/v0\\.1/recommendations\\?site_id=${UUID}$`);
const P1_POST = new RegExp(`^/p1/v0\\.1/(?:receipts|receipts/${UUID}/lots|lots/${UUID}/movements` +
  `|menus|recipes|batches|batches/${UUID}/io|runs|deliveries|deliveries/${UUID}/receiving` +
  `|services|links|dispositions)$`);
const P2_POST = new RegExp(`^/p2/v0\\.1/(?:cost-references` +
  `|recommendations/evaluate\\?site_id=${UUID}` +
  `|recommendations/${UUID}/acknowledge` +
  `|recommendations/rules/[a-z_]+/disable)$`);

export default defineConfig({
  // Development-only scoped boundary. NOT backend authentication/authorization.
  plugins: [react(), tailwindcss(), {
    name: "fwi-synthetic-demo-scoped-proxy",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/auth/') && !request.url?.startsWith("/demo/v0.1/") && !request.url?.startsWith("/p1/v0.1/") && !request.url?.startsWith("/p2/v0.1/")) { next(); return; }
        const [route, query = ""] = request.url.split("?");
        const isP1Get = P1_GET.test(request.url) || P1_GET_QUERY.test(request.url) || P2_GET.test(request.url);
        const isP1Post = P1_POST.test(request.url) || P2_POST.test(request.url);
        const isEvent = EVENT.test(route);
        const isHistory = MEASUREMENTS.test(route);
        const scopedGet = [LEDGER_LIST, DATA_QUALITY, MASTER_NAMESPACES, MASTER_REFERENCES, MASTER_HISTORY, EVIDENCE, REVIEWS, EXPORT];
        const scopedPost = [EVIDENCE, REVIEWS];
        const method = request.method;
        const allowed = method === "GET" ? (isP1Get || isEvent || isHistory || ['/auth/preauth','/auth/session','/auth/intents', ...scopedGet].includes(route))
          : method === "POST" ? (isP1Post || route === EVENT_CREATE || isHistory || ['/auth/login','/auth/logout','/auth/intents', ...scopedPost].includes(route)) : false;
        if (!allowed) {
          response.statusCode = method === "GET" || method === "POST" ? 404 : 405;
          response.end("Synthetic demo route/method not allowed."); return;
        }
        // Scoped routes accept only their explicit query keys; unknown queries fail closed.
        if (query && QUERY_KEYS[route]) {
          const keys = [...new URLSearchParams(query).keys()];
          if (keys.some(key => !QUERY_KEYS[route]!.includes(key))) {
            response.statusCode = 404; response.end("Unsupported demo query."); return;
          }
        } else if (query && !isP1Get && !isP1Post) {
          response.statusCode = 404; response.end("Query strings are not allowed on this route."); return;
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
      "^/(?:auth/(?:preauth|session|login|logout|intents)|demo/v0\\.1/(?:events(?:/[0-9a-fA-F-]+(?:/measurements)?)?|data-quality|master/(?:namespaces|references(?:/history)?)|evidence|reviews|export)(?:\\?.*)?|p[12]/v0\\.1(?:/[a-zA-Z0-9_-]+)*(?:\\?.*)?)$": {
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
