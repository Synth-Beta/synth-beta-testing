import './instrument'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Every deploy rewrites the hashed asset filenames, so a tab still running the previous
// build 404s the moment it lazy-loads a chunk it hasn't fetched yet ("Failed to fetch
// dynamically imported module"). Vite fires vite:preloadError for exactly this; reload
// once to pick up the new index.html. The timestamp guard stops a reload loop when the
// chunk is genuinely gone - the ErrorBoundary below shows the retry card instead.
const RELOAD_KEY = 'synth:chunk-reload';
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return;
  event.preventDefault();
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage blocked */ }
  console.warn('[chunk] stale build detected, reloading');
  window.location.reload();
});

// Force deployment refresh - Chrome fixes applied
console.log('🚀 Main.tsx is executing...');

const rootElement = document.getElementById("root");
console.log('🔍 Root element:', rootElement);

if (!rootElement) {
  console.error('❌ Root element not found!');
} else {
  console.log('✅ Root element found, creating React root...');
  try {
    const root = createRoot(rootElement);
    console.log('✅ React root created, rendering App...');
    root.render(<ErrorBoundary><App /></ErrorBoundary>);
    console.log('✅ App rendered successfully!');
  } catch (error) {
    console.error('❌ Error rendering React app:', error);
    // Fallback: show something in the root element
    rootElement.innerHTML = '<h1>Error loading app</h1><p>Check console for details</p>';
  }
}
