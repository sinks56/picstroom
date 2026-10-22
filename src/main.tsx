import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorCapture, logDiag } from './lib/diagnostics';

installGlobalErrorCapture();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

if (__CAP_BUILD__ && 'serviceWorker' in navigator) {
  // The Android app ships its assets in the APK; a service worker left over from an
  // earlier build could serve stale files after an update. Remove it and its caches.
  navigator.serviceWorker.getRegistrations()
    .then(regs => Promise.all(regs.map(r => r.unregister())))
    .then(() => (window.caches ? caches.keys() : Promise.resolve([] as string[])))
    .then(keys => Promise.all(keys.filter(k => k.startsWith('workbox') || k === 'images-cache').map(k => caches.delete(k))))
    .catch(e => logDiag('warn', 'SW cleanup failed', e));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
