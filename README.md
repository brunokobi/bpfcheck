# BPF Check - Sistema de Auditorias Sanitárias

O **BPF Check** é uma aplicação web desenvolvida para facilitar o gerenciamento e a execução de auditorias sanitárias em estabelecimentos de alimentação, baseada nas normas da **RDC 216/2004** da ANVISA.

O sistema permite o acompanhamento em tempo real do status das auditorias, cálculo de taxas de conformidade e geração de relatórios.

## 🚀 Funcionalidades Principais

- **Dashboard Interativo:** Visão geral com estatísticas vitais (Total de auditorias, Em andamento, Concluídas e Taxa de Conformidade).
- **Gestão de Auditorias:**
  - Criação de novas auditorias baseadas em checklists padronizados.
  - Acompanhamento de status (Em andamento / Concluída).
  - Cálculo automático de porcentagem de conformidade.
- **Histórico e Relatórios:**
  - Visualização de auditorias recentes.
  - Acesso ao histórico completo.
  - Exportação de relatórios (funcionalidade prevista).
- **Interface Moderna:** Design responsivo e intuitivo com feedback visual claro.

## 🛠️ Tecnologias Utilizadas

O projeto foi construído utilizando as seguintes tecnologias e bibliotecas:

- **[React](https://react.dev/)** - Biblioteca para construção de interfaces.
- **[TypeScript](https://www.typescriptlang.org/)** - Superset JavaScript com tipagem estática.
- **[Tailwind CSS](https://tailwindcss.com/)** - Framework de utilitários CSS para estilização.
- **[Shadcn/ui](https://ui.shadcn.com/)** - Coleção de componentes de UI reutilizáveis (Cards, Badges, Buttons).
- **[Lucide React](https://lucide.dev/)** - Biblioteca de ícones.
- **[Date-fns](https://date-fns.org/)** - Manipulação e formatação de datas.

## 📂 Estrutura do Projeto (Parcial)

```
src/
├── components/
│   ├── dashboard/
│   │   └── DashboardHome.tsx  # Componente principal do painel de controle
│   └── ui/                    # Componentes base (Button, Card, Badge, etc.)
├── hooks/
│   └── useAudits.ts           # Hook personalizado para lógica de dados das auditorias
└── ...
```

## 📦 Como Rodar o Projeto

### Pré-requisitos

- Node.js (versão 16 ou superior)
- npm ou yarn

### Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/bpfcheck.git
   ```

2. Instale as dependências:
   ```bash
   cd bpfcheck
   npm install
   # ou
   yarn install
   ```

3. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   # ou
   yarn dev
   ```

4. Acesse a aplicação no navegador (geralmente em `http://localhost:5173`).

## 📄 Licença

Este projeto é de uso proprietário da ORBITGEO.
```

<!--
[PROMPT_SUGGESTION]Pode criar o arquivo do hook useAudits.ts com dados fictícios para eu testar o dashboard?[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Gostaria de adicionar testes unitários para este componente DashboardHome. Pode gerar o arquivo de teste?[/PROMPT_SUGGESTION]
