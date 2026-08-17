import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "localhost",
    port: 5173,
    proxy: {
      '/api/jambase': {
        target: 'https://www.jambase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jambase/, '/jb-api/v1'),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@synth/shared": path.resolve(__dirname, "../../packages/synth-shared/src/index.ts"),
      "@synth/ai-scene-guides/quality": path.resolve(
        __dirname,
        "../../ai-scene-guides/src/pipeline/contextualSeed.ts",
      ),
      // Importer lives outside apps/admin, so resolve zod from this app's install.
      zod: path.resolve(__dirname, "node_modules/zod"),
    },
  },
});