import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";
// import { preserveErrorLogs } from "./vite-plugin-preserve-error-logs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ticketmasterProxyTarget = env.VITE_TICKETMASTER_PROXY_TARGET || 'http://localhost:3001';
  const isProduction = mode === 'production';

  return {
    base: './', // Use relative paths for Capacitor
    server: {
      host: "localhost",
      port: 5174,
      // Reduce memory usage in dev mode
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      },
      proxy: {
        // REMOVED: /api/jambase proxy - frontend no longer has direct Jambase API access
        // All Jambase data now comes from backend sync service
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
      // SECURITY: Remove console logs in production while preserving console.error
      // This allows production error logging while removing debug logs
      // ...(isProduction ? [preserveErrorLogs()] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@src": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Optimize for mobile
      target: 'es2015',
      cssCodeSplit: true,
      // SECURITY: Source maps disabled to prevent users from reading original source code
      sourcemap: false,
      minify: 'esbuild',
      // SECURITY: Remove debugger statements in production
      // Console logs are removed via preserveErrorLogs plugin (preserves console.error)
      esbuild: {
        drop: isProduction ? ['debugger'] : [],
      },
      rollupOptions: {
        output: {
          manualChunks: undefined, // Let Vite handle chunking
        },
        // Note: Capacitor plugins must be bundled normally
        // They contain JavaScript code that needs to be included in the bundle
        // The native bridge is handled separately by Capacitor's native runtime
      },
      // Reduce memory usage during build
      chunkSizeWarningLimit: 1000,
    },
    // Optimize dev server memory usage
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: [],
      // Force re-optimization to avoid hanging
      force: false,
    },
  };
});
