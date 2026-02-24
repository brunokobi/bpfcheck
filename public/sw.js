self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  self.skipWaiting(); // Força a atualização imediata do SW
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activate');
  e.waitUntil(clients.claim()); // Assume o controle das abas abertas
});

self.addEventListener('fetch', (e) => {
  // 1. IGNORA QUALQUER REQUISIÇÃO PARA O SUPABASE
  if (e.request.url.includes('supabase.co')) {
    return; 
  }

  // 2. IGNORA MÉTODOS QUE NÃO SEJAM GET (POST, PUT, DELETE)
  if (e.request.method !== 'GET') {
    return;
  }

  // 3. MANTÉM O SEU CÓDIGO ORIGINAL PARA O RESTO DO SITE (Imagens, HTML, CSS)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});