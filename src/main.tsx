import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Force deployment refresh - Chrome fixes applied

createRoot(document.getElementById("root")!).render(<App />);
