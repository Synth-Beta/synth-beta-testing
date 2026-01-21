// vite.config.ts
import { defineConfig, loadEnv } from "file:///Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/node_modules/vite/dist/node/index.js";
import react from "file:///Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";

// vite-plugin-preserve-error-logs.ts
import { parse } from "file:///Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/node_modules/@babel/parser/lib/index.js";
import generate from "file:///Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/node_modules/@babel/generator/lib/index.js";
import _traverse from "file:///Users/sloiterstein/Desktop/Synth/synth-beta-testing-main/node_modules/@babel/traverse/lib/index.js";
var traverse = _traverse.default || _traverse;
function preserveErrorLogs() {
  return {
    name: "preserve-error-logs",
    enforce: "post",
    apply: "build",
    transform(code, id) {
      if (!id.includes("src") || id.includes("node_modules") || !id.match(/\.(js|ts|jsx|tsx)$/)) {
        return null;
      }
      try {
        const ast = parse(code, {
          sourceType: "module",
          plugins: [
            "typescript",
            "jsx",
            "decorators-legacy",
            "classProperties",
            "objectRestSpread",
            "asyncGenerators",
            "functionBind",
            "exportDefaultFrom",
            "exportNamespaceFrom",
            "dynamicImport",
            "nullishCoalescingOperator",
            "optionalChaining"
          ]
        });
        let hasChanges = false;
        const traverseFn = traverse.default || traverse;
        traverseFn(ast, {
          CallExpression(path2) {
            const { node } = path2;
            if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && node.callee.object.name === "console" && node.callee.property.type === "Identifier") {
              const methodName = node.callee.property.name;
              if (["log", "warn", "info", "debug", "trace"].includes(methodName)) {
                path2.replaceWith({
                  type: "ExpressionStatement",
                  expression: {
                    type: "UnaryExpression",
                    operator: "void",
                    prefix: true,
                    argument: {
                      type: "NumericLiteral",
                      value: 0
                    }
                  }
                });
                hasChanges = true;
              }
            }
          }
        });
        if (hasChanges) {
          const generateFn = generate.default || generate;
          const output = generateFn(ast, {
            retainLines: false,
            compact: false
          }, code);
          return {
            code: output.code,
            map: output.map
          };
        }
        return null;
      } catch (error) {
        console.warn(`[preserve-error-logs] Failed to transform ${id}:`, error);
        return null;
      }
    }
  };
}

