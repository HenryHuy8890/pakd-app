import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ErrorBoundary } from './components/pin';
import { App } from './App';

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);

// PWA: đăng ký service worker tối giản (chỉ để cài được lên màn hình chính)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  });
}
