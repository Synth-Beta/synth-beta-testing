/**
 * Lets `node scripts/run-cron.mjs` import the Vercel cron handlers, which
 * use `.js` specifiers for TypeScript files.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js')) {
    try {
      return await nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    } catch {
      // Real .js modules (node_modules, this folder) fall through.
    }
  }
  return nextResolve(specifier, context);
}