// vite.config.ts
var __vite_injected_original_dirname = "/Users/sloiterstein/Desktop/Synth/synth-beta-testing-main";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ticketmasterProxyTarget = env.VITE_TICKETMASTER_PROXY_TARGET || "http://localhost:3001";
  const isProduction = mode === "production";
  return {
    base: "./",
    // Use relative paths for Capacitor
    server: {
      host: "localhost",
      port: 5174,
      proxy: {
        // REMOVED: /api/jambase proxy - frontend no longer has direct Jambase API access
        // All Jambase data now comes from backend sync service
        "/api/ticketmaster": {
          target: ticketmasterProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, _res) => {
              console.log("[ticketmaster proxy] error", err);
            });
            proxy.on("proxyReq", (proxyReq, req, _res) => {
              console.log("[ticketmaster proxy] forwarding:", req.method, req.url, "\u2192", ticketmasterProxyTarget);
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              console.log("[ticketmaster proxy] response:", proxyRes.statusCode, req.url);
            });
          }
        }
      }
    },
    plugins: [
      react(),
      // SECURITY: Remove console logs in production while preserving console.error
      // This allows production error logging while removing debug logs
      ...isProduction ? [preserveErrorLogs()] : []
    ],
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    build: {
      // Optimize for mobile
      target: "es2015",
      cssCodeSplit: true,
      // SECURITY: Source maps disabled to prevent users from reading original source code
      sourcemap: false,
      minify: "esbuild",
      // SECURITY: Remove debugger statements in production
      // Console logs are removed via preserveErrorLogs plugin (preserves console.error)
      esbuild: {
        drop: isProduction ? ["debugger"] : []
      },
      rollupOptions: {
        output: {
          manualChunks: void 0
          // Let Vite handle chunking
        }
        // Note: Capacitor plugins must be bundled normally
        // They contain JavaScript code that needs to be included in the bundle
        // The native bridge is handled separately by Capacitor's native runtime
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAidml0ZS1wbHVnaW4tcHJlc2VydmUtZXJyb3ItbG9ncy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zbG9pdGVyc3RlaW4vRGVza3RvcC9TeW50aC9zeW50aC1iZXRhLXRlc3RpbmctbWFpblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3Nsb2l0ZXJzdGVpbi9EZXNrdG9wL1N5bnRoL3N5bnRoLWJldGEtdGVzdGluZy1tYWluL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9zbG9pdGVyc3RlaW4vRGVza3RvcC9TeW50aC9zeW50aC1iZXRhLXRlc3RpbmctbWFpbi92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgbG9hZEVudiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHByZXNlcnZlRXJyb3JMb2dzIH0gZnJvbSBcIi4vdml0ZS1wbHVnaW4tcHJlc2VydmUtZXJyb3ItbG9nc1wiO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcbiAgY29uc3QgdGlja2V0bWFzdGVyUHJveHlUYXJnZXQgPSBlbnYuVklURV9USUNLRVRNQVNURVJfUFJPWFlfVEFSR0VUIHx8ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnO1xuICBjb25zdCBpc1Byb2R1Y3Rpb24gPSBtb2RlID09PSAncHJvZHVjdGlvbic7XG5cbiAgcmV0dXJuIHtcbiAgICBiYXNlOiAnLi8nLCAvLyBVc2UgcmVsYXRpdmUgcGF0aHMgZm9yIENhcGFjaXRvclxuICAgIHNlcnZlcjoge1xuICAgICAgaG9zdDogXCJsb2NhbGhvc3RcIixcbiAgICAgIHBvcnQ6IDUxNzQsXG4gICAgICBwcm94eToge1xuICAgICAgICAvLyBSRU1PVkVEOiAvYXBpL2phbWJhc2UgcHJveHkgLSBmcm9udGVuZCBubyBsb25nZXIgaGFzIGRpcmVjdCBKYW1iYXNlIEFQSSBhY2Nlc3NcbiAgICAgICAgLy8gQWxsIEphbWJhc2UgZGF0YSBub3cgY29tZXMgZnJvbSBiYWNrZW5kIHN5bmMgc2VydmljZVxuICAgICAgICAnL2FwaS90aWNrZXRtYXN0ZXInOiB7XG4gICAgICAgICAgdGFyZ2V0OiB0aWNrZXRtYXN0ZXJQcm94eVRhcmdldCxcbiAgICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgICAgc2VjdXJlOiBmYWxzZSxcbiAgICAgICAgICBjb25maWd1cmU6IChwcm94eSwgX29wdGlvbnMpID0+IHtcbiAgICAgICAgICAgIHByb3h5Lm9uKCdlcnJvcicsIChlcnIsIF9yZXEsIF9yZXMpID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1t0aWNrZXRtYXN0ZXIgcHJveHldIGVycm9yJywgZXJyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcHJveHkub24oJ3Byb3h5UmVxJywgKHByb3h5UmVxLCByZXEsIF9yZXMpID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1t0aWNrZXRtYXN0ZXIgcHJveHldIGZvcndhcmRpbmc6JywgcmVxLm1ldGhvZCwgcmVxLnVybCwgJ1x1MjE5MicsIHRpY2tldG1hc3RlclByb3h5VGFyZ2V0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcHJveHkub24oJ3Byb3h5UmVzJywgKHByb3h5UmVzLCByZXEsIF9yZXMpID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1t0aWNrZXRtYXN0ZXIgcHJveHldIHJlc3BvbnNlOicsIHByb3h5UmVzLnN0YXR1c0NvZGUsIHJlcS51cmwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSxcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgcGx1Z2luczogW1xuICAgICAgcmVhY3QoKSxcbiAgICAgIC8vIFNFQ1VSSVRZOiBSZW1vdmUgY29uc29sZSBsb2dzIGluIHByb2R1Y3Rpb24gd2hpbGUgcHJlc2VydmluZyBjb25zb2xlLmVycm9yXG4gICAgICAvLyBUaGlzIGFsbG93cyBwcm9kdWN0aW9uIGVycm9yIGxvZ2dpbmcgd2hpbGUgcmVtb3ZpbmcgZGVidWcgbG9nc1xuICAgICAgLi4uKGlzUHJvZHVjdGlvbiA/IFtwcmVzZXJ2ZUVycm9yTG9ncygpXSA6IFtdKSxcbiAgICBdLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgICAgfSxcbiAgICB9LFxuICAgIGJ1aWxkOiB7XG4gICAgICAvLyBPcHRpbWl6ZSBmb3IgbW9iaWxlXG4gICAgICB0YXJnZXQ6ICdlczIwMTUnLFxuICAgICAgY3NzQ29kZVNwbGl0OiB0cnVlLFxuICAgICAgLy8gU0VDVVJJVFk6IFNvdXJjZSBtYXBzIGRpc2FibGVkIHRvIHByZXZlbnQgdXNlcnMgZnJvbSByZWFkaW5nIG9yaWdpbmFsIHNvdXJjZSBjb2RlXG4gICAgICBzb3VyY2VtYXA6IGZhbHNlLFxuICAgICAgbWluaWZ5OiAnZXNidWlsZCcsXG4gICAgICAvLyBTRUNVUklUWTogUmVtb3ZlIGRlYnVnZ2VyIHN0YXRlbWVudHMgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gQ29uc29sZSBsb2dzIGFyZSByZW1vdmVkIHZpYSBwcmVzZXJ2ZUVycm9yTG9ncyBwbHVnaW4gKHByZXNlcnZlcyBjb25zb2xlLmVycm9yKVxuICAgICAgZXNidWlsZDoge1xuICAgICAgICBkcm9wOiBpc1Byb2R1Y3Rpb24gPyBbJ2RlYnVnZ2VyJ10gOiBbXSxcbiAgICAgIH0sXG4gICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgIG91dHB1dDoge1xuICAgICAgICAgIG1hbnVhbENodW5rczogdW5kZWZpbmVkLCAvLyBMZXQgVml0ZSBoYW5kbGUgY2h1bmtpbmdcbiAgICAgICAgfSxcbiAgICAgICAgLy8gTm90ZTogQ2FwYWNpdG9yIHBsdWdpbnMgbXVzdCBiZSBidW5kbGVkIG5vcm1hbGx5XG4gICAgICAgIC8vIFRoZXkgY29udGFpbiBKYXZhU2NyaXB0IGNvZGUgdGhhdCBuZWVkcyB0byBiZSBpbmNsdWRlZCBpbiB0aGUgYnVuZGxlXG4gICAgICAgIC8vIFRoZSBuYXRpdmUgYnJpZGdlIGlzIGhhbmRsZWQgc2VwYXJhdGVseSBieSBDYXBhY2l0b3IncyBuYXRpdmUgcnVudGltZVxuICAgICAgfSxcbiAgICB9LFxuICB9O1xufSk7XG4iLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zbG9pdGVyc3RlaW4vRGVza3RvcC9TeW50aC9zeW50aC1iZXRhLXRlc3RpbmctbWFpblwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3Nsb2l0ZXJzdGVpbi9EZXNrdG9wL1N5bnRoL3N5bnRoLWJldGEtdGVzdGluZy1tYWluL3ZpdGUtcGx1Z2luLXByZXNlcnZlLWVycm9yLWxvZ3MudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3Nsb2l0ZXJzdGVpbi9EZXNrdG9wL1N5bnRoL3N5bnRoLWJldGEtdGVzdGluZy1tYWluL3ZpdGUtcGx1Z2luLXByZXNlcnZlLWVycm9yLWxvZ3MudHNcIjtpbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICdAYmFiZWwvcGFyc2VyJztcbmltcG9ydCBnZW5lcmF0ZSBmcm9tICdAYmFiZWwvZ2VuZXJhdG9yJztcbmltcG9ydCB0eXBlIHsgTm9kZSB9IGZyb20gJ0BiYWJlbC90eXBlcyc7XG5cbi8vIEltcG9ydCB0cmF2ZXJzZSB3aXRoIHByb3BlciBoYW5kbGluZyBmb3IgYm90aCBDb21tb25KUyBhbmQgRVMgbW9kdWxlc1xuLy8gQGJhYmVsL3RyYXZlcnNlIGV4cG9ydHMgZGlmZmVyZW50bHkgaW4gZGlmZmVyZW50IGVudmlyb25tZW50c1xuaW1wb3J0IF90cmF2ZXJzZSBmcm9tICdAYmFiZWwvdHJhdmVyc2UnO1xuY29uc3QgdHJhdmVyc2UgPSAoX3RyYXZlcnNlIGFzIGFueSkuZGVmYXVsdCB8fCBfdHJhdmVyc2U7XG5cbi8qKlxuICogUGx1Z2luIHRvIHNlbGVjdGl2ZWx5IHJlbW92ZSBjb25zb2xlIG1ldGhvZHMgd2hpbGUgcHJlc2VydmluZyBjb25zb2xlLmVycm9yXG4gKiBVc2VzIEJhYmVsIEFTVCB0cmFuc2Zvcm1hdGlvbiBmb3Igc2FmZSwgYWNjdXJhdGUgY29kZSBtb2RpZmljYXRpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXNlcnZlRXJyb3JMb2dzKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ3ByZXNlcnZlLWVycm9yLWxvZ3MnLFxuICAgIGVuZm9yY2U6ICdwb3N0JyxcbiAgICBhcHBseTogJ2J1aWxkJyxcbiAgICB0cmFuc2Zvcm0oY29kZSwgaWQpIHtcbiAgICAgIC8vIE9ubHkgcHJvY2VzcyBzb3VyY2UgZmlsZXMsIHNraXAgbm9kZV9tb2R1bGVzIGFuZCBhbHJlYWR5IHRyYW5zZm9ybWVkIGNvZGVcbiAgICAgIGlmICghaWQuaW5jbHVkZXMoJ3NyYycpIHx8IGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSB8fCAhaWQubWF0Y2goL1xcLihqc3x0c3xqc3h8dHN4KSQvKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gUGFyc2UgY29kZSBpbnRvIEFTVFxuICAgICAgICBjb25zdCBhc3QgPSBwYXJzZShjb2RlLCB7XG4gICAgICAgICAgc291cmNlVHlwZTogJ21vZHVsZScsXG4gICAgICAgICAgcGx1Z2luczogW1xuICAgICAgICAgICAgJ3R5cGVzY3JpcHQnLFxuICAgICAgICAgICAgJ2pzeCcsXG4gICAgICAgICAgICAnZGVjb3JhdG9ycy1sZWdhY3knLFxuICAgICAgICAgICAgJ2NsYXNzUHJvcGVydGllcycsXG4gICAgICAgICAgICAnb2JqZWN0UmVzdFNwcmVhZCcsXG4gICAgICAgICAgICAnYXN5bmNHZW5lcmF0b3JzJyxcbiAgICAgICAgICAgICdmdW5jdGlvbkJpbmQnLFxuICAgICAgICAgICAgJ2V4cG9ydERlZmF1bHRGcm9tJyxcbiAgICAgICAgICAgICdleHBvcnROYW1lc3BhY2VGcm9tJyxcbiAgICAgICAgICAgICdkeW5hbWljSW1wb3J0JyxcbiAgICAgICAgICAgICdudWxsaXNoQ29hbGVzY2luZ09wZXJhdG9yJyxcbiAgICAgICAgICAgICdvcHRpb25hbENoYWluaW5nJyxcbiAgICAgICAgICBdLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUcmFjayBpZiB3ZSBtYWRlIGFueSBjaGFuZ2VzXG4gICAgICAgIGxldCBoYXNDaGFuZ2VzID0gZmFsc2U7XG5cbiAgICAgICAgLy8gVHJhdmVyc2UgQVNUIGFuZCByZW1vdmUgY29uc29sZSBjYWxscyAoZXhjZXB0IGNvbnNvbGUuZXJyb3IpXG4gICAgICAgIGNvbnN0IHRyYXZlcnNlRm4gPSAodHJhdmVyc2UgYXMgdW5rbm93biBhcyB7IGRlZmF1bHQ/OiB0eXBlb2YgdHJhdmVyc2UgfSkuZGVmYXVsdCB8fCB0cmF2ZXJzZTtcbiAgICAgICAgdHJhdmVyc2VGbihhc3QsIHtcbiAgICAgICAgICBDYWxsRXhwcmVzc2lvbihwYXRoKSB7XG4gICAgICAgICAgICBjb25zdCB7IG5vZGUgfSA9IHBhdGg7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBjb25zb2xlIG1ldGhvZCBjYWxsXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIG5vZGUuY2FsbGVlLnR5cGUgPT09ICdNZW1iZXJFeHByZXNzaW9uJyAmJlxuICAgICAgICAgICAgICBub2RlLmNhbGxlZS5vYmplY3QudHlwZSA9PT0gJ0lkZW50aWZpZXInICYmXG4gICAgICAgICAgICAgIG5vZGUuY2FsbGVlLm9iamVjdC5uYW1lID09PSAnY29uc29sZScgJiZcbiAgICAgICAgICAgICAgbm9kZS5jYWxsZWUucHJvcGVydHkudHlwZSA9PT0gJ0lkZW50aWZpZXInXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgY29uc3QgbWV0aG9kTmFtZSA9IG5vZGUuY2FsbGVlLnByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBSZW1vdmUgY29uc29sZS5sb2csIGNvbnNvbGUud2FybiwgY29uc29sZS5pbmZvLCBjb25zb2xlLmRlYnVnLCBjb25zb2xlLnRyYWNlXG4gICAgICAgICAgICAgIC8vIEJ1dCBwcmVzZXJ2ZSBjb25zb2xlLmVycm9yXG4gICAgICAgICAgICAgIGlmIChbJ2xvZycsICd3YXJuJywgJ2luZm8nLCAnZGVidWcnLCAndHJhY2UnXS5pbmNsdWRlcyhtZXRob2ROYW1lKSkge1xuICAgICAgICAgICAgICAgIC8vIFJlcGxhY2Ugd2l0aCBlbXB0eSBleHByZXNzaW9uIHN0YXRlbWVudFxuICAgICAgICAgICAgICAgIHBhdGgucmVwbGFjZVdpdGgoe1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ0V4cHJlc3Npb25TdGF0ZW1lbnQnLFxuICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbjoge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnVW5hcnlFeHByZXNzaW9uJyxcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICd2b2lkJyxcbiAgICAgICAgICAgICAgICAgICAgcHJlZml4OiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBhcmd1bWVudDoge1xuICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdOdW1lcmljTGl0ZXJhbCcsXG4gICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IDAsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0gYXMgYW55KTtcbiAgICAgICAgICAgICAgICBoYXNDaGFuZ2VzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIElmIHdlIG1hZGUgY2hhbmdlcywgZ2VuZXJhdGUgbmV3IGNvZGVcbiAgICAgICAgaWYgKGhhc0NoYW5nZXMpIHtcbiAgICAgICAgICBjb25zdCBnZW5lcmF0ZUZuID0gKGdlbmVyYXRlIGFzIHVua25vd24gYXMgeyBkZWZhdWx0PzogdHlwZW9mIGdlbmVyYXRlIH0pLmRlZmF1bHQgfHwgZ2VuZXJhdGU7XG4gICAgICAgICAgY29uc3Qgb3V0cHV0ID0gZ2VuZXJhdGVGbihhc3QsIHtcbiAgICAgICAgICAgIHJldGFpbkxpbmVzOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbXBhY3Q6IGZhbHNlLFxuICAgICAgICAgIH0sIGNvZGUpO1xuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBvdXRwdXQuY29kZSxcbiAgICAgICAgICAgIG1hcDogb3V0cHV0Lm1hcCxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBJZiBwYXJzaW5nIGZhaWxzLCByZXR1cm4gb3JpZ2luYWwgY29kZVxuICAgICAgICAvLyBUaGlzIGNhbiBoYXBwZW4gd2l0aCBmaWxlcyB0aGF0IGhhdmUgc3ludGF4IHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgY29uc29sZS53YXJuKGBbcHJlc2VydmUtZXJyb3ItbG9nc10gRmFpbGVkIHRvIHRyYW5zZm9ybSAke2lkfTpgLCBlcnJvcik7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlYsU0FBUyxjQUFjLGVBQWU7QUFDblksT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTs7O0FDRGpCLFNBQVMsYUFBYTtBQUN0QixPQUFPLGNBQWM7QUFLckIsT0FBTyxlQUFlO0FBQ3RCLElBQU0sV0FBWSxVQUFrQixXQUFXO0FBTXhDLFNBQVMsb0JBQTRCO0FBQzFDLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULE9BQU87QUFBQSxJQUNQLFVBQVUsTUFBTSxJQUFJO0FBRWxCLFVBQUksQ0FBQyxHQUFHLFNBQVMsS0FBSyxLQUFLLEdBQUcsU0FBUyxjQUFjLEtBQUssQ0FBQyxHQUFHLE1BQU0sb0JBQW9CLEdBQUc7QUFDekYsZUFBTztBQUFBLE1BQ1Q7QUFFQSxVQUFJO0FBRUYsY0FBTSxNQUFNLE1BQU0sTUFBTTtBQUFBLFVBQ3RCLFlBQVk7QUFBQSxVQUNaLFNBQVM7QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNGO0FBQUEsUUFDRixDQUFDO0FBR0QsWUFBSSxhQUFhO0FBR2pCLGNBQU0sYUFBYyxTQUFzRCxXQUFXO0FBQ3JGLG1CQUFXLEtBQUs7QUFBQSxVQUNkLGVBQWVBLE9BQU07QUFDbkIsa0JBQU0sRUFBRSxLQUFLLElBQUlBO0FBR2pCLGdCQUNFLEtBQUssT0FBTyxTQUFTLHNCQUNyQixLQUFLLE9BQU8sT0FBTyxTQUFTLGdCQUM1QixLQUFLLE9BQU8sT0FBTyxT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
