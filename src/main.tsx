import './instrument'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SplashScreen } from '@capacitor/splash-screen'

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
    root.render(<App />);
    console.log('✅ App rendered successfully!');
    
    // Hide splash screen when app is loaded (for Capacitor)
    const isCapacitor = (window as any).Capacitor !== undefined;
    if (isCapacitor) {
      requestAnimationFrame(() => {
        setTimeout(async () => {
          try {
            await SplashScreen.hide();
            console.log('✅ Splash screen hidden');
          } catch (error) {
            console.log('ℹ️ Splash screen not available:', error);
          }
        }, 350);
      });
    }
  } catch (error) {
    console.error('❌ Error rendering React app:', error);
    // Fallback: show something in the root element
    rootElement.innerHTML = '<h1>Error loading app</h1><p>Check console for details</p>';
  }
}
