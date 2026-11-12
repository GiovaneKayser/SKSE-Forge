import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { shell, clipboard } from 'electron';
import { BinaryCompatibilityService } from './BinaryCompatibilityService';

export interface BuildOptions {
  projectDir: string;
  sourceDir?: string;
  cmakeBinary: string;
  vcpkgToolchain?: string;
  modName: string;
  patchEngine?: any;
  clean?: boolean;
}

export interface BuildResult {
  success: boolean;
  dllPath: string;
  distDir: string;
  zipPath: string;
  modName: string;
  durationMs: number;
  filesPackaged: string[];
}

export class BuildService {
  private activeProcess: ChildProcess | null = null;
  private isCancelled = false;

  /**
   * Cancel ongoing build process
   */
  cancelCurrentBuild(): void {
    this.isCancelled = true;
    if (this.activeProcess && this.activeProcess.pid) {
      const pid = this.activeProcess.pid;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
        } else {
          this.activeProcess.kill('SIGKILL');
        }
      } catch (err) {
        console.error('Failed to cancel build process:', err);
      }
      this.activeProcess = null;
    }
  }

  /**
   * Execute full configure + build + package pipeline
   */
  async buildAndPackage(
    options: BuildOptions,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info' | 'warn' | 'error' | 'success') => void
  ): Promise<BuildResult> {
    const startTime = Date.now();
    this.isCancelled = false;

    const { projectDir, cmakeBinary, vcpkgToolchain, modName } = options;
    const buildDir = path.join(projectDir, 'build');

    // 0. CLEANUP: Clear any broken/cached vcpkg port build and binary directories only on explicit clean
    if (options.clean) {
      const cleanupTargets = [
        path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'blds', 'commonlibsse-ng'),
        path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'blds', 'commonlibsse'),
        path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'pkgs', 'commonlibsse-ng_x64-windows-static-md'),
        path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'pkgs', 'commonlibsse_x64-windows-static-md'),
      ];
      for (const target of cleanupTargets) {
        if (fs.existsSync(target)) {
          try {
            fs.rmSync(target, { recursive: true, force: true });
            onLog(`[vcpkg] Limpo cache de compilação anterior em: ${target}`, 'info');
          } catch {
            // ignore if locked
          }
        }
      }
    }

    // 1. PHASE: CONFIGURE
    const sourceDir = options.sourceDir || projectDir;
    onLog(`[CMake] Iniciando configuração do projeto em: ${projectDir} (Origem CMake: ${sourceDir})`, 'info');

    const cmakeArgs = [
      '-B',
      'build',
      '-S',
      sourceDir,
      '-DCMAKE_BUILD_TYPE=Release',
      '-DVCPKG_TARGET_TRIPLET=x64-windows-static-md',
      '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>DLL',
      '-DENABLE_SKYRIM_SE=ON',
      '-DENABLE_SKYRIM_AE=ON',
    ];

    // Check for local overlay ports in sourceDir or projectDir
    const overlayCandidates = [
      path.join(sourceDir, 'overlayports'),
      path.join(sourceDir, 'ports'),
      path.join(sourceDir, 'cmake', 'ports'),
      path.join(projectDir, 'overlayports'),
      path.join(projectDir, 'ports'),
      path.join(projectDir, 'cmake', 'ports'),
    ];
    for (const cand of overlayCandidates) {
      if (fs.existsSync(cand)) {
        cmakeArgs.push(`-DVCPKG_OVERLAY_PORTS=${cand}`);
        onLog(`[CMake] Overlay ports ativo para CommonLibSSE-NG: ${cand}`, 'info');
        break;
      }
    }

    if (vcpkgToolchain && fs.existsSync(vcpkgToolchain)) {
      cmakeArgs.push(`-DCMAKE_TOOLCHAIN_FILE=${vcpkgToolchain}`);
      onLog(`[CMake] Toolchain vcpkg vinculada: ${vcpkgToolchain}`, 'info');
      onLog(`[CMake] Triplet estático configurado: x64-windows-static-md (autocontido, CRT dinâmico /MD)`, 'info');
    }

    onLog(`[CMake] Suporte Address Library Format 5 ativo: ENABLE_SKYRIM_SE=ON, ENABLE_SKYRIM_AE=ON`, 'info');

    // Set 64-bit architecture for Skyrim SE/AE MSVC generator
    cmakeArgs.push('-A', 'x64');

    // Execução da Fase 1 - TÉCNICA 1: TÉCNICA PRIMÁRIA (PADRÃO)
    let configureSuccess = false;
    let configureLogHistory: string[] = [];

    const captureConfigureLog = (line: string, type: 'stdout' | 'stderr') => {
      configureLogHistory.push(line);
      onLog(`[CMake Configure] ${line}`, type);
    };

    try {
      onLog(`[CMake] Executando configuração com Técnica Primária (padrão)...`, 'info');
      await this.runProcess(
        cmakeBinary,
        cmakeArgs,
        projectDir,
        captureConfigureLog
      );
      configureSuccess = true;
      onLog(`[CMake] Configuração da Técnica Primária concluída com sucesso!`, 'success');
    } catch (err: any) {
      if (this.isCancelled) {
        throw new Error('Operação de configuração cancelada pelo usuário.');
      }
      onLog(`[Aviso] Falha na Técnica Primária: ${err.message}`, 'warn');
    }

    // SE A TÉCNICA 1 FALHAR -> ATIVAR NOVA TÉCNICA (TÉCNICA 2 - AUTO-HEALING PROGRESSIVO)
    if (!configureSuccess) {
      onLog(`[Auto-Healing] Ativando Nova Técnica de Recuperação e Mitigação de Ambiente...`, 'warn');

      const fullLogText = configureLogHistory.join('\n');
      const isPathLengthIssue = /C1083|CMAKE_OBJECT_PATH_MAX|object file directory|TryCompile|Invalid argument|testCXXCompiler/i.test(fullLogText);
      const missingPackageMatch = fullLogText.match(/Could not find a package configuration file provided by "([A-Za-z0-9_-]+)"/i);
      const isHashMismatch = /unexpected hash/i.test(fullLogText);
      const isCommonLibSymbolIssue = /GetRuntimeData2|WinAPI|RUNTIME_SSE_1_6_1130|REL::Module::reset/i.test(fullLogText);

      // Tratamento A: Hash mismatch no download do vcpkg (GitHub tarball checksum update)
      if (isHashMismatch && options.patchEngine) {
        options.patchEngine.fixVcpkgHashMismatch(projectDir, fullLogText, (line: string, type: any) => onLog(line, type));
      }

      // Tratamento B: Dependência ausente do CMakeLists.txt não declarada no manifesto vcpkg
      if (missingPackageMatch && missingPackageMatch[1] && options.patchEngine) {
        const missingPkg = missingPackageMatch[1];
        options.patchEngine.injectMissingVcpkgDependency(projectDir, missingPkg, (line: string, type: any) => onLog(line, type));
      }

      // Tratamento C: Upgrade para CommonLibSSE-NG 4.0.0+ se símbolos modernos faltarem
      if (isCommonLibSymbolIssue && options.patchEngine) {
        options.patchEngine.upgradeToModernCommonLibVR(projectDir, (line: string, type: any) => onLog(line, type));
      }

      // Tratamento D: Isolamento de caminhos curtos (Short Paths) para vcpkg buildtrees e packages (mitigação definitiva de MAX_PATH)
      let shortBlds = 'C:\\sf_blds';
      let shortPkgs = 'C:\\sf_pkgs';
      try {
        if (!fs.existsSync(shortBlds)) fs.mkdirSync(shortBlds, { recursive: true });
        if (!fs.existsSync(shortPkgs)) fs.mkdirSync(shortPkgs, { recursive: true });
      } catch {
        shortBlds = path.join(os.tmpdir(), 'sf_b');
        shortPkgs = path.join(os.tmpdir(), 'sf_p');
        if (!fs.existsSync(shortBlds)) fs.mkdirSync(shortBlds, { recursive: true });
        if (!fs.existsSync(shortPkgs)) fs.mkdirSync(shortPkgs, { recursive: true });
      }

      const vcpkgShortOpts = `--x-buildtrees-root=${shortBlds.replace(/\\/g, '/')};--x-packages-root=${shortPkgs.replace(/\\/g, '/')}`;

      const recoveryCmakeArgs = [...cmakeArgs];
      if (!recoveryCmakeArgs.some((a) => a.startsWith('-DVCPKG_INSTALL_OPTIONS='))) {
        recoveryCmakeArgs.push(`-DVCPKG_INSTALL_OPTIONS=${vcpkgShortOpts}`);
      }
      if (!recoveryCmakeArgs.includes('-DCMAKE_OBJECT_PATH_MAX=500')) {
        recoveryCmakeArgs.push('-DCMAKE_OBJECT_PATH_MAX=500');
      }

      this.clearFailedConfigureCache(buildDir);

      onLog(`[Auto-Healing] Reexecutando configuração com Nova Técnica (Short Paths e dependências resolvidas)...`, 'info');
      await this.runProcess(
        cmakeBinary,
        recoveryCmakeArgs,
        projectDir,
        (line, type) => onLog(`[CMake Configure (Nova Técnica)] ${line}`, type)
      );

      onLog(`[Auto-Healing] Nova Técnica aplicada com êxito! Configuração concluída.`, 'success');
    }

    if (this.isCancelled) {
      throw new Error('Operação de configuração cancelada pelo usuário.');
    }

    // 1.5. PHASE: FORMAT 5 ADDRESS LIBRARY SHIELD (Verify & In-Place Patch)
    this.ensureFormat5Headers(projectDir, buildDir, (line, type) => onLog(`[Format 5 Shield] ${line}`, type));

    // 2. PHASE: BUILD
    onLog(`[MSBuild] Iniciando compilação da DLL com MSVC em modo Release...`, 'info');

    const buildArgs = ['--build', 'build', '--config', 'Release'];
    let buildLogHistory: string[] = [];

    try {
      await this.runProcess(
        cmakeBinary,
        buildArgs,
        projectDir,
        (line, type) => {
          buildLogHistory.push(line);
          onLog(`[CMake Build] ${line}`, type);
        }
      );
    } catch (err: any) {
      if (this.isCancelled) throw err;

      const buildLogText = buildLogHistory.join('\n');
      const isCommonLibSymbolIssue = /GetRuntimeData2|WinAPI|RUNTIME_SSE_1_6_1130|reset.*REL::Module/i.test(buildLogText);

      if (isCommonLibSymbolIssue && options.patchEngine) {
        onLog(
          `[Auto-Healing] Detectados símbolos modernos ausentes na compilação do mod. Ativando Nova Técnica: Upgrade para CommonLibSSE-NG 4.0.0+ (alandtse/CommonLibVR)...`,
          'warn'
        );
        options.patchEngine.upgradeToModernCommonLibVR(projectDir, (line: string, type: any) => onLog(line, type));

        this.clearFailedConfigureCache(buildDir);

        let shortBlds = 'C:\\sf_blds';
        let shortPkgs = 'C:\\sf_pkgs';
        try {
          if (!fs.existsSync(shortBlds)) fs.mkdirSync(shortBlds, { recursive: true });
          if (!fs.existsSync(shortPkgs)) fs.mkdirSync(shortPkgs, { recursive: true });
        } catch {
          shortBlds = path.join(os.tmpdir(), 'sf_b');
          shortPkgs = path.join(os.tmpdir(), 'sf_p');
        }

        const recoveryCmakeArgs = [
          ...cmakeArgs.filter((a) => !a.startsWith('-DVCPKG_INSTALL_OPTIONS=')),
          `-DVCPKG_INSTALL_OPTIONS=--x-buildtrees-root=${shortBlds.replace(/\\/g, '/')};--x-packages-root=${shortPkgs.replace(/\\/g, '/')}`,
          '-DCMAKE_OBJECT_PATH_MAX=500',
        ];

        onLog(`[Auto-Healing] Reconfigurando com CommonLibSSE-NG 4.0.0+...`, 'info');
        await this.runProcess(
          cmakeBinary,
          recoveryCmakeArgs,
          projectDir,
          (line, type) => onLog(`[CMake Configure (Nova Técnica)] ${line}`, type)
        );

        this.ensureFormat5Headers(projectDir, buildDir, (line, type) => onLog(`[Format 5 Shield] ${line}`, type));

        onLog(`[Auto-Healing] Recompilando DLL com MSVC em modo Release...`, 'info');
        await this.runProcess(
          cmakeBinary,
          buildArgs,
          projectDir,
          (line, type) => onLog(`[CMake Build (Nova Técnica)] ${line}`, type)
        );
      } else {
        throw err;
      }
    }

    if (this.isCancelled) {
      throw new Error('Operação de compilação cancelada pelo usuário.');
    }

    // 3. PHASE: LOCATE GENERATED DLL
    onLog(`[Empacotamento] Localizando artefatos binários compilados em ${buildDir}...`, 'info');
    const dllPath = this.locateDll(buildDir, modName);

    if (!dllPath) {
      throw new Error(
        `A compilação foi concluída, mas nenhuma biblioteca (.dll) foi encontrada em ${buildDir}. Verifique os logs de saída.`
      );
    }

    onLog(`[Empacotamento] Binário encontrado: ${dllPath}`, 'success');

    // 4. PHASE: PACKAGE FOR MOD ORGANIZER 2 / VORTEX
    const distRoot = path.join(projectDir, 'dist');
    const modPackageDir = path.join(distRoot, `${modName}_Patch`);
    if (fs.existsSync(modPackageDir)) {
      try {
        fs.rmSync(modPackageDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    const sksePluginsDir = path.join(modPackageDir, 'SKSE', 'Plugins');

    if (!fs.existsSync(sksePluginsDir)) {
      fs.mkdirSync(sksePluginsDir, { recursive: true });
    }

    // Copy DLL to SKSE/Plugins/
    const destDllPath = path.join(sksePluginsDir, path.basename(dllPath));
    fs.copyFileSync(dllPath, destDllPath);
    const filesPackaged: string[] = [destDllPath];

    // Check for accompanying companion files (.ini, .toml) in project or dll folder
    const companionFiles = this.findCompanionConfigFiles(projectDir, path.dirname(dllPath));
    for (const comp of companionFiles) {
      const destComp = path.join(sksePluginsDir, path.basename(comp));
      fs.copyFileSync(comp, destComp);
      filesPackaged.push(destComp);
      onLog(`[Empacotamento] Arquivo de configuração incluído: ${path.basename(comp)}`, 'info');
    }

    // Include Format 2 Address Library companion files if Skyrim has modern Address Library Format 5
    try {
      const binaryService = new BinaryCompatibilityService();
      const installs = await binaryService.detectSkyrimInstallations();
      if (installs.length > 0) {
        const gamePluginsDir = path.join(installs[0].path, 'Data', 'SKSE', 'Plugins');
        if (fs.existsSync(gamePluginsDir)) {
          const binFiles = fs.readdirSync(gamePluginsDir).filter((f) => f.endsWith('.bin'));
          for (const f of binFiles) {
            const full = path.join(gamePluginsDir, f);
            try {
              const fd = fs.openSync(full, 'r');
              const buf = Buffer.alloc(4);
              fs.readSync(fd, buf, 0, 4, 0);
              fs.closeSync(fd);
              if (buf.readInt32LE(0) === 5) {
                const targetBin = path.join(sksePluginsDir, f);
                const conv = await binaryService.convertFormat5ToFormat2(full, targetBin);
                const lb2Name = f.replace(/^versionlib-/, 'versionlb2-');
                const lb2Path = path.join(sksePluginsDir, lb2Name);
                if (fs.existsSync(conv.outputFile)) {
                  fs.copyFileSync(conv.outputFile, lb2Path);
                  filesPackaged.push(lb2Path);
                }
                if (conv.companionFile && fs.existsSync(conv.companionFile)) {
                  filesPackaged.push(conv.companionFile);
                }
                // Unlink versionlib to prevent Vortex conflict
                if (fs.existsSync(targetBin)) {
                  fs.unlinkSync(targetBin);
                }
                onLog(`[Empacotamento] Base Address Library compatibilizada incluída no pacote: ${lb2Name}`, 'info');
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // Address library bundling optional
    }

    // 5. PHASE: SALVAGUARDA DE DEPENDÊNCIAS DINÂMICAS (vcpkg_installed/<triplet>/bin/)
    const dynamicSupportDlls = this.findDynamicSupportDlls(projectDir, buildDir, dllPath);
    if (dynamicSupportDlls.length > 0) {
      onLog(
        '[Aviso] Foram detetadas dependências dinâmicas. As DLLs auxiliares foram empacotadas.',
        'warn'
      );

      const rootFolder = path.join(modPackageDir, 'Root');
      if (!fs.existsSync(rootFolder)) {
        fs.mkdirSync(rootFolder, { recursive: true });
      }

      for (const supDll of dynamicSupportDlls) {
        const fileName = path.basename(supDll);

        // Copiar para Root/ (Mod Organizer 2 Root Builder)
        const destInRoot = path.join(rootFolder, fileName);
        fs.copyFileSync(supDll, destInRoot);
        filesPackaged.push(destInRoot);

        // Copiar também para a raiz do pacote (extração direta na raiz do Skyrim)
        const destInPkgRoot = path.join(modPackageDir, fileName);
        fs.copyFileSync(supDll, destInPkgRoot);
        filesPackaged.push(destInPkgRoot);

        onLog(`[Salvaguarda] DLL de suporte empacotada: ${fileName}`, 'info');
      }
    }

    // Generate ZIP package for Mod Organizer 2 and Vortex
    const zipName = `${modName}_v1.0.0_CommonLibSSE-NG_MO2.zip`;
    const zipPath = path.join(distRoot, zipName);

    onLog(`[Empacotamento] Criando arquivo ZIP compatível com MO2/Vortex: ${zipName}...`, 'info');
    await this.createZipArchive(modPackageDir, zipPath);

    onLog(`[Empacotamento] Pacote final gerado com sucesso: ${zipPath}`, 'success');

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      dllPath: destDllPath,
      distDir: distRoot,
      zipPath,
      modName,
      durationMs,
      filesPackaged,
    };
  }

  /**
   * Helper to execute a command process streaming output
   */
  private runProcess(
    command: string,
    args: string[],
    cwd: string,
    onLog: (line: string, type: 'stdout' | 'stderr') => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        env: { ...process.env },
      });

      this.activeProcess = child;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        onLog(text, 'stdout');
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        onLog(text, 'stderr');
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        if (this.isCancelled) {
          reject(new Error('Processo cancelado pelo usuário.'));
        } else {
          reject(new Error(`Falha ao executar ${command}: ${err.message}`));
        }
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        if (this.isCancelled) {
          reject(new Error('Processo cancelado pelo usuário.'));
          return;
        }

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Comando falhou com código de saída ${code}.`));
        }
      });
    });
  }

  /**
   * Recursively search for generated .dll in build folder
   */
  private locateDll(buildDir: string, modName: string): string | null {
    if (!fs.existsSync(buildDir)) return null;

    const dlls: { path: string; mtime: number }[] = [];

    const search = (dir: string, depth = 0) => {
      if (depth > 6) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          search(full, depth + 1);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
          const stat = fs.statSync(full);
          dlls.push({ path: full, mtime: stat.mtimeMs });
        }
      }
    };

    search(buildDir);

    if (dlls.length === 0) return null;

    // Prefer DLL matching modName
    const matched = dlls.find((d) =>
      path.basename(d.path).toLowerCase().includes(modName.toLowerCase())
    );
    if (matched) return matched.path;

    // Otherwise return the most recently modified DLL
    dlls.sort((a, b) => b.mtime - a.mtime);
    return dlls[0].path;
  }

  /**
   * Find companion .ini or .toml config files
   */
  private findCompanionConfigFiles(projectDir: string, dllDir: string): string[] {
    const results: string[] = [];

    const checkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const lower = f.toLowerCase();
        if (lower.endsWith('.ini') || lower.endsWith('.toml')) {
          results.push(path.join(dir, f));
        }
      }
    };

    checkDir(dllDir);
    checkDir(projectDir);

    return Array.from(new Set(results));
  }

  /**
   * Compress directory contents into a ZIP file using archiver
   */
  private createZipArchive(sourceDir: string, destinationZip: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destinationZip);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Best compression
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      // Archive contents starting inside the mod folder
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Salvaguarda: inspeciona <buildDir>/vcpkg_installed/<triplet>/bin/ e diretórios de build
   * em busca de dependências dinâmicas (.dll) geradas por engano (ex: jsoncpp.dll, fmt.dll).
   */
  private findDynamicSupportDlls(
    projectDir: string,
    buildDir: string,
    mainDllPath: string
  ): string[] {
    const mainDllNormalized = path.resolve(mainDllPath).toLowerCase();
    const mainDllBase = path.basename(mainDllPath).toLowerCase();
    const found = new Map<string, string>(); // baseName -> fullPath

    const candidateRoots = [
      path.join(buildDir, 'vcpkg_installed'),
      path.join(projectDir, 'vcpkg_installed'),
      path.join(buildDir, 'bin'),
      path.join(buildDir, 'Release'),
      path.join(buildDir, 'bin', 'Release'),
    ];

    const scanDir = (dir: string, depth = 0) => {
      if (depth > 6 || !fs.existsSync(dir)) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dll')) {
            const fullNorm = path.resolve(fullPath).toLowerCase();
            const nameNorm = entry.name.toLowerCase();

            // Desconsiderar a própria DLL principal do mod
            if (
              fullNorm !== mainDllNormalized &&
              nameNorm !== mainDllBase &&
              !nameNorm.includes(path.parse(mainDllPath).name.toLowerCase())
            ) {
              if (!found.has(nameNorm)) {
                found.set(nameNorm, fullPath);
              }
            }
          }
        }
      } catch {
        // Ignorar erros de acesso a pastas
      }
    };

    for (const cRoot of candidateRoots) {
      scanDir(cRoot);
    }

    return Array.from(found.values());
  }

  /**
   * Ensures all instances of REL/ID.h and REL/ID.cpp in vcpkg_installed and workspace
   * support Address Library Format 5 (Skyrim 1.6.1130+, 1.6.1170+, 1.7.104+).
   */
  private ensureFormat5Headers(
    projectDir: string,
    buildDir: string,
    onLog: (line: string, type: 'info' | 'warn' | 'success') => void
  ): void {
    let patchedAny = false;

    const rootSearchDirs = [
      buildDir,
      projectDir,
      'C:\\sf_pkgs',
      'C:\\sf_blds',
      path.join(os.tmpdir(), 'sf_p'),
      path.join(os.tmpdir(), 'sf_b'),
    ].filter((d) => fs.existsSync(d));

    // 1. Inspect REL/Relocation.h (CommonLibVR / CommonLibSSE-NG 4.0.0+)
    const relHFiles = rootSearchDirs.flatMap((d) =>
      this.findFilesRecursively(d, (f) => f.endsWith(path.join('REL', 'Relocation.h')), 0, 10)
    );
    const allRelHFiles = Array.from(new Set(relHFiles));

    for (const rFile of allRelHFiles) {
      try {
        let content = fs.readFileSync(rFile, 'utf8');
        const needsFormat5 = !content.includes('format == 5') || content.includes('if (format != a_formatVersion)');
        if (needsFormat5) {
          onLog(`Detectado include/REL/Relocation.h sem suporte completo à Address Library em: ${path.relative(projectDir, rFile)}. Aplicando injeção em memória...`, 'info');
          const isCrlf = content.includes('\r\n');
          content = content.replace(/\r\n/g, '\n');

          // 1.1 header_t::read
          const readRegex = /std::int32_t\s+format\{\};\s*a_in\.readin\(format\);\s*if\s*\(\s*format\s*!=\s*a_formatVersion\s*\)\s*\{[\s\S]*?stl::report_and_fail\([\s\S]*?format\)\);\s*\}/;
          const readReplacement = `std::int32_t format{};
				a_in.readin(format);
				_format = format;
				if (format == 5) {
					std::uint32_t ver[4]{};
					a_in.readin(ver);
					for (std::size_t i = 0; i < 4; ++i) {
						_version[i] = static_cast<std::uint16_t>(ver[i]);
					}
					char name[64]{};
					a_in.readin(name);
					a_in.readin(_pointerSize);
					std::int32_t dataFormat{};
					a_in.readin(dataFormat);
					a_in.readin(_addressCount);
					return;
				}
				if (format != a_formatVersion && format != 2 && format != 1) {
					stl::report_and_fail(
						std::format(
							"Unsupported address library format: {}\\n"
							"This means this script extender plugin is incompatible with the address "
							"library available for this version of the game, and thus does not "
							"support it."sv,
							format));
				}`;

          if (readRegex.test(content)) {
            content = content.replace(readRegex, readReplacement);
          }

          // 1.2 header_t members
          const memberRegex = /\[\[nodiscard\]\]\s*Version\s+version\(\)\s*const\s*noexcept\s*\{\s*return\s+_version;\s*\}\s*private:\s*Version\s+_version;\s*std::int32_t\s+_pointerSize\{\s*0\s*\};\s*std::int32_t\s+_addressCount\{\s*0\s*\};\s*\};/;
          const memberReplacement = `[[nodiscard]] Version version() const noexcept { return _version; }
			[[nodiscard]] std::int32_t format() const noexcept { return _format; }

		private:
			Version      _version;
			std::int32_t _pointerSize{ 0 };
			std::int32_t _addressCount{ 0 };
			std::int32_t _format{ 0 };
		};`;

          if (memberRegex.test(content)) {
            content = content.replace(memberRegex, memberReplacement);
          }

          // 1.3 load_file format 5 unpacking
          const loadFileRegex = /_id2offset\s*=\s*\{\s*static_cast<mapping_t\*>\(_mmap\.data\(\)\),\s*header\.address_count\(\)\s*\};\s*unpack_file\(in,\s*header,\s*a_failOnError\);\s*std::sort\([\s\S]*?\}\);/;
          const loadFileReplacement = `_id2offset = { static_cast<mapping_t*>(_mmap.data()), header.address_count() };
					if (header.format() == 5) {
						for (std::size_t id = 0; id < header.address_count(); ++id) {
							std::uint32_t off = 0;
							in.readin(off);
							_id2offset[id] = { static_cast<std::uint64_t>(id), static_cast<std::uint64_t>(off) };
						}
					} else {
						unpack_file(in, header, a_failOnError);
						std::sort(
							_id2offset.begin(),
							_id2offset.end(),
							[](auto&& a_lhs, auto&& a_rhs) {
								return a_lhs.id < a_rhs.id;
							});
					}`;

          if (loadFileRegex.test(content)) {
            content = content.replace(loadFileRegex, loadFileReplacement);
          }

          // 1.4 load() filename fallback
          const loadRegex = /load_file\(filename,\s*version,\s*Module::IsAE\(\)\s*\?\s*2\s*:\s*1,\s*true\);/;
          const loadReplacement = `if (!load_file(filename, version, Module::IsAE() ? 2 : 1, false)) {
					const auto altFilename =
						stl::utf8_to_utf16(
							Module::IsAE() ?
								std::format("Data/SKSE/Plugins/version-{}.bin"sv,
									version.string()) :
								std::format("Data/SKSE/Plugins/versionlib-{}.bin"sv,
									version.string()))
							.value_or(L"<unknown filename>"s);
					load_file(altFilename, version, Module::IsAE() ? 2 : 1, true);
				}`;

          if (loadRegex.test(content)) {
            content = content.replace(loadRegex, loadReplacement);
          }

          // 1.5 Module Skyrim 1.7+ (AE Runtime) fix in Relocation.h
          const switchRegex = /switch\s*\(\s*([A-Za-z0-9_]+)\[1\]\s*\)\s*\{\s*case\s*4\s*:\s*([A-Za-z0-9_.]+)\s*=\s*Runtime::VR;\s*break;\s*case\s*6\s*:\s*([A-Za-z0-9_.]+)\s*=\s*Runtime::AE;\s*break;\s*default\s*:\s*([A-Za-z0-9_.]+)\s*=\s*Runtime::SE;\s*\}/g;
          content = content.replace(switchRegex, (match, v, r1, r2, r3) => {
            return `if (${v}[1] == 4) {\n\t\t\t\t\t${r1} = Runtime::VR;\n\t\t\t\t} else if (${v}[1] >= 6) {\n\t\t\t\t\t${r2} = Runtime::AE;\n\t\t\t\t} else {\n\t\t\t\t\t${r3} = Runtime::SE;\n\t\t\t\t}`;
          });

          if (isCrlf) content = content.replace(/\n/g, '\r\n');
          fs.writeFileSync(rFile, content, 'utf8');
          patchedAny = true;
          onLog(`Suporte ao Formato 5 e interoperabilidade injetados com sucesso em: ${path.relative(projectDir, rFile)}`, 'success');
        } else {
          onLog(`Cabeçalho validado com suporte à Address Library: ${path.relative(projectDir, rFile)}`, 'info');
        }
      } catch (err: any) {
        onLog(`Aviso ao inspecionar Relocation.h (${rFile}): ${err.message}`, 'warn');
      }
    }

    // 2. Inspect REL/ID.h (CharmedBaryon CommonLibSSE-NG)
    const idHFiles = rootSearchDirs.flatMap((d) =>
      this.findFilesRecursively(d, (f) => f.endsWith(path.join('REL', 'ID.h')), 0, 10)
    );
    const allHFiles = Array.from(new Set(idHFiles));

    for (const hFile of allHFiles) {
      try {
        let content = fs.readFileSync(hFile, 'utf8');
        if (!content.includes('format == 5')) {
          onLog(`Detectado include/REL/ID.h sem suporte ao Formato 5 em: ${path.relative(projectDir, hFile)}. Aplicando injeção em memória...`, 'info');

          // Normalize newlines temporarily for reliable matching
          const isCrlf = content.includes('\r\n');
          content = content.replace(/\r\n/g, '\n');

          // 1. Patch header_t::read
          const readRegex = /std::int32_t\s+format\{\};\s*a_in\.readin\(format\);\s*if\s*\(\s*format\s*!=\s*a_formatVersion\s*\)\s*\{[\s\S]*?stl::report_and_fail\([\s\S]*?format\)\);\s*\}/;
          const readReplacement = `std::int32_t format{};
                a_in.readin(format);
                _format = format;
                if (format == 5) {
                    std::uint32_t ver[4]{};
                    a_in.readin(ver);
                    for (std::size_t i = 0; i < 4; ++i) {
                        _version[i] = static_cast<std::uint16_t>(ver[i]);
                    }
                    char name[64]{};
                    a_in.readin(name);
                    a_in.readin(_pointerSize);
                    std::int32_t dataFormat{};
                    a_in.readin(dataFormat);
                    a_in.readin(_addressCount);
                    return;
                }
                if (format != a_formatVersion && format != 2 && format != 1) {
                    stl::report_and_fail(
                            std::format(
                                    "Unsupported address library format: {}\\n"
                                    "This means this script extender plugin is incompatible with the address "
                                    "library available for this version of the game, and thus does not "
                                    "support it."sv,
                                    format));
                }`;

          if (readRegex.test(content)) {
            content = content.replace(readRegex, readReplacement);
          }

          // 2. Patch header_t members
          const memberRegex = /\[\[nodiscard\]\]\s*Version\s+version\(\)\s*const\s*noexcept\s*\{\s*return\s+_version;\s*\}\s*private:\s*Version\s+_version;\s*std::int32_t\s+_pointerSize\{0\};\s*std::int32_t\s+_addressCount\{0\};\s*\};/;
          const memberReplacement = `[[nodiscard]] Version version() const noexcept { return _version; }
            [[nodiscard]] std::int32_t format() const noexcept { return _format; }

        private:
            Version      _version;
            std::int32_t _pointerSize{0};
            std::int32_t _addressCount{0};
            std::int32_t _format{0};
        };`;

          if (memberRegex.test(content)) {
            content = content.replace(memberRegex, memberReplacement);
          }

          // 3. Patch address library filename fallback in ID.h
          const loadRegex = /load_file\(filename,\s*version,\s*Module::IsAE\(\)\s*\?\s*2\s*:\s*1,\s*true\);/;
          const loadReplacement = `if (!load_file(filename, version, Module::IsAE() ? 2 : 1, false)) {
                    const auto altFilename =
                            stl::utf8_to_utf16(
                                Module::IsAE() ?
                                    std::format("Data/SKSE/Plugins/version-{}.bin"sv, version.string()) :
                                    std::format("Data/SKSE/Plugins/versionlib-{}.bin"sv, version.string()))
                                    .value_or(L"<unknown filename>"s);
                    load_file(altFilename, version, Module::IsAE() ? 2 : 1, true);
                }`;
          if (loadRegex.test(content)) {
            content = content.replace(loadRegex, loadReplacement);
          }

          if (isCrlf) {
            content = content.replace(/\n/g, '\r\n');
          }

          fs.writeFileSync(hFile, content, 'utf8');
          patchedAny = true;
          onLog(`Suporte ao Formato 5 injetado com sucesso no cabeçalho: ${path.relative(projectDir, hFile)}`, 'success');
        } else {
          onLog(`Cabeçalho validado com suporte ao Formato 5: ${path.relative(projectDir, hFile)}`, 'info');
        }
      } catch (err: any) {
        onLog(`Aviso ao inspecionar cabeçalho ${hFile}: ${err.message}`, 'warn');
      }
    }

    // 3. Inspect REL/Module.h files for Skyrim 1.7+ (AE Runtime) fix
    const modHFiles = rootSearchDirs.flatMap((d) =>
      this.findFilesRecursively(d, (f) => f.endsWith(path.join('REL', 'Module.h')), 0, 10)
    );
    const allModHFiles = Array.from(new Set(modHFiles));

    for (const mFile of allModHFiles) {
      try {
        let content = fs.readFileSync(mFile, 'utf8');
        if (!content.includes('_version[1] >= 6')) {
          onLog(`Detectado include/REL/Module.h sem suporte a Skyrim 1.7+ (AE). Aplicando correção de runtime...`, 'info');
          const isCrlf = content.includes('\r\n');
          content = content.replace(/\r\n/g, '\n');

          const switchRegex = /switch\s*\(\s*_version\[1\]\s*\)\s*\{\s*case\s*4\s*:\s*_runtime\s*=\s*Runtime::VR;\s*break;\s*case\s*6\s*:\s*_runtime\s*=\s*Runtime::AE;\s*break;\s*default\s*:\s*_runtime\s*=\s*Runtime::SE;\s*\}/;
          const switchReplacement = `if (_version[1] == 4) {
					_runtime = Runtime::VR;
				} else if (_version[1] >= 6) {
					_runtime = Runtime::AE;
				} else {
					_runtime = Runtime::SE;
				}`;

          if (switchRegex.test(content)) {
            content = content.replace(switchRegex, switchReplacement);
            if (isCrlf) content = content.replace(/\n/g, '\r\n');
            fs.writeFileSync(mFile, content, 'utf8');
            patchedAny = true;
            onLog(`Suporte a Skyrim 1.6+ e 1.7+ (AE) injetado com sucesso em: ${path.relative(projectDir, mFile)}`, 'success');
          }
        }
      } catch (err: any) {
        onLog(`Aviso ao inspecionar ${mFile}: ${err.message}`, 'warn');
      }
    }

    // 4. Inspect ID.cpp files
    const cppFiles = rootSearchDirs.flatMap((d) =>
      this.findFilesRecursively(d, (f) => f.endsWith(path.join('REL', 'ID.cpp')), 0, 10)
    );
    for (const cFile of cppFiles) {
      try {
        let content = fs.readFileSync(cFile, 'utf8');
        if (!content.includes('header.format() == 5')) {
          onLog(`Detectado src/REL/ID.cpp sem suporte ao Formato 5 em: ${path.relative(projectDir, cFile)}. Aplicando injeção...`, 'info');
          const isCrlf = content.includes('\r\n');
          content = content.replace(/\r\n/g, '\n');

          const cppRegex = /_id2offset\s*=\s*\{\s*static_cast<mapping_t\*>\(_mmap\.data\(\)\),\s*header\.address_count\(\)\s*\};\s*unpack_file\(in,\s*header,\s*a_failOnError\);\s*std::sort\(_id2offset\.begin\(\),\s*_id2offset\.end\(\),[\s\S]*?\}\);/;
          const cppReplacement = `_id2offset = { static_cast<mapping_t*>(_mmap.data()), header.address_count() };
				if (header.format() == 5) {
					for (std::size_t id = 0; id < header.address_count(); ++id) {
						std::uint32_t off = 0;
						in.readin(off);
						_id2offset[id] = { static_cast<std::uint64_t>(id), static_cast<std::uint64_t>(off) };
					}
				} else {
					unpack_file(in, header, a_failOnError);
					std::sort(_id2offset.begin(), _id2offset.end(), [](auto&& a_lhs, auto&& a_rhs) {
						return a_lhs.id < a_rhs.id;
					});
				}`;

          if (cppRegex.test(content)) {
            content = content.replace(cppRegex, cppReplacement);
            if (isCrlf) content = content.replace(/\n/g, '\r\n');
            fs.writeFileSync(cFile, content, 'utf8');
            patchedAny = true;
            onLog(`Suporte ao Formato 5 injetado em ${path.relative(projectDir, cFile)}`, 'success');
          }
        }
      } catch {
        // ignore
      }
    }

    // If headers or cpp were patched in-place, delete cached libraries, PCH, and DLLs to force a clean recompile
    if (patchedAny) {
      const libCandidates = [
        path.join(buildDir, 'vcpkg_installed', 'x64-windows-static-md', 'lib', 'CommonLibSSE.lib'),
        path.join(projectDir, 'vcpkg_installed', 'x64-windows-static-md', 'lib', 'CommonLibSSE.lib'),
      ];
      for (const lib of libCandidates) {
        if (fs.existsSync(lib)) {
          try {
            fs.rmSync(lib, { force: true });
            onLog(`Removido CommonLibSSE.lib anterior para forçar reconstrução com Formato 5`, 'info');
          } catch {
            // ignore
          }
        }
      }

      // Remove cached PCH files so MSVC doesn't reuse stale precompiled headers
      const pchFiles = this.findFilesRecursively(buildDir, (f) => f.toLowerCase().endsWith('.pch'), 0, 10);
      for (const pch of pchFiles) {
        try {
          fs.rmSync(pch, { force: true });
          onLog(`Removido cabeçalho pré-compilado ${path.basename(pch)} para forçar recompilação`, 'info');
        } catch {
          // ignore
        }
      }

      // Remove previously generated DLLs to ensure rebuild
      const existingDlls = this.findFilesRecursively(buildDir, (f) => f.toLowerCase().endsWith('.dll'), 0, 10);
      for (const oldDll of existingDlls) {
        try {
          fs.rmSync(oldDll, { force: true });
          onLog(`Removido binário anterior ${path.basename(oldDll)} para forçar reconstrução com Formato 5`, 'info');
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Helper to recursively find files matching a predicate
   */
  private findFilesRecursively(dir: string, predicate: (filePath: string) => boolean, depth = 0, maxDepth = 10): string[] {
    if (depth > maxDepth || !fs.existsSync(dir)) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findFilesRecursively(full, predicate, depth + 1, maxDepth));
        } else if (entry.isFile() && predicate(full)) {
          results.push(full);
        }
      }
    } catch {
      // ignore
    }
    return results;
  }

  /**
   * Open the destination folder in Windows Explorer and select the zip
   */
  openDestination(zipPath: string): void {
    if (fs.existsSync(zipPath)) {
      shell.showItemInFolder(zipPath);
    } else {
      const folder = path.dirname(zipPath);
      if (fs.existsSync(folder)) {
        shell.openPath(folder);
      }
    }
  }

  /**
   * Helper to clean up cache files when configuring fails, allowing recovery attempts
   */
  private clearFailedConfigureCache(buildDir: string): void {
    const targets = [
      path.join(buildDir, 'CMakeCache.txt'),
      path.join(buildDir, 'CMakeFiles'),
      path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'blds', 'commonlibsse-ng'),
      path.join(buildDir, 'vcpkg_installed', 'vcpkg', 'pkgs', 'commonlibsse-ng_x64-windows-static-md'),
    ];
    for (const target of targets) {
      if (fs.existsSync(target)) {
        try {
          fs.rmSync(target, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Copy file path or text to system clipboard
   */
  copyToClipboard(content: string): void {
    clipboard.writeText(content);
  }
}

