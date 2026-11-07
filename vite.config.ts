import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    // Service worker com cache do app (HTML/JS/CSS/ícones) para abrir sem internet.
    // Mantém o nome /sw.js e o manifest.json existentes (a TWA da Play Store usa os dois).
    VitePWA({
      filename: "sw.js",
      manifest: false,
      injectRegister: false,
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,gif,json,woff2}"],
        globIgnores: ["agent-flow.png", "screenshot-playstore.png", "**/placeholder.svg"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/\.netlify\//, /^\/\.well-known\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Script do widget de chat: abre offline sem erro (o chat em si precisa de internet).
            urlPattern: /^https:\/\/cdn\.n8nchatui\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "chat-widget", expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
