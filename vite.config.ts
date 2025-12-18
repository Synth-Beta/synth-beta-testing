import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ticketmasterProxyTarget = env.VITE_TICKETMASTER_PROXY_TARGET || 'http://localhost:3001';

  return {
    base: './', // Use relative paths for Capacitor
    server: {
      host: "localhost",
      port: 5174,
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
        },
        '/api/ticketmaster': {
          target: ticketmasterProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[ticketmaster proxy] error', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('[ticketmaster proxy] forwarding:', req.method, req.url, '→', ticketmasterProxyTarget);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('[ticketmaster proxy] response:', proxyRes.statusCode, req.url);
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
      },
    },
    build: {
      // Optimize for mobile
      target: 'es2015',
      cssCodeSplit: true,
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: undefined, // Let Vite handle chunking
        },
      },
    },
  };
});
