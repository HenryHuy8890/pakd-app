// Service worker TỐI GIẢN cho PWA cài đặt được — KHÔNG cache (tránh kẹt bản cũ, app vốn quen Ctrl+F5).
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // passthrough — trình duyệt tự xử lý mạng
