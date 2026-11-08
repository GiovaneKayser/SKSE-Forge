import { exec, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'os';
import * as pathUtil from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ToolStatus {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  warning?: string;
}

export interface EnvironmentReport {
  isReady: boolean;
  git: ToolStatus;
  cmake: ToolStatus;
  msvc: ToolStatus;
  vcpkg: ToolStatus;
  resolvedPaths: {
    git?: string;
    cmake?: string;
    vcpkgToolchain?: string;
    vsInstallDir?: string;
  };
}

export class EnvironmentService {
  private cachedReport: EnvironmentReport | null = null;

  /**
   * Run full environment detection
   */
  async detectEnvironment(forceRefresh = false): Promise<EnvironmentReport> {
    if (this.cachedReport && !forceRefresh) {
      return this.cachedReport;
    }

    const [git, msvcInfo] = await Promise.all([
      this.detectGit(),
      this.detectMSVC(),
    ]);

    // CMake detection can use VS installation if not in PATH
    const cmake = await this.detectCMake(msvcInfo.installPath);

    // vcpkg detection can use VS installation or environment variables
    const vcpkg = await this.detectVcpkg(msvcInfo.installPath);

    const isReady = git.found && cmake.found && msvcInfo.status.found && vcpkg.found;

    this.cachedReport = {
      isReady,
      git,
      cmake,
      msvc: msvcInfo.status,
      vcpkg,
      resolvedPaths: {
        git: git.path,
        cmake: cmake.path,
        vcpkgToolchain: vcpkg.path,
        vsInstallDir: msvcInfo.installPath,
      },
    };

    return this.cachedReport;
  }

  /**
   * Detect Git executable and version
   */
  private async detectGit(): Promise<ToolStatus> {
    // 1. Try PATH
    try {
      const { stdout } = await execAsync('git --version');
      const version = stdout.trim();
      return {
        name: 'Git',
        found: true,
        version,
        path: 'git',
      };
    } catch {
      // 2. Try known Windows paths
      const possiblePaths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files\\Git\\bin\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        `${process.env.LOCALAPPDATA}\\Programs\\Git\\cmd\\git.exe`,
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          try {
            const { stdout } = await execFileAsync(p, ['--version']);
            return {
              name: 'Git',
              found: true,
              version: stdout.trim(),
              path: p,
            };
          } catch {
            // continue
          }
        }
      }

      return {
        name: 'Git',
        found: false,
        warning: 'Git CLI não encontrado no PATH nem nos diretórios padrão.',
      };
    }
  }

  /**
   * Detect Visual Studio / MSVC Compiler
   */
  private async detectMSVC(): Promise<{ status: ToolStatus; installPath?: string }> {
    // 1. Try vswhere.exe
    const vswherePaths = [
      `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Microsoft Visual Studio\\Installer\\vswhere.exe`,
      `${process.env.ProgramFiles || 'C:\\Program Files'}\\Microsoft Visual Studio\\Installer\\vswhere.exe`,
    ];

    let vswhereExe: string | null = null;
    for (const p of vswherePaths) {
      if (fs.existsSync(p)) {
        vswhereExe = p;
        break;
      }
    }

    if (vswhereExe) {
      try {
        const { stdout } = await execFileAsync(vswhereExe, [
          '-latest',
          '-products',
          '*',
          '-requires',
          'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
          '-format',
          'json',
          '-utf8',
        ]);

        const instances = JSON.parse(stdout);
        if (Array.isArray(instances) && instances.length > 0) {
          const inst = instances[0];
          return {
            status: {
              name: 'MSVC Compiler (Visual Studio)',
              found: true,
              version: `${inst.displayName || 'Visual Studio'} (${inst.installationVersion || inst.catalog?.productDisplayVersion})`,
              path: inst.installationPath,
            },
            installPath: inst.installationPath,
          };
        }
      } catch (err) {
        // continue to fallback
      }
    }

    // 2. Fallback: check environment variable VSINSTALLDIR
    if (process.env.VSINSTALLDIR && fs.existsSync(process.env.VSINSTALLDIR)) {
      return {
        status: {
          name: 'MSVC Compiler (Visual Studio)',
          found: true,
          version: 'Visual Studio (via %VSINSTALLDIR%)',
          path: process.env.VSINSTALLDIR,
        },
        installPath: process.env.VSINSTALLDIR,
      };
    }

    // 3. Fallback: check dynamic installation folders
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const standardVsDirs: string[] = [];

    for (const yr of ['2026', '2022', '2019', '18']) {
      for (const ed of ['Community', 'Professional', 'Enterprise', 'BuildTools']) {
        standardVsDirs.push(pathUtil.join(pf, 'Microsoft Visual Studio', yr, ed));
        standardVsDirs.push(pathUtil.join(pf86, 'Microsoft Visual Studio', yr, ed));
      }
    }

    for (const dir of standardVsDirs) {
      if (fs.existsSync(dir)) {
        const vcToolsDir = pathUtil.join(dir, 'VC', 'Tools', 'MSVC');
        if (fs.existsSync(vcToolsDir)) {
          return {
            status: {
              name: 'MSVC Compiler (Visual Studio)',
              found: true,
              version: `Visual Studio (${pathUtil.basename(dir)})`,
              path: dir,
            },
            installPath: dir,
          };
        }
      }
    }

    return {
      status: {
        name: 'MSVC Compiler (Visual Studio)',
        found: false,
        warning: 'Nenhuma instalação do Visual Studio com suporte a C++ x86/x64 foi encontrada.',
      },
    };
  }

  /**
   * Detect CMake executable and version
   */
  private async detectCMake(vsInstallPath?: string): Promise<ToolStatus> {
    // 1. Try PATH
    try {
      const { stdout } = await execAsync('cmake --version');
      const firstLine = stdout.split('\n')[0].trim();
      return {
        name: 'CMake',
        found: true,
        version: firstLine,
        path: 'cmake',
      };
    } catch {
      // 2. Try CMake bundled with Visual Studio
      if (vsInstallPath) {
        const vsCmake = pathUtil.join(
          vsInstallPath,
          'Common7',
          'IDE',
          'CommonExtensions',
          'Microsoft',
          'CMake',
          'CMake',
          'bin',
          'cmake.exe'
        );
        if (fs.existsSync(vsCmake)) {
          try {
            const { stdout } = await execFileAsync(vsCmake, ['--version']);
            const firstLine = stdout.split('\n')[0].trim();
            return {
              name: 'CMake (Visual Studio)',
              found: true,
              version: firstLine,
              path: vsCmake,
            };
          } catch {
            // continue
          }
        }
      }

      // 3. Try standard standalone paths
      const standalonePaths = [
        'C:\\Program Files\\CMake\\bin\\cmake.exe',
        'C:\\Program Files (x86)\\CMake\\bin\\cmake.exe',
        `${process.env.LOCALAPPDATA}\\Programs\\CMake\\bin\\cmake.exe`,
      ];

      for (const p of standalonePaths) {
        if (fs.existsSync(p)) {
          try {
            const { stdout } = await execFileAsync(p, ['--version']);
            return {
              name: 'CMake',
              found: true,
              version: stdout.split('\n')[0].trim(),
              path: p,
            };
          } catch {
            // continue
          }
        }
      }

      return {
        name: 'CMake',
        found: false,
        warning: 'CMake não foi encontrado no PATH do sistema nem na pasta do Visual Studio.',
      };
    }
  }

  /**
   * Detect vcpkg.cmake toolchain file
   */
  private async detectVcpkg(vsInstallPath?: string): Promise<ToolStatus> {
    // 1. $env:VCPKG_ROOT
    if (process.env.VCPKG_ROOT) {
      const toolchain = pathUtil.join(process.env.VCPKG_ROOT, 'scripts', 'buildsystems', 'vcpkg.cmake');
      if (fs.existsSync(toolchain)) {
        return {
          name: 'vcpkg Toolchain',
          found: true,
          version: 'vcpkg (via %VCPKG_ROOT%)',
          path: toolchain,
        };
      }
    }

    // 2. $env:VSINSTALLDIR/VC/vcpkg/scripts/buildsystems/vcpkg.cmake
    if (process.env.VSINSTALLDIR) {
      const toolchain = pathUtil.join(
        process.env.VSINSTALLDIR,
        'VC',
        'vcpkg',
        'scripts',
        'buildsystems',
        'vcpkg.cmake'
      );
      if (fs.existsSync(toolchain)) {
        return {
          name: 'vcpkg Toolchain',
          found: true,
          version: 'Visual Studio Integrated vcpkg',
          path: toolchain,
        };
      }
    }

    // 3. From detected Visual Studio path
    if (vsInstallPath) {
      const toolchain = pathUtil.join(
        vsInstallPath,
        'VC',
        'vcpkg',
        'scripts',
        'buildsystems',
        'vcpkg.cmake'
      );
      if (fs.existsSync(toolchain)) {
        return {
          name: 'vcpkg Toolchain (Visual Studio)',
          found: true,
          version: 'Visual Studio Bundled vcpkg',
          path: toolchain,
        };
      }
    }

    // 4. Standard system locations dynamically resolved from environment
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const userProfile = process.env.USERPROFILE || '';
    const candidatePaths: string[] = [];

    const vsYears = ['2026', '2022', '2019', '18'];
    const vsEditions = ['Community', 'Professional', 'Enterprise', 'BuildTools'];

    for (const yr of vsYears) {
      for (const ed of vsEditions) {
        candidatePaths.push(
          pathUtil.join(programFiles, 'Microsoft Visual Studio', yr, ed, 'VC', 'vcpkg', 'scripts', 'buildsystems', 'vcpkg.cmake')
        );
        candidatePaths.push(
          pathUtil.join(programFilesX86, 'Microsoft Visual Studio', yr, ed, 'VC', 'vcpkg', 'scripts', 'buildsystems', 'vcpkg.cmake')
        );
      }
    }

    if (userProfile) {
      candidatePaths.push(pathUtil.join(userProfile, 'vcpkg', 'scripts', 'buildsystems', 'vcpkg.cmake'));
    }

    // Check system drives
    const systemDrive = process.env.SystemDrive || 'C:';
    candidatePaths.push(pathUtil.join(`${systemDrive}\\`, 'vcpkg', 'scripts', 'buildsystems', 'vcpkg.cmake'));

    for (const cPath of candidatePaths) {
      if (fs.existsSync(cPath)) {
        return {
          name: 'vcpkg Toolchain',
          found: true,
          version: `Detected at ${cPath}`,
          path: cPath,
        };
      }
    }

    return {
      name: 'vcpkg Toolchain',
      found: false,
      warning: 'vcpkg.cmake não foi localizado. Defina a variável VCPKG_ROOT ou use o vcpkg do Visual Studio.',
    };
  }
}

