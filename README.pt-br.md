<div align="right">
  <a href="README.md">🇺🇸 English</a> | 
  <a href="README.pt-br.md"><b>🇧🇷 Português</b></a>
</div>

# ⚒️ SKSE Forge

> *“Moldado no fogo, temperado no gelo de Skyrim.”*

O **SKSE Forge** é uma ferramenta de desenvolvimento desktop, open-source, construída em **Electron** e **TypeScript** para automatizar a modernização, reescrita de cabeçalhos e compilação de plugins legados em C++ do Skyrim Script Extender (SKSE) para o ecossistema unificado **CommonLibSSE-NG**.

Com suporte nativo a múltiplos runtimes (SE 1.5.97, AE 1.6.x e builds 1.7.x) via Address Library, o Forge transforma o processo manual e desgastante de portar código antigo em um pipeline direto, reprodutível e visualmente integrado.

---

## ⚔️ Funcionalidades Principais

* **Modernização Automatizada para CommonLibSSE-NG:** Substituição guiada de chamadas legadas do SKSE clássico para estruturas nativas da NG, unificando suporte a SE, AE e GOG sob o mesmo binário.
* **Pipeline de Compilação Integrado:** Automação de builds via CMake e MSVC Build Tools com detecção de dependências ausentes, caminhos de inclusão quebrados e assinaturas inválidas de hooks.
* **Transmutação Sem Código (Experimental):** Conversão direta de tabelas de endereços em binários `.dll` e empacotamento para MO2/Vortex sem necessidade do código-fonte ou compilador C++.
* **Estética de Forja Nórdica:** Rejeição explícita de padrões genéricos de SaaS corporativo; construído em aço escuro, tons de brasa incandescente, bordas retas e alta densidade técnica.

---

## 🚀 Como Começar

### Pré-requisitos
* **Node.js** (v18.0.0 ou superior)
* **Visual Studio Build Tools 2022** (C++ Desktop Development)
* **CMake** (v3.21+)

### Instalação

```bash
git clone [https://github.com/GiovaneKayser/SKSE-Forge.git](https://github.com/GiovaneKayser/SKSE-Forge.git)
cd SKSE-Forge
npm install
npm run dev
