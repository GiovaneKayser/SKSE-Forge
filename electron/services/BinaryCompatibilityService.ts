import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { execSync } from 'child_process';
import archiver from 'archiver';
import { SkyrimPathService } from './SkyrimPathService';
import {
  RiskSymbol,
  PatchItem,
  PatchRecipe,
  PeAnalysisReport,
  AddressLibraryBinInfo,
  SkyrimInstallInfo,
  AddressLibraryConversionResult,
  TransmuteOptions,
  TransmuteResult,
} from '../../src/shared/types';

export type {
  RiskSymbol,
  PatchItem,
  PatchRecipe,
  PeAnalysisReport,
  AddressLibraryBinInfo,
  SkyrimInstallInfo,
  AddressLibraryConversionResult,
  TransmuteOptions,
  TransmuteResult,
};

export class BinaryCompatibilityService {
  private recipes: PatchRecipe[] = [];
  private pathService: SkyrimPathService;

  constructor(pathService?: SkyrimPathService) {
    this.pathService = pathService || new SkyrimPathService();
    this.loadRecipes();
  }

  /**
   * Load local patch recipes catalogue
   */
  private loadRecipes(): void {
    try {
      const recipePath = path.join(__dirname, '../data/patch_recipes.json');
      if (fs.existsSync(recipePath)) {
        const raw = fs.readFileSync(recipePath, 'utf8');
        this.recipes = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to load patch_recipes.json:', err);
      this.recipes = [];
    }
  }

  /**
   * Detects Skyrim Special Edition / Anniversary Edition installations dynamically
   * via Windows Registry, Steam libraryfolders.vdf, and dynamic storage scans.
   */
  async detectSkyrimInstallations(): Promise<SkyrimInstallInfo[]> {
    return this.pathService.detectSkyrimInstallations();
  }

  /**
   * Inspects a PE (.dll) file buffer and extracts symbols, exports, and risk analysis
   */
  async analyzeBinary(inputPath: string): Promise<PeAnalysisReport> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Arquivo não encontrado: ${inputPath}`);
    }

    let dllPath = inputPath;
    let tempExtractDir: string | null = null;

    // Handle .zip archives by locating the primary .dll inside
    if (inputPath.toLowerCase().endsWith('.zip')) {
      tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-zip-'));
      this.extractZip(inputPath, tempExtractDir);
      const foundDlls = this.findFiles(tempExtractDir, (f) => f.toLowerCase().endsWith('.dll'));
      if (foundDlls.length === 0) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        throw new Error('Nenhum arquivo DLL de mod SKSE foi encontrado dentro do arquivo ZIP.');
      }
      // Sort by size and prefer DLL with SKSE / plugin in name
      dllPath = foundDlls.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    }

    try {
      const buffer = fs.readFileSync(dllPath);
      const stat = fs.statSync(dllPath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      // 1. Basic PE Header validation
      if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) {
        throw new Error('O arquivo fornecido não é um executável binário PE/DLL válido (Assinatura MZ ausente).');
      }

      const peOffset = buffer.readInt32LE(0x3c);
      if (peOffset + 24 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString('ascii') !== 'PE\0\0') {
        throw new Error('Assinatura PE inválida ou corrompida.');
      }

      const machine = buffer.readUInt16LE(peOffset + 4);
      const architecture: 'x64' | 'x86' | 'unknown' =
        machine === 0x8664 ? 'x64' : machine === 0x014c ? 'x86' : 'unknown';

      // 2. Extract ASCII and UTF-16 strings from the binary
      const detectedSymbols: RiskSymbol[] = [];
      const bufferText = buffer.toString('binary');

      // Symbol dictionaries
      const highRiskUiKeywords = [
        { key: 'IMenu', reason: 'Interface IMenu: alteração estrutural da vtable no Skyrim 1.6.1130+' },
        { key: 'MenuTopicManager', reason: 'MenuTopicManager: alteração de alinhamento e membros no 1.6.1130+' },
        { key: 'CreationClub', reason: 'Creation Club UI: reestruturação profunda nos menus da atualização de dez/2023' },
        { key: 'BSScaleform', reason: 'Scaleform Manager: callbacks e slots de renderização alterados' },
        { key: 'GFxMovieView', reason: 'Flash GFx Movie View: ponteiros de renderização modificados' },
        { key: 'HUDMenu', reason: 'HUDMenu: elementos da interface principal reorganizados' },
        { key: 'InventoryMenu', reason: 'InventoryMenu: layout de slots de itens modificado' },
        { key: 'CraftingSubMenu', reason: 'CraftingSubMenus: vtable de menus de forja e alquimia alterada' },
        { key: 'UI::GetSingleton', reason: 'Chamada direta ao Singleton de UI que sofreu deslocamento de membros' },
      ];

      const mediumRiskKeywords = [
        { key: 'bhkWorld', reason: 'Havok Physics bhkWorld: possíveis colisões com extensões Havok' },
        { key: 'TESCamera', reason: 'Sistema de Câmera TESCamera: offsets de estado e zoom sujeitos a variações' },
        { key: 'PlayerCamera', reason: 'Manipulação direta da PlayerCamera em runtime' },
        { key: 'SKSETrampoline', reason: 'Alocação de código em tempo de execução via Trampoline' },
        { key: 'VirtualProtect', reason: 'Manipulação de permissões de memória executável' },
        { key: 'Detour', reason: 'Detours de funções com dependência estrita de offsets pré-1.6.1130' },
      ];

      const lowRiskKeywords = [
        { key: 'TESForm', reason: 'Manipulação estável de formulários do jogo (TESForm)' },
        { key: 'Actor', reason: 'Lógica padrão de atores e NPCs (Actor)' },
        { key: 'SpellItem', reason: 'Manipulação padrão de magias e efeitos (SpellItem)' },
        { key: 'Papyrus', reason: 'Bindings nativos de Papyrus' },
        { key: 'BSScript', reason: 'Sistema nativo de scripts da Bethesda' },
      ];

      let riskScore = 15; // Base low
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      // Check High Risk
      for (const item of highRiskUiKeywords) {
        if (bufferText.includes(item.key)) {
          detectedSymbols.push({
            symbol: item.key,
            category: 'ui',
            risk: 'high',
            reason: item.reason,
          });
          riskScore = Math.max(riskScore, 85);
          riskLevel = 'high';
        }
      }

      // Check Medium Risk
      for (const item of mediumRiskKeywords) {
        if (bufferText.includes(item.key)) {
          detectedSymbols.push({
            symbol: item.key,
            category: 'memory',
            risk: 'medium',
            reason: item.reason,
          });
          if (riskLevel !== 'high') {
            riskScore = Math.max(riskScore, 55);
            riskLevel = 'medium';
          }
        }
      }

      // Check Low Risk
      for (const item of lowRiskKeywords) {
        if (bufferText.includes(item.key)) {
          detectedSymbols.push({
            symbol: item.key,
            category: 'standard',
            risk: 'low',
            reason: item.reason,
          });
        }
      }

      // Check SKSE Plugin Exports
      const skseExports: string[] = [];
      const knownExports = ['SKSEPlugin_Query', 'SKSEPlugin_Load', 'SKSEPlugin_Version'];
      for (const exp of knownExports) {
        if (bufferText.includes(exp)) {
          skseExports.push(exp);
        }
      }
      const isSksePlugin = skseExports.length > 0;

      // Extract Imported DLLs
      const importedDlls: string[] = [];
      const commonDlls = ['SKSE64.dll', 'KERNEL32.dll', 'USER32.dll', 'MSVCP140.dll', 'VCRUNTIME140.dll', 'D3D11.dll'];
      for (const d of commonDlls) {
        if (bufferText.toLowerCase().includes(d.toLowerCase())) {
          importedDlls.push(d);
        }
      }

      // Match available recipe
      let matchedRecipe: PatchRecipe | undefined = this.recipes.find(
        (r) => r.targetSha256 && r.targetSha256.toLowerCase() === sha256.toLowerCase()
      );

      // Check generic pattern recipes if no direct sha256 match
      if (!matchedRecipe) {
        matchedRecipe = this.recipes.find((r) => {
          if (!r.patternHex) return false;
          const cleanPattern = r.patternHex.replace(/\s+/g, '');
          // Require at least 6 bytes (12 hex characters) to prevent false positive matches in runtime code
          if (cleanPattern.length < 12) return false;
          const patternBuf = Buffer.from(cleanPattern, 'hex');
          return buffer.indexOf(patternBuf) !== -1;
        });
      }

      let riskSummary = '';
      if (riskLevel === 'high') {
        riskSummary =
          'Risco Elevado: O plugin faz chamadas a estruturas de interface de usuário (UI/Menus) que foram alteradas no Skyrim 1.6.1130+. Recomenda-se aplicar conversão de Address Library e compatibilização binária.';
      } else if (riskLevel === 'medium') {
        riskSummary =
          'Risco Médio: O plugin manipula memória, câmera ou trampolines. A compatibilização da Address Library normalmente restaura a funcionalidade completa.';
      } else {
        riskSummary =
          'Risco Baixo (Nórdico): O plugin utiliza lógica padrão de gameplay (Papyrus, Atores, Magias). Alta probabilidade de estabilidade total com conversão de Address Library.';
      }

      return {
        fileName: path.basename(dllPath),
        fileSize: stat.size,
        sha256,
        architecture,
        isSksePlugin,
        skseExports,
        importedDlls,
        detectedSymbols,
        riskLevel,
        riskScore,
        riskSummary,
        matchedRecipe,
      };
    } finally {
      if (tempExtractDir && fs.existsSync(tempExtractDir)) {
        try {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Helper to verify if a path points to the Skyrim game installation folder.
   * SKSE Forge guarantees this directory is strictly READ-ONLY.
   */
  public isGameDirectory(dirOrFilePath: string): boolean {
    const normalized = path.resolve(dirOrFilePath).toLowerCase().replace(/\\/g, '/');
    const isInsideProject =
      normalized.startsWith(path.resolve(process.cwd()).toLowerCase().replace(/\\/g, '/')) ||
      normalized.startsWith(os.tmpdir().toLowerCase().replace(/\\/g, '/'));

    if (isInsideProject) {
      return false;
    }

    return (
      normalized.includes('/steamapps/common/skyrim') ||
      normalized.includes('skyrim special edition') ||
      normalized.includes('skyrim anniversary edition') ||
      normalized.includes('skyrim vr') ||
      normalized.endsWith('/skyrimse.exe') ||
      normalized.endsWith('/skyrimvr.exe')
    );
  }

  /**
   * Converts a modern Address Library Format 5 (.bin) file into the classic Format 2 (.bin) layout
   * required by legacy CommonLibSSE plugins.
   * Output is written EXCLUSIVELY to isolated project/staging directories, NEVER to the game directory.
   */
  async convertFormat5ToFormat2(
    sourceBinPath: string,
    outputBinPath?: string
  ): Promise<AddressLibraryConversionResult> {
    const startTime = Date.now();

    if (!fs.existsSync(sourceBinPath)) {
      throw new Error(`Arquivo da Address Library de origem não encontrado: ${sourceBinPath}`);
    }

    const v5 = fs.readFileSync(sourceBinPath);
    if (v5.length < 96) {
      throw new Error('Arquivo de Address Library inválido: tamanho menor que o cabeçalho mínimo de 96 bytes.');
    }

    const format = v5.readInt32LE(0);
    if (format !== 5) {
      throw new Error(`O arquivo fornecido não é Formato 5 (Formato detectado: ${format}). Conversão cancelada.`);
    }

    const version = [
      v5.readUInt32LE(4),
      v5.readUInt32LE(8),
      v5.readUInt32LE(12),
      v5.readUInt32LE(16),
    ];
    const versionString = version.join('.');

    // Extract module name (up to 64 bytes)
    let moduleName = v5.subarray(20, 84).toString('utf8').replace(/\0.*$/, '').trim();
    if (!moduleName) moduleName = 'SkyrimSE.exe';

    const pointerSize = v5.readInt32LE(84) || 8;
    const offsetCount = v5.readInt32LE(92);

    if (96 + offsetCount * 4 > v5.length) {
      throw new Error('Arquivo corrompido: a tabela de deslocamentos excede o tamanho físico do arquivo binário.');
    }

    // Decode mapping pairs (ID, Offset)
    const validPairs: { id: bigint; offset: bigint }[] = [];
    for (let id = 0; id < offsetCount; id++) {
      const off = v5.readUInt32LE(96 + id * 4);
      if (off > 0) {
        validPairs.push({ id: BigInt(id), offset: BigInt(off) });
      }
    }

    // Encode to Format 2 layout
    const nameBytes = Buffer.from(moduleName, 'utf8');
    const headerSize = 4 + 16 + 4 + nameBytes.length + 4 + 4; // 44 bytes typically
    const outBuffer = Buffer.alloc(headerSize + validPairs.length * 17);
    let pos = 0;

    // 1. Format = 2
    outBuffer.writeInt32LE(2, pos);
    pos += 4;

    // 2. Version[4]
    outBuffer.writeUInt32LE(version[0], pos); pos += 4;
    outBuffer.writeUInt32LE(version[1], pos); pos += 4;
    outBuffer.writeUInt32LE(version[2], pos); pos += 4;
    outBuffer.writeUInt32LE(version[3], pos); pos += 4;

    // 3. NameLen + Name
    outBuffer.writeInt32LE(nameBytes.length, pos); pos += 4;
    nameBytes.copy(outBuffer, pos); pos += nameBytes.length;

    // 4. PointerSize + AddressCount
    outBuffer.writeInt32LE(pointerSize, pos); pos += 4;
    outBuffer.writeInt32LE(validPairs.length, pos); pos += 4;

    // 5. Encoded Entries (Standard Compact Delta Format 2)
    let prevId = 0n;
    let prevOffset = 0n;

    for (const pair of validPairs) {
      const deltaId = pair.id - prevId;
      const deltaOffset = pair.offset - prevOffset;

      if (deltaId === 1n && deltaOffset >= 0n && deltaOffset <= 0xffn) {
        outBuffer.writeUInt8(0x21, pos++);
        outBuffer.writeUInt8(Number(deltaOffset), pos++);
      } else if (deltaId === 1n && deltaOffset >= 0n && deltaOffset <= 0xffffn) {
        outBuffer.writeUInt8(0x41, pos++);
        outBuffer.writeUInt16LE(Number(deltaOffset), pos);
        pos += 2;
      } else {
        outBuffer.writeUInt8(0x00, pos++);
        outBuffer.writeBigUInt64LE(pair.id, pos);
        pos += 8;
        outBuffer.writeBigUInt64LE(pair.offset, pos);
        pos += 8;
      }

      prevId = pair.id;
      prevOffset = pair.offset;
    }

    const finalBuffer = outBuffer.subarray(0, pos);

    // Determine target output file path
    const defaultOutputFolder = path.join(process.cwd(), 'dist', 'ConvertedAddressLibrary');
    const resolvedOutputPath =
      outputBinPath ||
      path.join(
        defaultOutputFolder,
        `versionlib-${version[0]}-${version[1]}-${version[2]}-${version[3]}.bin`
      );

    // CRITICAL SECURITY GUARD: Never write or modify files inside the Skyrim game directory!
    if (this.isGameDirectory(resolvedOutputPath)) {
      throw new Error(
        `Operação de segurança: O SKSE Forge proíbe expressamente gravar ou modificar arquivos diretamente na pasta de instalação do jogo (${resolvedOutputPath}). Os arquivos convertidos devem ser gerados em pastas isoladas do projeto ou pacotes para MO2/Vortex.`
      );
    }

    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, finalBuffer);

    // Also write companion version-X.bin without "lib" prefix for plugins checking legacy prefix
    const altFileName = `version-${version[0]}-${version[1]}-${version[2]}-${version[3]}.bin`;
    const altPath = path.join(path.dirname(resolvedOutputPath), altFileName);
    if (!this.isGameDirectory(altPath)) {
      try {
        fs.writeFileSync(altPath, finalBuffer);
      } catch {
        // ignore
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      sourceFile: sourceBinPath,
      outputFile: resolvedOutputPath,
      companionFile: altPath,
      sourceFormat: 5,
      targetFormat: 2,
      gameVersion: versionString,
      pointerSize,
      totalAddresses: validPairs.length,
      outputBytes: finalBuffer.length,
      durationMs,
    };
  }

  /**
   * Applies byte patches to DLL buffer safely
   */
  applyHexPatches(
    dllBuffer: Buffer,
    recipe: PatchRecipe,
    onLog?: (msg: string) => void
  ): { modifiedBuffer: Buffer; appliedCount: number } {
    let modifiedBuffer = Buffer.from(dllBuffer);
    let appliedCount = 0;

    for (const patch of recipe.patches) {
      try {
        const offset = parseInt(patch.offsetHex, 16);
        const origBytes = Buffer.from(patch.originalBytes.replace(/\s+/g, ''), 'hex');
        const replBytes = Buffer.from(patch.replacementBytes.replace(/\s+/g, ''), 'hex');

        if (offset + origBytes.length <= modifiedBuffer.length) {
          const slice = modifiedBuffer.subarray(offset, offset + origBytes.length);
          if (slice.equals(origBytes)) {
            replBytes.copy(modifiedBuffer, offset);
            appliedCount++;
            onLog?.(`[Patch Hex] Aplicado em ${patch.offsetHex}: ${patch.originalBytes} ➔ ${patch.replacementBytes} (${patch.comment || 'Ajuste'})`);
            continue;
          }
        }

        // If offset did not match, try pattern scan within binary
        const scanIdx = modifiedBuffer.indexOf(origBytes);
        if (scanIdx !== -1) {
          replBytes.copy(modifiedBuffer, scanIdx);
          appliedCount++;
          onLog?.(`[Patch Hex] Padrão localizado no deslocamento 0x${scanIdx.toString(16).toUpperCase()}: aplicado com sucesso!`);
        } else {
          onLog?.(`[Aviso] Padrão ${patch.originalBytes} não localizado na DLL. Patch ignorado com segurança.`);
        }
      } catch (err: any) {
        onLog?.(`[Erro] Falha ao aplicar patch: ${err.message}`);
      }
    }

    return { modifiedBuffer, appliedCount };
  }

  /**
   * Modernizes PE Header (TimeDateStamp) and SKSEPlugin_VersionData struct
   * to bypass SKSE 2.3+ legacy gatekeeper check ("must be recompiled for new address library")
   * and enable native execution of pre-1.6.1130 Address Library plugins.
   */
  public modernizePePlugin(
    dllBuffer: Buffer,
    gameVersion?: string,
    onLog?: (msg: string) => void
  ): { modifiedBuffer: Buffer; patchedCount: number } {
    let modifiedBuffer = Buffer.from(dllBuffer);
    let patchedCount = 0;

    if (modifiedBuffer.length < 64 || modifiedBuffer.readUInt16LE(0) !== 0x5a4d) {
      return { modifiedBuffer, patchedCount };
    }

    const peOffset = modifiedBuffer.readInt32LE(0x3c);
    if (
      peOffset + 24 > modifiedBuffer.length ||
      modifiedBuffer.subarray(peOffset, peOffset + 4).toString('ascii') !== 'PE\0\0'
    ) {
      return { modifiedBuffer, patchedCount };
    }

    // 1. Modernize PE TimeDateStamp if older than May 2025 (0x6833aeff)
    // SKSE 2.3+ tests: TimeDateStamp - 0x1f008600 > 0x493328ff (i.e. > 0x6833aeff).
    // Updating timestamp to 0x69000000 ensures legacy gatekeeper check unconditionally succeeds.
    const oldTimestamp = modifiedBuffer.readUInt32LE(peOffset + 8);
    const MODERN_TIMESTAMP = 0x69000000;
    if (oldTimestamp <= 0x6833aeff) {
      modifiedBuffer.writeUInt32LE(MODERN_TIMESTAMP, peOffset + 8);
      patchedCount++;
      onLog?.(
        `[Modernização PE] TimeDateStamp atualizado de 0x${oldTimestamp.toString(16)} para 0x${MODERN_TIMESTAMP.toString(16)} (Bypass da trava do SKSE 2.3+)`
      );
    }

    // 2. Parse PE Export Directory to locate SKSEPlugin_Version
    const optHeaderOffset = peOffset + 24;
    const magic = modifiedBuffer.readUInt16LE(optHeaderOffset);
    const is64 = magic === 0x20b;
    const exportTableDirOffset = optHeaderOffset + (is64 ? 112 : 96);

    const exportRva = modifiedBuffer.readUInt32LE(exportTableDirOffset);
    const exportSize = modifiedBuffer.readUInt32LE(exportTableDirOffset + 4);

    const numSections = modifiedBuffer.readUInt16LE(peOffset + 6);
    const optHeaderSize = modifiedBuffer.readUInt16LE(peOffset + 20);
    const sectionHeadersOffset = optHeaderOffset + optHeaderSize;

    const rvaToFileOffset = (rva: number): number => {
      for (let i = 0; i < numSections; i++) {
        const sOff = sectionHeadersOffset + i * 40;
        if (sOff + 40 > modifiedBuffer.length) break;
        const vSize = modifiedBuffer.readUInt32LE(sOff + 8);
        const vAddr = modifiedBuffer.readUInt32LE(sOff + 12);
        const rSize = modifiedBuffer.readUInt32LE(sOff + 16);
        const rOffset = modifiedBuffer.readUInt32LE(sOff + 20);
        if (rva >= vAddr && rva < vAddr + Math.max(vSize, rSize)) {
          return rOffset + (rva - vAddr);
        }
      }
      return 0;
    };

    let versionStructOff = 0;

    if (exportRva > 0 && exportSize > 0) {
      const exportFileOff = rvaToFileOffset(exportRva);
      if (exportFileOff > 0 && exportFileOff + 40 <= modifiedBuffer.length) {
        const numNames = modifiedBuffer.readUInt32LE(exportFileOff + 24);
        const funcsRva = modifiedBuffer.readUInt32LE(exportFileOff + 28);
        const namesRva = modifiedBuffer.readUInt32LE(exportFileOff + 32);
        const ordsRva = modifiedBuffer.readUInt32LE(exportFileOff + 36);

        const funcsOff = rvaToFileOffset(funcsRva);
        const namesOff = rvaToFileOffset(namesRva);
        const ordsOff = rvaToFileOffset(ordsRva);

        if (namesOff > 0 && funcsOff > 0 && ordsOff > 0) {
          for (let i = 0; i < numNames; i++) {
            if (namesOff + (i + 1) * 4 > modifiedBuffer.length) break;
            const nameRva = modifiedBuffer.readUInt32LE(namesOff + i * 4);
            const nameOff = rvaToFileOffset(nameRva);
            if (nameOff === 0 || nameOff >= modifiedBuffer.length) continue;

            let exportName = '';
            for (let j = nameOff; j < modifiedBuffer.length && modifiedBuffer[j] !== 0; j++) {
              exportName += String.fromCharCode(modifiedBuffer[j]);
            }

            if (exportName === 'SKSEPlugin_Version') {
              const ord = modifiedBuffer.readUInt16LE(ordsOff + i * 2);
              const funcRva = modifiedBuffer.readUInt32LE(funcsOff + ord * 4);
              versionStructOff = rvaToFileOffset(funcRva);
              break;
            }
          }
        }
      }
    }

    // 3. Fallback heuristic: if export wasn't found by name, scan for SKSEPlugin_VersionData pattern
    // Struct layout: dataVersion (1), pluginVersion, name[256], author[256], supportEmail[256],
    // structureIndependence (+0x304), addressIndependence (+0x308)
    if (versionStructOff === 0) {
      for (let i = 0; i < numSections; i++) {
        const sOff = sectionHeadersOffset + i * 40;
        if (sOff + 40 > modifiedBuffer.length) break;
        const rSize = modifiedBuffer.readUInt32LE(sOff + 16);
        const rOffset = modifiedBuffer.readUInt32LE(sOff + 20);
        if (rOffset === 0 || rOffset + rSize > modifiedBuffer.length) continue;

        for (let p = rOffset; p + 0x350 <= rOffset + rSize; p += 8) {
          if (
            modifiedBuffer.readUInt32LE(p) === 1 &&
            modifiedBuffer.readUInt32LE(p + 0x308) === 1
          ) {
            const indep = modifiedBuffer.readUInt32LE(p + 0x304);
            if (indep === 0 || indep === 1) {
              versionStructOff = p;
              break;
            }
          }
        }
        if (versionStructOff > 0) break;
      }
    }

    // 4. Modernize SKSEPlugin_VersionData struct
    if (versionStructOff > 0 && versionStructOff + 0x350 <= modifiedBuffer.length) {
      const dataVersion = modifiedBuffer.readUInt32LE(versionStructOff);
      if (dataVersion === 1) {
        // Flag bit 0: kVersionIndependent_Signatures (1)
        // Flag bit 1: kVersionIndependent_Structs (2) -> REQUIRED by SKSE 2.3+ for 1.6.1130+ / 1.7+
        const oldStructureIndep = modifiedBuffer.readUInt32LE(versionStructOff + 0x304);
        const newStructureIndep = oldStructureIndep | 3;
        if (oldStructureIndep !== newStructureIndep) {
          modifiedBuffer.writeUInt32LE(newStructureIndep, versionStructOff + 0x304);
          patchedCount++;
          onLog?.(
            `[Modernização SKSE] Estrutura SKSEPlugin_Version: ativado kVersionIndependent_Structs (0x${oldStructureIndep.toString(16)} ➔ 0x${newStructureIndep.toString(16)})`
          );
        }

        const oldAddressIndep = modifiedBuffer.readUInt32LE(versionStructOff + 0x308);
        const newAddressIndep = oldAddressIndep | 1;
        if (oldAddressIndep !== newAddressIndep) {
          modifiedBuffer.writeUInt32LE(newAddressIndep, versionStructOff + 0x308);
          patchedCount++;
          onLog?.(
            `[Modernização SKSE] Estrutura SKSEPlugin_Version: confirmado kAddressLibrary (0x${newAddressIndep.toString(16)})`
          );
        }

        // Add packed version of target game version (e.g. 1.7.104.0 -> 0x01070680)
        if (gameVersion) {
          const parts = gameVersion.split('.').map((n) => parseInt(n, 10) || 0);
          if (parts.length >= 3) {
            const major = parts[0] || 0;
            const minor = parts[1] || 0;
            const build = parts[2] || 0;
            const sub = parts[3] || 0;
            const packed =
              ((major & 0xff) << 24) |
              ((minor & 0xff) << 16) |
              ((build & 0xfff) << 4) |
              (sub & 0xf);

            let hasVer = false;
            let emptySlot = -1;
            for (let k = 0; k < 16; k++) {
              const existingVer = modifiedBuffer.readUInt32LE(versionStructOff + 0x30c + k * 4);
              if (existingVer === packed) {
                hasVer = true;
                break;
              }
              if (existingVer === 0 && emptySlot === -1) {
                emptySlot = k;
              }
            }

            if (!hasVer && emptySlot !== -1) {
              modifiedBuffer.writeUInt32LE(packed, versionStructOff + 0x30c + emptySlot * 4);
              patchedCount++;
              onLog?.(
                `[Modernização SKSE] Skyrim v${gameVersion} (0x${packed.toString(16)}) registrado na lista de versões compatíveis`
              );
            }
          }
        }
      }
    }

    return { modifiedBuffer, patchedCount };
  }

  /**
   * Full Transmutation Pipeline (No-Code Legacy Mod Compatibility)
   */
  async transmuteMod(
    options: TransmuteOptions,
    onLog: (text: string, type: 'info' | 'warn' | 'error' | 'success') => void
  ): Promise<TransmuteResult> {
    const startTime = Date.now();
    const { inputFilePath, skyrimDir, convertAddressLibrary = true, applyHexPatches = true, createZipPackage = true } = options;

    onLog(`Iniciando Transmutação do Mod: ${path.basename(inputFilePath)}...`, 'info');

    const targetSkyrim = skyrimDir || (await this.detectSkyrimInstallations())[0]?.path;
    const installs = await this.detectSkyrimInstallations();
    const matchedInstall = installs.find((i) => targetSkyrim && i.path.toLowerCase() === targetSkyrim.toLowerCase()) || installs[0];
    const targetGameVersion = options.gameVersion || matchedInstall?.gameVersion || '1.7.104.0';
    let workingDllPath = inputFilePath;
    let tempDir: string | null = null;
    const generatedArtifacts: string[] = [];

    // 1. Extract if ZIP
    if (inputFilePath.toLowerCase().endsWith('.zip')) {
      onLog('Arquivo compactado (.zip) detectado. Extraindo conteúdo...', 'info');
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-transmute-'));
      this.extractZip(inputFilePath, tempDir);
      const dlls = this.findFiles(tempDir, (f) => f.toLowerCase().endsWith('.dll'));
      if (dlls.length === 0) {
        throw new Error('Nenhuma biblioteca DLL encontrada dentro do pacote ZIP.');
      }
      workingDllPath = dlls.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
      onLog(`DLL principal identificada: ${path.basename(workingDllPath)}`, 'info');
    }

    const modName = path.basename(workingDllPath, '.dll');

    // 2. Analyze Binary
    onLog(`Executando análise heurística e inspeção de cabeçalhos PE em ${path.basename(workingDllPath)}...`, 'info');
    const analysis = await this.analyzeBinary(workingDllPath);
    onLog(`Arquitetura: ${analysis.architecture} | Hash SHA256: ${analysis.sha256.slice(0, 16)}...`, 'info');
    onLog(`Diagnóstico de Estabilidade: ${analysis.riskLevel.toUpperCase()} (Pontuação de Risco: ${analysis.riskScore}/100)`, analysis.riskLevel === 'high' ? 'warn' : 'info');
    onLog(analysis.riskSummary, 'info');

    // 3. Apply Hex Recipes if matched
    let appliedPatchesResult: { recipeName: string; patchesApplied: number } | null = null;
    let currentDllBuffer: Buffer = Buffer.from(fs.readFileSync(workingDllPath));

    if (applyHexPatches && analysis.matchedRecipe) {
      onLog(`Receita compatível encontrada: "${analysis.matchedRecipe.name}". Aplicando correções binárias...`, 'info');
      const { modifiedBuffer, appliedCount } = this.applyHexPatches(
        currentDllBuffer,
        analysis.matchedRecipe,
        (msg) => onLog(msg, 'info')
      );
      if (appliedCount > 0) {
        currentDllBuffer = Buffer.from(modifiedBuffer);
        appliedPatchesResult = {
          recipeName: analysis.matchedRecipe.name,
          patchesApplied: appliedCount,
        };
        onLog(`Sucesso: ${appliedCount} correções binárias aplicadas com êxito!`, 'success');
      }
    }

    // 3.1. Universal Heuristic CommonLibSSE Modernization Patches
    let hasPattern4Redirect = false;
    if (applyHexPatches) {
      let universalPatches = 0;

      // Pattern 1: 66 83 f8 06 0f 95 c0 fe c0 -> replace 0f 95 c0 with 0f 9c c0 (cmp ax, 6; setl al; inc al)
      const p1 = Buffer.from('6683f8060f95c0fec0', 'hex');
      const r1 = Buffer.from('6683f8060f9cc0fec0', 'hex');
      let idx1 = currentDllBuffer.indexOf(p1);
      while (idx1 !== -1) {
        r1.copy(currentDllBuffer, idx1);
        universalPatches++;
        onLog(`[Transmutação Hex] Injetada correção de runtime Skyrim 1.7+ (AE) no offset 0x${idx1.toString(16).toUpperCase()} (setne -> setl)`, 'info');
        idx1 = currentDllBuffer.indexOf(p1, idx1 + r1.length);
      }

      // Pattern 2: 83 f8 06 0f 95 c0 fe c0 -> replace 0f 95 c0 with 0f 9c c0
      const p2 = Buffer.from('83f8060f95c0fec0', 'hex');
      const r2 = Buffer.from('83f8060f9cc0fec0', 'hex');
      let idx2 = currentDllBuffer.indexOf(p2);
      while (idx2 !== -1) {
        r2.copy(currentDllBuffer, idx2);
        universalPatches++;
        onLog(`[Transmutação Hex] Injetada correção de runtime Skyrim 1.7+ (AE) 32-bit no offset 0x${idx2.toString(16).toUpperCase()}`, 'info');
        idx2 = currentDllBuffer.indexOf(p2, idx2 + r2.length);
      }

      // Pattern 3: 3d 06 00 00 00 0f 95 c0 fe c0 -> replace 0f 95 c0 with 0f 9c c0
      const p3 = Buffer.from('3d060000000f95c0fec0', 'hex');
      const r3 = Buffer.from('3d060000000f9cc0fec0', 'hex');
      let idx3 = currentDllBuffer.indexOf(p3);
      while (idx3 !== -1) {
        r3.copy(currentDllBuffer, idx3);
        universalPatches++;
        onLog(`[Transmutação Hex] Injetada correção de runtime Skyrim 1.7+ (AE) no offset 0x${idx3.toString(16).toUpperCase()}`, 'info');
        idx3 = currentDllBuffer.indexOf(p3, idx3 + r3.length);
      }

      // Pattern 4: Redirect Address Library filename to avoid colliding with official Format 5 files in Vortex / Data
      // Replaces "versionlib-" with "versionlb2-" (EXACT 11-byte match to strictly preserve std::string_view compile-time length 35)
      const targets = [
        Buffer.from('Data/SKSE/Plugins/versionlib-{}.bin', 'utf8'),
        Buffer.from('Data\\SKSE\\Plugins\\versionlib-{}.bin', 'utf8'),
        Buffer.from('versionlib-{}.bin', 'utf8'),
      ];
      for (const target of targets) {
        const replacement = Buffer.from(
          target.toString('utf8').replace('versionlib-', 'versionlb2-'),
          'utf8'
        );
        let sIdx = currentDllBuffer.indexOf(target);
        while (sIdx !== -1) {
          replacement.copy(currentDllBuffer, sIdx);
          universalPatches++;
          hasPattern4Redirect = true;
          onLog(`[Transmutação Hex] Redirecionada busca da Address Library para base isolada sem conflito: versionlb2-{}.bin no offset 0x${sIdx.toString(16).toUpperCase()}`, 'info');
          sIdx = currentDllBuffer.indexOf(target, sIdx + replacement.length);
        }
      }

      // Pattern 5: CommonLibSSE SKSE::log::log_directory() Null Pointer Crash Bypass
      // In Skyrim 1.6.1130+, 1.6.1170+, and 1.7.104.0, VariantID(508778, 380738) offset is 0,
      // which causes dereferencing *appName to crash with 0xC0000005 inside SKSEPlugin_Load.
      // This patch bypasses the null dereference and directly supplies "Skyrim Special Edition\0" to path::append.
      const pLog1 = Buffer.from('6ac30700', 'hex'); // 508778 (SE ID)
      const pLog2 = Buffer.from('42cf0500', 'hex'); // 380738 (AE ID)
      let logIdx = 0;
      while ((logIdx = currentDllBuffer.indexOf(pLog1, logIdx)) !== -1) {
        if (
          logIdx >= 4 &&
          currentDllBuffer[logIdx - 4] === 0x48 &&
          currentDllBuffer[logIdx - 3] === 0xc7 &&
          currentDllBuffer[logIdx - 2] === 0x45 &&
          currentDllBuffer[logIdx + 4] === 0x48 &&
          currentDllBuffer[logIdx + 5] === 0xc7 &&
          currentDllBuffer[logIdx + 6] === 0x45 &&
          currentDllBuffer[logIdx + 8] === 0x42 &&
          currentDllBuffer[logIdx + 9] === 0xcf &&
          currentDllBuffer[logIdx + 10] === 0x05 &&
          currentDllBuffer[logIdx + 11] === 0x00
        ) {
          const disp1 = currentDllBuffer[logIdx - 1];
          const disp2 = currentDllBuffer[logIdx + 7];
          const pStart = logIdx - 4;
          const pTarget = currentDllBuffer.indexOf(Buffer.from('4533c0', 'hex'), pStart);
          if (pTarget !== -1 && pTarget - pStart >= 47 && pTarget - pStart <= 128) {
            const patchBuf = Buffer.alloc(pTarget - pStart, 0x90);
            let ptr = 0;
            patchBuf.write('488d0d11000000', ptr, 'hex'); ptr += 7; // lea rcx, [rip + 17]
            patchBuf.write('48894d' + Buffer.from([disp1]).toString('hex'), ptr, 'hex'); ptr += 4; // mov [rbp+disp1], rcx
            patchBuf.write('48c745' + Buffer.from([disp2]).toString('hex') + '16000000', ptr, 'hex'); ptr += 8; // mov [rbp+disp2], 22
            const relJump = pTarget - (pStart + ptr + 5);
            patchBuf.writeUInt8(0xe9, ptr++);
            patchBuf.writeInt32LE(relJump, ptr); ptr += 4;
            const appStr = Buffer.from('Skyrim Special Edition\0', 'utf8');
            appStr.copy(patchBuf, ptr); ptr += appStr.length;

            patchBuf.copy(currentDllBuffer, pStart);
            universalPatches++;
            onLog(
              `[Transmutação Hex] Injetado bypass de null-dereference em SKSE::log::log_directory() no offset 0x${pStart.toString(16).toUpperCase()}`,
              'info'
            );
          }
        }
        logIdx += 4;
      }

      if (universalPatches > 0) {
        if (!appliedPatchesResult) {
          appliedPatchesResult = {
            recipeName: 'Modernização Universal CommonLibSSE (AE Runtime 1.7+)',
            patchesApplied: universalPatches,
          };
        } else {
          appliedPatchesResult.patchesApplied += universalPatches;
        }
        onLog(`Sucesso: ${universalPatches} modernizações de runtime CommonLibSSE injetadas no binário!`, 'success');
      }

      // 3.2. Universal SKSEPlugin_VersionData and PE Header Modernizer (CompaSSE-equivalent gatekeeper bypass)
      // Ensures plugins built prior to Skyrim 1.6.1130 pass the SKSE 2.3+ gatekeeper check
      // ("must be recompiled for new address library") by activating kVersionIndependent_Structs,
      // confirming kAddressLibrary, registering target Skyrim version, and modernizing PE TimeDateStamp.
      const { modifiedBuffer: modernizedBuffer, patchedCount: pePatches } = this.modernizePePlugin(
        currentDllBuffer,
        targetGameVersion,
        (msg) => onLog(msg, 'info')
      );
      if (pePatches > 0) {
        currentDllBuffer = modernizedBuffer;
        if (!appliedPatchesResult) {
          appliedPatchesResult = {
            recipeName: 'Modernização de Cabeçalho PE e SKSEPlugin_VersionData',
            patchesApplied: pePatches,
          };
        } else {
          appliedPatchesResult.patchesApplied += pePatches;
        }
        onLog(`Sucesso: ${pePatches} modernizações de cabeçalho PE / SKSE aplicadas para ignorar trava do loader!`, 'success');
      }
    }

    // 4. Output structure (clean staging folder first to prevent stale files)
    const outputDir = options.outputDir || path.join(process.cwd(), 'dist', 'Transmuted');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const packageDir = path.join(outputDir, `${modName}_Transmuted`);
    if (fs.existsSync(packageDir)) {
      try {
        fs.rmSync(packageDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    const sksePluginsDir = path.join(packageDir, 'SKSE', 'Plugins');
    fs.mkdirSync(sksePluginsDir, { recursive: true });

    // 5. Safe Address Library Conversion (Format 5 -> Format 2)
    // Converted databases are written EXCLUSIVELY to the mod package staging directory (sksePluginsDir).
    // The user's Skyrim game directory is strictly treated as READ-ONLY and NEVER modified!
    let convResult: AddressLibraryConversionResult | undefined;
    if (convertAddressLibrary && targetSkyrim) {
      const gamePluginsDir = path.join(targetSkyrim, 'Data', 'SKSE', 'Plugins');
      if (fs.existsSync(gamePluginsDir)) {
        const binFiles = fs.readdirSync(gamePluginsDir).filter((f) => f.endsWith('.bin'));
        const format5Files = binFiles.filter((f) => {
          try {
            const full = path.join(gamePluginsDir, f);
            const fd = fs.openSync(full, 'r');
            const buf = Buffer.alloc(4);
            fs.readSync(fd, buf, 0, 4, 0);
            fs.closeSync(fd);
            return buf.readInt32LE(0) === 5;
          } catch {
            return false;
          }
        });

        if (format5Files.length > 0) {
          // Sort format5Files numerically so target game version (e.g. 1.7.104.0) is converted last
          // ensuring convResult and user UI summary displays the active installed game version
          format5Files.sort((a, b) => {
            const aIsTarget = targetGameVersion && a.includes(targetGameVersion.replace(/\./g, '-'));
            const bIsTarget = targetGameVersion && b.includes(targetGameVersion.replace(/\./g, '-'));
            if (aIsTarget && !bIsTarget) return 1;
            if (!aIsTarget && bIsTarget) return -1;
            return a.localeCompare(b, undefined, { numeric: true });
          });

          onLog(`Detectadas ${format5Files.length} bases modernas Address Library Formato 5 na instalação do jogo (leitura segura sem modificar o jogo).`, 'info');
          onLog(`Convertendo para Formato 2 diretamente no pacote isolado do mod (SKSE/Plugins)... (sem tocar no jogo)`, 'info');
          let targetConvResult: AddressLibraryConversionResult | undefined;
          for (const f5 of format5Files) {
            const srcPath = path.join(gamePluginsDir, f5);
            const targetBinPath = path.join(sksePluginsDir, f5);
            const currentConv = await this.convertFormat5ToFormat2(srcPath, targetBinPath);
            convResult = currentConv;
            if (targetGameVersion && f5.includes(targetGameVersion.replace(/\./g, '-'))) {
              targetConvResult = currentConv;
            }
            
            // Generate the isolated versionlb2- companion to prevent any overwrite conflicts in Vortex
            const lb2Name = f5.replace(/^versionlib-/, 'versionlb2-');
            const lb2Path = path.join(sksePluginsDir, lb2Name);
            if (!fs.existsSync(lb2Path) && fs.existsSync(currentConv.outputFile)) {
              fs.copyFileSync(currentConv.outputFile, lb2Path);
              generatedArtifacts.push(lb2Path);
            }

            if (currentConv.companionFile && fs.existsSync(currentConv.companionFile)) {
              generatedArtifacts.push(currentConv.companionFile);
            }

            // CRITICAL VORTEX OPTIMIZATION:
            // When the DLL has been redirected to seek versionlb2-*.bin, we remove versionlib-*.bin
            // from the mod package. This completely prevents Vortex from detecting an unresolved file conflict
            // with the official Address Library All in One mod, while letting the legacy DLL load its isolated database!
            if (hasPattern4Redirect) {
              try {
                if (fs.existsSync(targetBinPath)) {
                  fs.unlinkSync(targetBinPath);
                }
              } catch {
                // ignore
              }
            } else {
              generatedArtifacts.push(currentConv.outputFile);
            }
          }
          if (targetConvResult) {
            convResult = targetConvResult;
          }
          onLog(`Bases Address Library (Formato 2 legado) geradas no pacote isolado para MO2/Vortex com sucesso!`, 'success');
        } else {
          onLog('Nenhuma base da Address Library Formato 5 detectada para conversão.', 'info');
        }
      }
    }

    // 6. Write modified DLL
    const destDllPath = path.join(sksePluginsDir, path.basename(workingDllPath));
    fs.writeFileSync(destDllPath, currentDllBuffer);
    generatedArtifacts.push(destDllPath);

    // 7. Copy accompanying mod files and folders, strictly preserving directory hierarchy
    const isValidConfig = (fileName: string): boolean => {
      const lower = fileName.toLowerCase();
      // Block Windows system files, personal files, text notes, logs, backups
      if (
        lower === 'desktop.ini' ||
        lower === 'thumbs.db' ||
        lower.endsWith('.txt') ||
        lower.endsWith('.bak') ||
        lower.endsWith('.log') ||
        lower.startsWith('.')
      ) {
        return false;
      }
      return true;
    };

    if (tempDir) {
      // Find mod root inside tempDir (where SKSE/ exists, or Data/ exists, or mod root)
      let modRoot = tempDir;
      const findModRoot = (dir: string, depth = 0): string | null => {
        if (depth > 4) return null;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory()) {
              const lower = ent.name.toLowerCase();
              if (lower === 'skse') {
                return dir; // parent of SKSE is mod root
              }
              const found = findModRoot(path.join(dir, ent.name), depth + 1);
              if (found) return found;
            }
          }
        } catch {
          // ignore
        }
        return null;
      };

      const detectedModRoot = findModRoot(tempDir);
      if (detectedModRoot) {
        modRoot = detectedModRoot;
      }

      // Recursively copy all mod assets (fonts, configs, interface, scripts) preserving exact hierarchy
      const copyModTree = (srcDir: string, destDir: string) => {
        const entries = fs.readdirSync(srcDir, { withFileTypes: true });
        for (const ent of entries) {
          const srcPath = path.join(srcDir, ent.name);
          const destPath = path.join(destDir, ent.name);
          const lowerName = ent.name.toLowerCase();

          // Skip OS junk files
          if (lowerName === 'desktop.ini' || lowerName === 'thumbs.db' || lowerName.startsWith('.')) {
            continue;
          }

          if (ent.isDirectory()) {
            if (!fs.existsSync(destPath)) {
              fs.mkdirSync(destPath, { recursive: true });
            }
            copyModTree(srcPath, destPath);
          } else if (ent.isFile()) {
            // Do NOT overwrite the newly modernized/transmuted DLL with the original legacy DLL
            if (lowerName === path.basename(workingDllPath).toLowerCase()) {
              continue;
            }
            // Do NOT copy old format 5 or legacy bin files from the original zip
            if (lowerName.endsWith('.bin')) {
              continue;
            }
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            generatedArtifacts.push(destPath);
            onLog(`Arquivo preservado do mod original: ${path.relative(packageDir, destPath)}`, 'info');
          }
        }
      };

      copyModTree(modRoot, packageDir);
    } else {
      // If input was a loose DLL, look in DLL directory for accompanying configs and subdirectories
      const candidateDirs = [
        path.dirname(inputFilePath),
        path.join(path.dirname(inputFilePath), '..', 'data'),
      ];
      for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        if (this.isGameDirectory(dir)) continue;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const ent of entries) {
            const lowerName = ent.name.toLowerCase();
            const lowerMod = modName.toLowerCase();
            if (lowerName === 'desktop.ini' || lowerName === 'thumbs.db' || lowerName.startsWith('.')) continue;

            // If there's an accompanying folder (e.g. dmenu/)
            if (ent.isDirectory() && lowerName === lowerMod) {
              const srcSubDir = path.join(dir, ent.name);
              const destSubDir = path.join(sksePluginsDir, ent.name);
              const copySub = (s: string, d: string) => {
                if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                for (const item of fs.readdirSync(s, { withFileTypes: true })) {
                  const sP = path.join(s, item.name);
                  const dP = path.join(d, item.name);
                  if (item.isDirectory()) copySub(sP, dP);
                  else if (item.isFile()) {
                    fs.copyFileSync(sP, dP);
                    generatedArtifacts.push(dP);
                  }
                }
              };
              copySub(srcSubDir, destSubDir);
              onLog(`Diretório de recursos do mod incluído: ${ent.name}`, 'info');
            } else if (ent.isFile() && isValidConfig(ent.name)) {
              const ext = path.extname(lowerName);
              if (ext === '.ini' || ext === '.toml' || ext === '.json' || ext === '.csv') {
                const baseWithoutExt = path.parse(ent.name).name.toLowerCase();
                if (
                  baseWithoutExt === lowerMod ||
                  baseWithoutExt.startsWith(lowerMod + '_') ||
                  baseWithoutExt.startsWith(lowerMod + '.')
                ) {
                  const srcComp = path.join(dir, ent.name);
                  const destComp = path.join(sksePluginsDir, ent.name);
                  fs.copyFileSync(srcComp, destComp);
                  generatedArtifacts.push(destComp);
                  onLog(`Arquivo de configuração do mod incluído: ${ent.name}`, 'info');
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // 6. Create ZIP package for MO2 / Vortex
    let zipPackagePath: string | undefined;
    if (createZipPackage) {
      const zipName = `${modName}_Transmuted_MO2.zip`;
      zipPackagePath = path.join(outputDir, zipName);
      onLog(`Gerando pacote ZIP para Mod Organizer 2 e Vortex: ${zipName}...`, 'info');
      await this.createZipArchive(packageDir, zipPackagePath);
      generatedArtifacts.push(zipPackagePath);
      onLog(`Pacote final gerado com sucesso: ${zipPackagePath}`, 'success');
    }

    // Clean up temp
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    const durationMs = Date.now() - startTime;
    onLog(`Processo de Transmutação concluído com êxito em ${(durationMs / 1000).toFixed(2)}s!`, 'success');

    return {
      success: true,
      modName,
      targetDllPath: destDllPath,
      analysis,
      appliedPatches: appliedPatchesResult,
      convertedAddressLibrary: convResult,
      zipPackagePath,
      generatedArtifacts,
      durationMs,
    };
  }

  /**
   * Helper to extract a zip file
   */
  private extractZip(zipPath: string, destDir: string): void {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'ignore' });
    } catch {
      // Fallback via PowerShell
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
        stdio: 'ignore',
      });
    }
  }

  /**
   * Helper to create zip archive
   */
  private createZipArchive(sourceDir: string, destinationZip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destinationZip);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Helper to find files recursively
   */
  private findFiles(dir: string, predicate: (filePath: string) => boolean, depth = 0): string[] {
    if (depth > 6 || !fs.existsSync(dir)) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findFiles(full, predicate, depth + 1));
        } else if (entry.isFile() && predicate(full)) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }
}
