<div align="right">
  <a href="README.md">🇺🇸 English</a> | 
  <a href="README.pt-br.md">🇧🇷 Português</a>
</div>

<br />

# ⚒️ SKSE Forge

> *“Forged in fire, quenched in the frost of Skyrim.”*

**SKSE Forge** is an open-source desktop tool built with **Electron** and **TypeScript**, designed to automate the modernization, header rewriting, and compilation of legacy C++ Skyrim Script Extender (SKSE) plugins targeting the unified **CommonLibSSE-NG** framework.

With native multi-runtime support (SE 1.5.97, AE 1.6.x, and 1.7.x builds) powered by the Address Library database, Forge transforms tedious, manual codebase refactoring into an automated, reproducible, and visually thematic pipeline.

---

## ⚔️ Key Features

* **Automated Migration to CommonLibSSE-NG:** Guided replacement of legacy SKSE headers and calls into unified NG APIs, targeting SE, AE, and GOG with a single binary.
* **Integrated Build Pipeline:** Native build triggers via CMake and MSVC Build Tools with real-time detection of broken include paths, missing libraries, and invalid memory hook signatures.
* **No-Code Transmutation (Experimental):** Direct binary address table patching and packaging for MO2/Vortex without requiring C++ source code or MSVC toolchains.
* **Nordic Forge Aesthetic:** Strict rejection of sterile corporate SaaS patterns; crafted with raw iron, ember accents, sharp corners, and high information density.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18.0.0+)
* **Visual Studio Build Tools 2022** (C++ Desktop Development workload)
* **CMake** (v3.21+)

### Installation

```bash
git clone [https://github.com/GiovaneKayser/SKSE-Forge.git](https://github.com/GiovaneKayser/SKSE-Forge.git)
cd SKSE-Forge
npm install
npm run dev
