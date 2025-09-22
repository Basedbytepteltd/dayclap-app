import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// In development, ensure any previously registered service workers are removed to avoid stale caches
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}))
  })
}

// Only register the PWA service worker in production when explicitly enabled.
// This avoids stale CSS/JS cached by a service worker after deploys.
const ENABLE_PWA = import.meta.env.VITE_ENABLE_PWA === 'true'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  if (ENABLE_PWA) {
    try {
      registerSW({ immediate: true })
    } catch (e) {
      console.warn('SW registration failed:', e)
    }
  } else {
    // If PWA is disabled, proactively unregister any existing SW to prevent cache issues
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => {}))
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
