# BPF Check — Sistema de Auditorias Sanitárias

![Version](https://img.shields.io/badge/versão-1.1.0-blue)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?logo=pwa&logoColor=white)
[![Google Play](https://img.shields.io/badge/Google_Play-Disponível-414141?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=app.netlify.bpfcheck.twa)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7?logo=netlify&logoColor=white)

[![BPF Check na Google Play Store](public/screenshot-playstore.png)](https://play.google.com/store/apps/details?id=app.netlify.bpfcheck.twa)

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

## Agente de IA — n8n Multi-Agent

O BPF Check conta com um assistente inteligente construído no **n8n** com arquitetura **multi-agente**, alimentado pelo **Google Gemini**. O agente responde dúvidas sobre o uso do app e sobre a **RDC 216/2004** diretamente pelo chat.

![Fluxo do agente n8n](public/agent-flow.png)

### Como funciona

A mensagem do usuário passa por um pipeline de 4 etapas:

```
Chat Trigger → Orquestrador → Parsear Rota → Roteador → Agente Especialista
```

**1. Orquestrador**
Recebe a mensagem e classifica a intenção, retornando um JSON de roteamento. Não responde diretamente — apenas decide para qual agente encaminhar.

**2. Parsear Rota**
Nó de código JavaScript que extrai a rota do JSON gerado pelo orquestrador, com fallback para `APP_USO` em caso de erro de parse.

**3. Roteador de Agentes**
Switch que direciona para um dos 8 agentes especialistas conforme a intenção detectada.

**4. Agentes Especialistas**

| Agente | Responsabilidade |
|---|---|
| **App — Uso** | Dúvidas sobre login, checklists, relatórios, perfis e uso geral do app. Também recebe saudações e mensagens genéricas |
| **RDC — Geral** | Fundamentos da RDC 216/2004: objetivo, âmbito, definições e contexto legal |
| **RDC — Estrutura** | Seção 4.1: edificação, instalações, equipamentos, móveis e utensílios |
| **RDC — Higiene** | Seções 4.2, 4.5, 4.6: manipuladores, controle de pragas e resíduos |
| **RDC — Alimentos** | Seções 4.7–4.10: matérias-primas, preparo, armazenamento e exposição |
| **RDC — Documentação** | Seções 4.11–4.12: Manual de Boas Práticas, POPs e responsabilidade |
| **Sobre a Autora** | Informações sobre Rafaela Soares Souza Kobi, o TCC e o Guia Alimentar BR |
| **Fora de Escopo** | Responde educadamente que o assunto está fora do escopo do assistente |

### Memória compartilhada

Todos os agentes compartilham a mesma **Buffer Window Memory**, mantendo o contexto da conversa independentemente de quantas trocas de agente ocorrerem na sessão.

### Tecnologias do agente

- **n8n** — Orquestração do fluxo
- **Google Gemini** — LLM para o orquestrador e todos os agentes especialistas
- **LangChain nodes** — Integração de agentes, memória e LLM no n8n

---

## Créditos

Desenvolvido por **Bruno Kobi** para **Rafaela Soares Souza Kobi**.
