self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
  self.skipWaiting(); // Força a atualização imediata do SW
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Activate');
  e.waitUntil(clients.claim()); // Assume o controle das abas abertas
});

self.addEventListener('fetch', (e) => {
  // 1. LISTA DE SITES E ROTAS QUE O SERVICE WORKER DEVE IGNORAR
  const urlsToIgnore = [
    'supabase.co',
    'n8nchatui.com',
    '/.netlify/functions/'
  ];

  // Verifica se a requisição faz parte da lista acima
  if (urlsToIgnore.some(url => e.request.url.includes(url))) {
    return; // Passa direto, não intercepta
  }

  // 2. IGNORA MÉTODOS QUE NÃO SEJAM GET (POST, PUT, DELETE)
  if (e.request.method !== 'GET') {
    return;
  }

  // 3. MANTÉM O CÓDIGO ORIGINAL PARA O RESTO DO SITE (Imagens, HTML, CSS)
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});