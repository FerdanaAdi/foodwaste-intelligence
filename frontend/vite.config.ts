import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  // Development-only read boundary. Backend authorization remains out of scope.
  plugins: [react(), tailwindcss(), {
    name: "fwi-read-only-demo-proxy",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/demo/v0.1/")) { next(); return; }
        const allowed = /^\/demo\/v0\.1\/events\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?:\/measurements)?$/.test(request.url);
        if (request.method !== "GET" || !allowed) {
          response.statusCode = request.method !== "GET" ? 405 : 404;
          response.end("Read-only demo proxy: GET event UUID or its measurements only.");
          return;
        }
        next();
      });
    },
  }],
  server: {
    host: "127.0.0.1",
    strictPort: true,
    proxy: {
      "^/demo/v0\\.1/events/[0-9a-fA-F-]+(?:/measurements)?$": {
        target: "http://127.0.0.1:8000",
        configure(proxy) {
          proxy.on("proxyReq", (request, incoming) => {
            if (incoming.method !== "GET") { request.destroy(); return; }
            request.removeHeader("cookie");
            request.removeHeader("authorization");
          });
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
