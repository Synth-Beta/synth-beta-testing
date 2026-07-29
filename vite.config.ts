import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const ticketmasterProxyTarget = env.VITE_TICKETMASTER_PROXY_TARGET || 'http://localhost:3001';
  const isProduction = mode === 'production';

  // Use '/' for web so script URLs are absolute (fixes MIME error after OAuth redirect to /auth/spotify/callback).
  // For Capacitor, set VITE_APP_BASE=./ when building the native app if you need relative paths.
  const base = env.VITE_APP_BASE ?? '/';
  return {
    base,
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
      // Only upload source maps in production builds where an auth token is present
      // (keeps local/dev builds token-free and avoids failing CI builds without one).
      isProduction && env.SENTRY_AUTH_TOKEN && sentryVitePlugin({
        org: "synth-vc",
        project: "synth-web",
        authToken: env.SENTRY_AUTH_TOKEN,
        sourcemaps: {
          filesToDeleteAfterUpload: ['**/*.map'],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@src": path.resolve(__dirname, "./src"),
        "@synth/shared": path.resolve(__dirname, "./packages/synth-shared/src/index.ts"),
      },
    },
    build: {
      // Optimize for mobile
      target: 'es2015',
      cssCodeSplit: true,
      // SECURITY: 'hidden' generates maps for Sentry to upload/deobfuscate stack traces,
      // but the bundle never references them and they're deleted from dist/ after upload
      // (see sentryVitePlugin below) — so users still can't read original source code.
      sourcemap: 'hidden',
      minify: 'esbuild',
      // SECURITY: Remove debugger statements in production.
      // console.log/debug/info/trace are marked "pure" so esbuild's minifier drops them
      // (their return value is always unused) — console.error/warn are left untouched
      // so production error logging keeps working.
      esbuild: {
        drop: isProduction ? ['debugger'] : [],
        pure: isProduction ? ['console.log', 'console.debug', 'console.info', 'console.trace'] : [],
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/@tanstack/react-query/')
            ) return 'vendor-react';
            if (id.includes('/@supabase/')) return 'vendor-supabase';
            if (
              id.includes('/@radix-ui/') ||
              id.includes('/class-variance-authority/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/') ||
              id.includes('/cmdk/')
            ) return 'vendor-ui';
            if (id.includes('/recharts/')) return 'vendor-charts';
            if (
              id.includes('/leaflet/') ||
              id.includes('/react-leaflet/') ||
              id.includes('/ngeohash/')
            ) return 'vendor-maps';
            if (
              id.includes('/date-fns/') ||
              id.includes('/uuid/') ||
              id.includes('/zod/') ||
              id.includes('/sonner/') ||
              id.includes('/embla-carousel') ||
              id.includes('/canvas-confetti/') ||
              id.includes('/react-joyride/')
            ) return 'vendor-misc';
          },
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
