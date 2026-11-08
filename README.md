# SKSE Forge ⚔️ — Modernizador Universal de Plugins SKSE

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Electron](https://img.shields.io/badge/Electron-34-47848f?logo=electron)](https://www.electronjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**SKSE Forge** é uma aplicação desktop de alta performance criada para a comunidade de modding de **The Elder Scrolls V: Skyrim (SE/AE)**. A ferramenta automatiza a migração, modernização e compilação de plugins SKSE legados para a biblioteca moderna [CommonLibSSE-NG](https://github.com/CharmedBaryon/CommonLibSSE-NG), assegurando compatibilidade universal com o formato binário 5+ da **Address Library** (versões 1.6.1130, 1.6.1170 e 1.7.104+).

---

## 🎨 1. Design de Interface (Inspirado em Skyrim & SkyUI)

A interface segue estritamente a identidade visual nórdica e imersiva do Skyrim e SkyUI:
- **Esquema de Cores:**
  - Fundo principal: Ardósia/obsidiana escura semi-translúcida (`#0a0b0e`, `#12151c`).
  - Painéis secundários: Efeito de vidro escuro fosco (*glassmorphism* com `backdrop-blur`).
  - Tipografia e Ícones: Prata/pergaminho suave (`#d8dadf`) e branco puro para destaque.
  - Acentos Interativos: Azul nórdico frio (`#5ca0d3`) no hover e dourado Dwemer/Daédrico (`#c8a86b`) para ações concluídas e estados de sucesso.
  - Divisórias: Linhas finas de 1px com o símbolo clássico de losango central (`◇`).
- **Fontes:**
  - Títulos: Tipografia nórdica clássica (*Cinzel*).
  - Terminal e Logs: Monospace de alta legibilidade (*JetBrains Mono* / *Fira Code*).
  - Textos de Apoio: Sans-serif moderna e nítida (*Inter*).
- **Componentes Temáticos:**
  - Barra de progresso temática (estilo barra de Magicka / Stamina / Vida).
  - Terminal embutido com streaming em tempo real das saídas do `git`, `vcpkg`, `cmake` e `msbuild`.
  - Notificações de conclusão estilizadas no formato "Objetivo Concluído" / "Quest Completed" com efeito sonoro harmônico nórdico sintetizado (Web Audio API).

---

## 🌐 2. Internacionalização (i18n)

Suporte nativo a múltiplos idiomas com troca a quente (sem reiniciar a aplicação):
- 🇧🇷 **Português do Brasil** (`pt-BR`) [Padrão inicial]
- 🇺🇸 **Inglês** (`en-US`)
- 🇪🇸 **Espanhol** (`es-ES`)

Todos os textos, botões, diagnósticos de erro e mensagens de progresso são centralizados em `src/renderer/locales/`.

---

## ⚙️ 3. Modos de Operação e Arquitetura

O **SKSE Forge** disponibiliza dois modos complementares para modernização de mods:

### Modo 1: A Forja 🔨 (Recompilação Nativa C++ com CommonLibSSE-NG)
Ideal para repositórios com código-fonte C++ disponível:
```text
[ ENTRADA (Git URL ou Pasta Local com CMake) ]
            │
            ▼
┌───────────────────────────┐
│   SkyrimPathService       │ ➔ Detecção dinâmica do jogo (Registro, Steam VDF, GOG)
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│   EnvironmentService      │ ➔ Detecta MSVC (VS 2022/2026), CMake, vcpkg.cmake, Git
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│   RepositoryService       │ ➔ Clona recursivamente (submódulos) no userData/workspaces
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│   PatchEngineService      │ ➔ 1. Atualiza CommonLibSSE -> CommonLibSSE-NG
│                           │ ➔ 2. Injeta NOMINMAX no CMakeLists.txt e PCH.h
│                           │ ➔ 3. Eleva padrão C++ para C++20
│                           │ ➔ 4. Mapeia bibliotecas legadas (ex: JsonCpp)
│                           │ ➔ 5. Neutraliza comandos POST_BUILD com caminhos locais
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│      BuildService         │ ➔ Configura com CMake (x64) + Compila em Release com MSVC
│                           │ ➔ Localiza a DLL compilada e arquivos .ini/.toml
│                           │ ➔ Empacota na estrutura: SKSE/Plugins/<Mod>.dll
│                           │ ➔ Comprime pacote .ZIP pronto para MO2 / Vortex
└───────────────────────────┘
```

### Modo 2: A Transmutação ✨ (Engenharia Reversa Sem Código / No-Code)
Para mods legados ou abandonados dos quais só se possui o `.dll` ou `.zip`:
- **Análise PE (Portable Executable):** Validação de arquitetura x64, exports obrigatórios do SKSE (`SKSEPlugin_Query`, `SKSEPlugin_Load`) e estimativa de risco.
- **Address Library Bridge:** Converte e mapeia offsets do formato 5 para o formato 2 isolado, garantindo compatibilidade com versões modernas (1.6.1130, 1.6.1170, 1.7.104+).
- **Injeção de Receitas Hex:** Correções cirúrgicas de trampolins e bypass de checagens legadas.
- **Empacotador Automático:** Gera pacote pronto para Vortex e Mod Organizer 2 com zero dependência de compilador.

---

## 📂 4. Estrutura de Diretórios

```text
skse-forge/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── services/
│       ├── SkyrimPathService.ts
│       ├── BinaryCompatibilityService.ts
│       ├── EnvironmentService.ts
│       ├── RepositoryService.ts
│       ├── PatchEngineService.ts
│       └── BuildService.ts
├── src/
│   ├── shared/
│   │   └── types.ts
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── ModeSelector.tsx
│       │   ├── ForgePanel.tsx
│       │   ├── TransmutationPanel.tsx
│       │   ├── ProgressStepper.tsx
│       │   ├── ConsoleTerminal.tsx
│       │   └── DirectoryFooter.tsx
│       ├── locales/
│       │   ├── pt-BR.json
│       │   ├── en-US.json
│       │   └── es-ES.json
│       └── styles/
│           └── skyrim.css
├── test/
│   ├── test-services.ts
│   ├── test-pack.ts
│   ├── test-skyrim-path.ts
│   └── test-binary-compat.ts
├── package.json
├── tailwind.config.cjs
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 5. Como Executar

### Pré-requisitos
- **Node.js** (v18+)
- **Git para Windows**
- **Visual Studio 2022 ou 2026** (com a carga de trabalho de *Desenvolvimento para Desktop com C++* e CMake/vcpkg selecionados)

### Instalação
```bash
npm install
```

### Modo de Desenvolvimento
Inicia a aplicação desktop com hot-reload ativo:
```bash
npm run dev
```

### Compilar e Empacotar Aplicação
```bash
npm run build
```

### Executar Testes de Validação
Testa a detecção de compiladores, a injeção do motor de patches e o empacotador de ZIP MO2/Vortex:
```bash
npm test
```

---

## 📦 6. Instalação do Pacote Forjado no Skyrim

Ao término da compilação:
1. O aplicativo exibirá o banner **OBJETIVO CONCLUÍDO** e gerará o arquivo:
   `dist/<NomeDoMod>_v1.0.0_CommonLibSSE-NG_MO2.zip`
2. Clique em **"Abrir Pasta de Destino"**.
3. Arraste o arquivo `.zip` diretamente para o **Mod Organizer 2** ou **Vortex**.
4. Habilite o mod na sua ordem de carregamento! O plugin funcionará automaticamente em qualquer versão do Skyrim SE/AE compatível com a Address Library formato 5+.

---

## 📄 Licença
Distribuído sob a licença MIT. Consulte `LICENSE` para mais detalhes.

