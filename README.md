# BPF Check — Sistema de Auditorias Sanitárias

![Version](https://img.shields.io/badge/versão-1.1.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?logo=pwa&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)

![BPF Check na Google Play Store](public/screenshot-playstore.png)

O **BPF Check** é uma aplicação web progressiva (PWA) desenvolvida para facilitar o gerenciamento e a execução de auditorias sanitárias em estabelecimentos de alimentação, baseada nas normas da **RDC 216/2004** da ANVISA.

O sistema suporta funcionamento **offline-first** — auditorias podem ser realizadas sem conexão com a internet e sincronizadas automaticamente ao reconectar.

---

## Funcionalidades

- **Dashboard Interativo** — Visão geral com estatísticas (total, em andamento, concluídas e taxa de conformidade)
- **Auditorias por Seção** — Navegação por seções do checklist RDC 216/2004 com progresso individual
- **Auto-save** — Respostas e observações salvas automaticamente a cada interação
- **Fotos por Item** — Captura de fotos diretamente pelo dispositivo para evidências
- **Modo Offline** — Funciona sem internet; auditorias, itens e fotos são sincronizados ao reconectar
- **PWA Instalável** — Disponível na Google Play Store e instalável em qualquer dispositivo

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + shadcn/ui |
| Backend | Supabase (PostgreSQL + Storage + Auth) |
| Offline | IndexedDB (Dexie.js) |
| Deploy | Netlify |
| PWA | vite-plugin-pwa |

---

## Offline-First

A arquitetura offline funciona em duas camadas:

- **Dexie (IndexedDB)** — Fila de sincronização de fotos (`syncQueue`) e cache de checklist (`cache`)
- **useOfflineStorage** — Fila de auditorias e itens (`pending_syncs`)
- **useSyncWorker** — Processa a fila automaticamente ao reconectar, com mapeamento de IDs temporários para IDs reais

O checklist é cacheado na primeira abertura online e fica disponível para sessões offline subsequentes.

---

## Como Rodar

**Pré-requisitos:** Node.js 18+

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento
npm run dev

# Build de produção
npm run build
```

Acesse em `http://localhost:5173`.

---

## Créditos

Desenvolvido por **Bruno Kobi** para **Rafaela Soares Souza Kobi**.
