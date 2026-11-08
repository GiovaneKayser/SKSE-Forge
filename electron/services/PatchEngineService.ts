import * as fs from 'fs';
import * as path from 'path';

export interface AppliedPatch {
  id: string;
  category: 'commonlib_ng' | 'nominmax' | 'legacy_libs' | 'post_build' | 'cpp_standard';
  description: string;
  filePath: string;
  details?: string;
}

export interface PatchReport {
  success: boolean;
  modName: string;
  appliedPatches: AppliedPatch[];
  modifiedFiles: string[];
  warnings: string[];
  cmakeListsPath?: string;
  sourceDir?: string;
}

export class PatchEngineService {
  /**
   * Verified SHA512 and Git commit/branch for modern CommonLibSSE-NG (with Address Library Format 5 support)
   */
  private readonly COMMONLIB_NG_REPO = 'CharmedBaryon/CommonLibSSE-NG';
  private readonly COMMONLIB_NG_URL = 'https://github.com/CharmedBaryon/CommonLibSSE-NG.git';
  private readonly COMMONLIB_NG_BRANCH = 'main';
  private readonly COMMONLIB_NG_COMMIT = 'b93280e832f263dbef44e44cbe2936622a02f91a';
  private readonly COMMONLIB_NG_SHA512 = 'c98a0dde8fab45d0b5ffc8241bc6437fc1b2855e5577e9b66fe4e237c35c7111c3288f0ef7a637b2a399dd38938221619331e3b49504b76ac0e1a0a2034715a6';

  private readonly FORMAT_5_INJECTION = `
# === [SKSE Forge START] INJETAR SUPORTE NATIVO AO FORMATO 5 DA ADDRESS LIBRARY (1.6.1130+, 1.6.1170+, 1.7.104+) ===
if(EXISTS "\${SOURCE_PATH}/include/REL/ID.h")
    file(READ "\${SOURCE_PATH}/include/REL/ID.h" _ID_H)
    string(REPLACE "\\r\\n" "\\n" _ID_H "\${_ID_H}")
    string(FIND "\${_ID_H}" "format == 5" _F5_EXISTS)
    if(_F5_EXISTS EQUAL -1)
        set(_READ_TARGET "                std::int32_t format{};
                a_in.readin(format);
                if (format != a_formatVersion) {
                    stl::report_and_fail(
                            std::format(
                                    \\"Unsupported address library format: {}\\\\n\\"
                                    \\"This means this script extender plugin is incompatible with the address \\"
                                    \\"library available for this version of the game, and thus does not \\"
                                    \\"support it.\\"sv,
                                    format));
                }")
        string(REPLACE "\\r\\n" "\\n" _READ_TARGET "\${_READ_TARGET}")

        set(_READ_REPLACEMENT "                std::int32_t format{};
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
                                    \\"Unsupported address library format: {}\\\\n\\"
                                    \\"This means this script extender plugin is incompatible with the address \\"
                                    \\"library available for this version of the game, and thus does not \\"
                                    \\"support it.\\"sv,
                                    format));
                }")
        string(REPLACE "\\r\\n" "\\n" _READ_REPLACEMENT "\${_READ_REPLACEMENT}")

        string(REPLACE "\${_READ_TARGET}" "\${_READ_REPLACEMENT}" _ID_H "\${_ID_H}")

        set(_HDR_TARGET "            [[nodiscard]] Version version() const noexcept { return _version; }

        private:
            Version      _version;
            std::int32_t _pointerSize{0};
            std::int32_t _addressCount{0};
        };")
        string(REPLACE "\\r\\n" "\\n" _HDR_TARGET "\${_HDR_TARGET}")

        set(_HDR_REPLACEMENT "            [[nodiscard]] Version version() const noexcept { return _version; }
            [[nodiscard]] std::int32_t format() const noexcept { return _format; }

        private:
            Version      _version;
            std::int32_t _pointerSize{0};
            std::int32_t _addressCount{0};
            std::int32_t _format{0};
        };")
        string(REPLACE "\\r\\n" "\\n" _HDR_REPLACEMENT "\${_HDR_REPLACEMENT}")

        string(REPLACE "\${_HDR_TARGET}" "\${_HDR_REPLACEMENT}" _ID_H "\${_ID_H}")

        set(_LOAD_TARGET "load_file(filename, version, Module::IsAE() ? 2 : 1, true);")
        set(_LOAD_REPLACEMENT "if (!load_file(filename, version, Module::IsAE() ? 2 : 1, false)) {
                    const auto altFilename =
                            stl::utf8_to_utf16(
                                Module::IsAE() ?
                                    std::format(\\"Data/SKSE/Plugins/version-{}.bin\\"sv, version.string()) :
                                    std::format(\\"Data/SKSE/Plugins/versionlib-{}.bin\\"sv, version.string()))
                                    .value_or(L\\"<unknown filename>\\"s);
                    load_file(altFilename, version, Module::IsAE() ? 2 : 1, true);
                }")
        string(REPLACE "\\r\\n" "\\n" _LOAD_TARGET "\${_LOAD_TARGET}")
        string(REPLACE "\\r\\n" "\\n" _LOAD_REPLACEMENT "\${_LOAD_REPLACEMENT}")
        string(REPLACE "\${_LOAD_TARGET}" "\${_LOAD_REPLACEMENT}" _ID_H "\${_ID_H}")

        file(WRITE "\${SOURCE_PATH}/include/REL/ID.h" "\${_ID_H}")

        string(FIND "\${_ID_H}" "format == 5" _VERIFY_F5)
        if(_VERIFY_F5 EQUAL -1)
            message(FATAL_ERROR "[SKSE Forge] FATAL: Falha ao aplicar patch do Formato 5 no ID.h da CommonLibSSE-NG!")
        else()
            message(STATUS "[SKSE Forge] Sucesso: Suporte ao Formato 5 injetado em include/REL/ID.h")
        endif()
    endif()
endif()

if(EXISTS "\${SOURCE_PATH}/src/REL/ID.cpp")
    file(READ "\${SOURCE_PATH}/src/REL/ID.cpp" _ID_CPP)
    string(REPLACE "\\r\\n" "\\n" _ID_CPP "\${_ID_CPP}")
    string(FIND "\${_ID_CPP}" "header.format() == 5" _F5_CPP_EXISTS)
    if(_F5_CPP_EXISTS EQUAL -1)
        set(_CPP_TARGET "			} else if (_mmap.create(mapname, byteSize)) {
				_id2offset = { static_cast<mapping_t*>(_mmap.data()), header.address_count() };
				unpack_file(in, header, a_failOnError);
				std::sort(_id2offset.begin(), _id2offset.end(), [](auto&& a_lhs, auto&& a_rhs) {
					return a_lhs.id < a_rhs.id;
				});
			}")
        string(REPLACE "\\r\\n" "\\n" _CPP_TARGET "\${_CPP_TARGET}")

        set(_CPP_REPLACEMENT "			} else if (_mmap.create(mapname, byteSize)) {
				_id2offset = { static_cast<mapping_t*>(_mmap.data()), header.address_count() };
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
				}
			}")
        string(REPLACE "\\r\\n" "\\n" _CPP_REPLACEMENT "\${_CPP_REPLACEMENT}")

        string(REPLACE "\${_CPP_TARGET}" "\${_CPP_REPLACEMENT}" _ID_CPP "\${_ID_CPP}")

        file(WRITE "\${SOURCE_PATH}/src/REL/ID.cpp" "\${_ID_CPP}")

        string(FIND "\${_ID_CPP}" "header.format() == 5" _VERIFY_CPP_F5)
        if(_VERIFY_CPP_F5 EQUAL -1)
            message(FATAL_ERROR "[SKSE Forge] FATAL: Falha ao aplicar patch do Formato 5 no src/REL/ID.cpp!")
        else()
            message(STATUS "[SKSE Forge] Sucesso: Suporte ao Formato 5 injetado em src/REL/ID.cpp")
        endif()
    endif()
endif()

if(EXISTS "\${SOURCE_PATH}/include/REL/Module.h")
    file(READ "\${SOURCE_PATH}/include/REL/Module.h" _MOD_H)
    string(REPLACE "\\r\\n" "\\n" _MOD_H "\${_MOD_H}")
    string(FIND "\${_MOD_H}" "_version[1] >= 6" _MOD_PATCHED)
    if(_MOD_PATCHED EQUAL -1)
        set(_MOD_TARGET "				switch (_version[1]) {
					case 4:
						_runtime = Runtime::VR;
						break;
					case 6:
						_runtime = Runtime::AE;
						break;
					default:
						_runtime = Runtime::SE;
				}")
        string(REPLACE "\\r\\n" "\\n" _MOD_TARGET "\${_MOD_TARGET}")

        set(_MOD_REPLACEMENT "				if (_version[1] == 4) {
					_runtime = Runtime::VR;
				} else if (_version[1] >= 6) {
					_runtime = Runtime::AE;
				} else {
					_runtime = Runtime::SE;
				}")
        string(REPLACE "\\r\\n" "\\n" _MOD_REPLACEMENT "\${_MOD_REPLACEMENT}")

        string(REPLACE "\${_MOD_TARGET}" "\${_MOD_REPLACEMENT}" _MOD_H "\${_MOD_H}")
        file(WRITE "\${SOURCE_PATH}/include/REL/Module.h" "\${_MOD_H}")
        message(STATUS "[SKSE Forge] Sucesso: Suporte a Skyrim AE (1.6+ e 1.7+) injetado em include/REL/Module.h")
    endif()
endif()
# === [SKSE Forge END] ===
`;

  /**
   * Scans and applies all modernizing patches to the project directory
   */
  async patchProject(
    projectDir: string,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): Promise<PatchReport> {
    onLog(`Iniciando escaneamento e modernização em: ${projectDir}`, 'info');

    const appliedPatches: AppliedPatch[] = [];
    const modifiedFilesSet = new Set<string>();
    const warnings: string[] = [];

    // 1. Locate or auto-generate CMakeLists.txt and resolve source directory
    const { cmakeListsPath, sourceDir, modName } = this.locateOrGenerateCmakeProject(
      projectDir,
      appliedPatches,
      modifiedFilesSet,
      warnings,
      onLog
    );

    // Apply CMakeLists.txt patches
    if (cmakeListsPath && fs.existsSync(cmakeListsPath)) {
      this.patchCMakeLists(cmakeListsPath, projectDir, appliedPatches, modifiedFilesSet, onLog);
    }

    // 2. Scan and patch vcpkg / portfile.cmake
    this.patchVcpkgPorts(projectDir, appliedPatches, modifiedFilesSet, onLog);

    // 3. Scan and patch .gitmodules
    this.patchGitModules(projectDir, appliedPatches, modifiedFilesSet, onLog);

    // 4. Scan and patch precompiled headers (PCH.h / pch.h)
    this.patchPrecompiledHeaders(projectDir, appliedPatches, modifiedFilesSet, onLog);

    onLog(
      `Escaneamento concluído: ${appliedPatches.length} correções aplicadas em ${modifiedFilesSet.size} arquivos.`,
      'info'
    );

    return {
      success: true,
      modName,
      appliedPatches,
      modifiedFiles: Array.from(modifiedFilesSet),
      warnings,
      cmakeListsPath: fs.existsSync(cmakeListsPath) ? cmakeListsPath : undefined,
      sourceDir: fs.existsSync(sourceDir) ? sourceDir : projectDir,
    };
  }

  /**
   * Locates CMakeLists.txt across the repository (root, .buildenv, src, etc.)
   * or auto-generates a modern CommonLibSSE-NG CMakeLists.txt if none exists.
   */
  private locateOrGenerateCmakeProject(
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFilesSet: Set<string>,
    warnings: string[],
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): { cmakeListsPath: string; sourceDir: string; modName: string } {
    let modName = path.basename(projectDir);

    // 1. Direct root check
    const rootCmake = path.join(projectDir, 'CMakeLists.txt');
    if (fs.existsSync(rootCmake)) {
      const name = this.extractProjectName(rootCmake);
      if (name) modName = name;
      return { cmakeListsPath: rootCmake, sourceDir: projectDir, modName };
    }

    // 2. Standard subdirectories common in SKSE templates (.buildenv, src, source, plugin, cpp)
    const standardSubfolders = ['.buildenv', 'src', 'source', 'plugin', 'cpp'];
    for (const sub of standardSubfolders) {
      const candidate = path.join(projectDir, sub, 'CMakeLists.txt');
      if (fs.existsSync(candidate)) {
        onLog(`[CMake] CMakeLists.txt localizado no subdiretório: ${sub}/CMakeLists.txt`, 'info');
        const name = this.extractProjectName(candidate);
        if (name) modName = name;
        return { cmakeListsPath: candidate, sourceDir: path.join(projectDir, sub), modName };
      }
    }

    // 3. Recursive search up to 4 levels
    const found = this.findProjectCmakeRecursively(projectDir, 0);
    if (found) {
      const relPath = path.relative(projectDir, found);
      onLog(`[CMake] CMakeLists.txt localizado recursivamente em: ${relPath}`, 'info');
      const name = this.extractProjectName(found);
      if (name) modName = name;
      return { cmakeListsPath: found, sourceDir: path.dirname(found), modName };
    }

    // 4. Auto-generate CMakeLists.txt if missing (e.g. MSBuild / .vcxproj / pure source project)
    warnings.push(`CMakeLists.txt não encontrado no repositório. Gerando configuração moderna CommonLibSSE-NG...`);
    onLog(`[CMake] Nenhum CMakeLists.txt detectado. Gerando CMakeLists.txt e manifesto vcpkg modernos...`, 'info');

    // Detect project name from .sln or .vcxproj if available
    const vcxprojFiles = this.findFilesRecursively(projectDir, (f) => f.endsWith('.vcxproj') || f.endsWith('.sln'));
    if (vcxprojFiles.length > 0) {
      const detectedBase = path.basename(vcxprojFiles[0]).replace(/\.(vcxproj|sln)$/i, '');
      if (detectedBase) modName = detectedBase;
    }

    const generatedCMakeLists = `cmake_minimum_required(VERSION 3.21)

project(${modName} VERSION 1.0.0 LANGUAGES CXX)

# [SKSE Forge] Enforce static dependency triplet with dynamic CRT (/MD)
set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE)
add_compile_definitions(NOMINMAX)
add_compile_definitions(ENABLE_SKYRIM_SE=ON)
add_compile_definitions(ENABLE_SKYRIM_AE=ON)
set(BUILD_SHARED_LIBS OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CommonLibSSE CONFIG REQUIRED)

file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS
    src/*.cpp src/*.h src/*.hpp
    include/*.h include/*.hpp
    *.cpp *.h *.hpp
)

add_commonlibsse_plugin(\${PROJECT_NAME} SOURCES \${SOURCES})

target_include_directories(\${PROJECT_NAME} PRIVATE src include .)

if(EXISTS "\${CMAKE_CURRENT_SOURCE_DIR}/PCH.h")
    target_precompile_headers(\${PROJECT_NAME} PRIVATE PCH.h)
elseif(EXISTS "\${CMAKE_CURRENT_SOURCE_DIR}/src/PCH.h")
    target_precompile_headers(\${PROJECT_NAME} PRIVATE src/PCH.h)
elseif(EXISTS "\${CMAKE_CURRENT_SOURCE_DIR}/include/PCH.h")
    target_precompile_headers(\${PROJECT_NAME} PRIVATE include/PCH.h)
endif()
`;

    fs.writeFileSync(rootCmake, generatedCMakeLists, 'utf8');
    modifiedFilesSet.add(rootCmake);
    appliedPatches.push({
      id: 'generated-cmakelists',
      category: 'commonlib_ng',
      description: `Gerado CMakeLists.txt moderno com CommonLibSSE-NG e Address Library Format 5 para ${modName}`,
      filePath: rootCmake,
    });

    // Ensure root vcpkg.json exists
    const rootVcpkgJson = path.join(projectDir, 'vcpkg.json');
    if (!fs.existsSync(rootVcpkgJson)) {
      const generatedVcpkg = JSON.stringify(
        {
          name: modName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          version: '1.0.0',
          dependencies: ['commonlibsse-ng'],
        },
        null,
        2
      );
      fs.writeFileSync(rootVcpkgJson, generatedVcpkg, 'utf8');
      modifiedFilesSet.add(rootVcpkgJson);
    }

    return { cmakeListsPath: rootCmake, sourceDir: projectDir, modName };
  }

  private extractProjectName(cmakePath: string): string | null {
    try {
      const content = fs.readFileSync(cmakePath, 'utf8');
      const match = content.match(/project\s*\(\s*([A-Za-z0-9_-]+)/i);
      return match && match[1] ? match[1] : null;
    } catch {
      return null;
    }
  }

  private findProjectCmakeRecursively(dir: string, depth = 0): string | null {
    if (depth > 4) return null;
    const ignoredDirs = new Set([
      'node_modules', '.git', 'build', 'out', 'bin', 'dist',
      'vcpkg', 'vcpkg_installed', 'ports', 'overlayports',
      'extern', 'external', 'third_party', 'thirdparty', '3rdparty'
    ]);

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name.toLowerCase())) continue;
          const subPath = path.join(dir, entry.name);
          const candidate = path.join(subPath, 'CMakeLists.txt');
          if (fs.existsSync(candidate)) {
            const content = fs.readFileSync(candidate, 'utf8');
            if (/project\s*\(/i.test(content) || /add_commonlibsse/i.test(content) || /add_library\s*\(/i.test(content)) {
              return candidate;
            }
          }
          const nested = this.findProjectCmakeRecursively(subPath, depth + 1);
          if (nested) return nested;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Patch root CMakeLists.txt (NOMINMAX, C++ standard, legacy libs, post-build)
   */
  private patchCMakeLists(
    cmakePath: string,
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFiles: Set<string>,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): void {
    let content = fs.readFileSync(cmakePath, 'utf8');
    let hasChanges = false;

    // A. Enforce static triplet and NOMINMAX right after project()
    const projectRegex = /(project\s*\([^)]*\))/i;
    if (projectRegex.test(content)) {
      let injections = '';

      if (!content.includes('VCPKG_TARGET_TRIPLET')) {
        injections += '\n\n# [SKSE Forge] Enforce static dependency triplet with dynamic CRT (/MD)\nset(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE)';
        appliedPatches.push({
          id: 'triplet-static-md-injected',
          category: 'legacy_libs',
          description: 'Injetado set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE) após project()',
          filePath: cmakePath,
        });
        onLog('[Patch] Injetado set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE) no CMakeLists.txt', 'info');
      }

      if (!content.includes('NOMINMAX')) {
        injections += '\n\n# [SKSE Forge] Windows NOMINMAX conflict fix\nadd_compile_definitions(NOMINMAX)';
        appliedPatches.push({
          id: 'nominmax-cmake',
          category: 'nominmax',
          description: 'add_compile_definitions(NOMINMAX) injetado após project()',
          filePath: cmakePath,
        });
        onLog('[Patch] Injetado add_compile_definitions(NOMINMAX) no CMakeLists.txt', 'info');
      }

      // Address Library Format 5 & Multi-runtime Compatibility
      if (!content.includes('ENABLE_SKYRIM_SE')) {
        injections += '\n\n# [SKSE Forge] Address Library Format 5 & Multi-runtime Compatibility\nadd_compile_definitions(ENABLE_SKYRIM_SE=ON)\nadd_compile_definitions(ENABLE_SKYRIM_AE=ON)';
        appliedPatches.push({
          id: 'addresslib-format5-compat',
          category: 'commonlib_ng',
          description: 'Injetado add_compile_definitions(ENABLE_SKYRIM_SE=ON) e ENABLE_SKYRIM_AE=ON para suporte à Address Library formato 5',
          filePath: cmakePath,
        });
        onLog('[Patch] Injetadas flags de compatibilidade da Address Library (ENABLE_SKYRIM_SE=ON, ENABLE_SKYRIM_AE=ON) no CMakeLists.txt', 'info');
      } else if (!content.includes('ENABLE_SKYRIM_AE')) {
        injections += '\nadd_compile_definitions(ENABLE_SKYRIM_AE=ON)';
        appliedPatches.push({
          id: 'enable-skyrim-ae',
          category: 'commonlib_ng',
          description: 'Injetado add_compile_definitions(ENABLE_SKYRIM_AE=ON) no CMakeLists.txt',
          filePath: cmakePath,
        });
        onLog('[Patch] Injetado add_compile_definitions(ENABLE_SKYRIM_AE=ON) no CMakeLists.txt', 'info');
      }

      // Ensure local overlay ports are prioritized in CMake if present
      const portsPath = path.join(path.dirname(cmakePath), 'ports');
      if (fs.existsSync(portsPath) && !content.includes('VCPKG_OVERLAY_PORTS')) {
        injections += '\n\n# [SKSE Forge] Prioritize modernized CommonLibSSE-NG overlay port\nset(VCPKG_OVERLAY_PORTS "${CMAKE_CURRENT_SOURCE_DIR}/ports" CACHE PATH "" FORCE)';
        appliedPatches.push({
          id: 'vcpkg-overlay-ports-cmake',
          category: 'commonlib_ng',
          description: 'Configurado VCPKG_OVERLAY_PORTS para apontar para a pasta ports/ local',
          filePath: cmakePath,
        });
        onLog('[Patch] Configurado VCPKG_OVERLAY_PORTS no CMakeLists.txt para priorizar porta local', 'info');
      }

      if (injections) {
        content = content.replace(projectRegex, `$1${injections}`);
        hasChanges = true;
      }
    }

    // A2. Override any existing VCPKG_TARGET_TRIPLET in CMakeLists.txt with FORCE
    const anyTripletRegex = /set\s*\(\s*VCPKG_TARGET_TRIPLET\s+["']?[A-Za-z0-9_-]+["']?\s*(CACHE\s+STRING\s+["'][^"']*["'])?(\s+FORCE)?\s*\)/gi;
    if (anyTripletRegex.test(content) && !content.includes('"x64-windows-static-md" CACHE STRING "" FORCE')) {
      content = content.replace(
        anyTripletRegex,
        'set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE) # [SKSE Forge] Enforced static linking'
      );
      hasChanges = true;
      appliedPatches.push({
        id: 'triplet-static-md-override',
        category: 'legacy_libs',
        description: 'Forçado triplet x64-windows-static-md com FORCE no CMakeLists.txt',
        filePath: cmakePath,
      });
      onLog('[Patch] Triplet atualizado para "x64-windows-static-md" com flag FORCE no CMakeLists.txt', 'info');
    }

    // B. C++ Standard: CommonLibSSE-NG requires C++20 or C++23. Upgrade if set to 17 or 14
    const cppStdRegex = /set\s*\(\s*CMAKE_CXX_STANDARD\s+(1[147])\s*\)/gi;
    if (cppStdRegex.test(content)) {
      content = content.replace(
        cppStdRegex,
        'set(CMAKE_CXX_STANDARD 20) # [SKSE Forge] Upgraded to C++20 for CommonLibSSE-NG'
      );
      hasChanges = true;
      appliedPatches.push({
        id: 'cpp20-upgrade',
        category: 'cpp_standard',
        description: 'Atualizado CMAKE_CXX_STANDARD de C++17/14 para C++20 (obrigatório para CommonLibSSE-NG)',
        filePath: cmakePath,
      });
      onLog('[Patch] CMAKE_CXX_STANDARD atualizado para C++20 no CMakeLists.txt', 'info');
    }

    // C. Mapping Legacy Libraries (e.g. jsoncpp_static -> JsonCpp::JsonCpp)
    if (content.includes('jsoncpp_static')) {
      content = content.replace(/jsoncpp_static/g, 'JsonCpp::JsonCpp');
      hasChanges = true;
      appliedPatches.push({
        id: 'legacy-jsoncpp',
        category: 'legacy_libs',
        description: 'Mapeado alvo legado jsoncpp_static para JsonCpp::JsonCpp',
        filePath: cmakePath,
      });
      onLog('[Patch] Alvo jsoncpp_static substituído por JsonCpp::JsonCpp', 'info');
    }

    // C2. Boost package and target fix
    if (/find_package\s*\(\s*boost\b/i.test(content)) {
      content = content.replace(
        /find_package\s*\(\s*boost\s+REQUIRED\s+COMPONENTS\s+algorithm\s*\)/gi,
        'find_package(boost_algorithm CONFIG REQUIRED)'
      );
      content = content.replace(/find_package\s*\(\s*boost\b/gi, 'find_package(Boost');
      hasChanges = true;
    }
    if (/target_link_directories\s*\(\s*([A-Za-z0-9_${}]+)\s+PRIVATE\s+boost::algorithm\s*\)/i.test(content)) {
      content = content.replace(
        /target_link_directories\s*\(\s*([A-Za-z0-9_${}]+)\s+PRIVATE\s+boost::algorithm\s*\)/gi,
        'target_link_libraries($1 PRIVATE Boost::algorithm) # [SKSE Forge] Corrected Boost link target'
      );
      hasChanges = true;
      appliedPatches.push({
        id: 'boost-target-fix',
        category: 'legacy_libs',
        description: 'Corrigido target_link_directories boost::algorithm para target_link_libraries Boost::algorithm',
        filePath: cmakePath,
      });
      onLog('[Patch] Corrigido target_link_directories boost::algorithm para Boost::algorithm', 'info');
    }

    // D1. Neutralize hardcoded OUTPUT_FOLDER paths
    const outputFolderRegex = /set\s*\(\s*OUTPUT_FOLDER\s+["'][^"']+["']\s*\)/gi;
    if (outputFolderRegex.test(content)) {
      content = content.replace(
        outputFolderRegex,
        '# [SKSE Forge] Desativado caminho OUTPUT_FOLDER local do autor\n# set(OUTPUT_FOLDER ...)'
      );
      hasChanges = true;
      appliedPatches.push({
        id: 'output-folder-sanitize',
        category: 'post_build',
        description: 'Desativado caminho fixo de OUTPUT_FOLDER do autor original',
        filePath: cmakePath,
      });
      onLog('[Patch] Desativado caminho fixo de OUTPUT_FOLDER no CMakeLists.txt', 'info');
    }

    // D2. Sanitizing custom post-build commands with user hardcoded paths
    const postBuildRegex = /add_custom_command\s*\(\s*TARGET\s+[^)]*?POST_BUILD[^)]*?\)/gis;
    content = content.replace(postBuildRegex, (match) => {
      // Check if it has hardcoded absolute drive paths, external game dirs, or mod manager folders
      if (
        /([A-Za-z]:[\\/]|Skyrim|MO2|Mod\s*Organizer|OUTPUT_FOLDER|DLL_FOLDER)/i.test(match) &&
        !match.includes('[SKSE Forge]')
      ) {
        hasChanges = true;
        appliedPatches.push({
          id: 'post-build-sanitize',
          category: 'post_build',
          description: 'Neutralizado comando POST_BUILD com caminhos locais do autor original',
          filePath: cmakePath,
          details: match.slice(0, 80) + '...',
        });
        onLog('[Patch] Neutralizado bloco add_custom_command POST_BUILD com caminho local', 'info');
        return `# [SKSE Forge] Neutralizado comando pós-build com caminho local:\n# ${match.replace(/\n/g, '\n# ')}`;
      }
      return match;
    });

    // E. Subfolder handling: ensure include directories for parent/sibling folders
    const isSubfolder = path.resolve(path.dirname(cmakePath)) !== path.resolve(projectDir);
    if (isSubfolder) {
      if (content.includes('../api/DIII_API.h')) {
        content = content.replace(/\.\.\/api\/DIII_API\.h/g, '../api/*.h');
        hasChanges = true;
      }

      if (!content.includes('[SKSE Forge] Include root, src, and api')) {
        const pluginCallMatch = content.match(/((?:add_commonlibsse_plugin|add_library)\s*\([^)]*\))/is);
        if (pluginCallMatch && pluginCallMatch[1]) {
          const targetMatch = pluginCallMatch[1].match(/(?:add_commonlibsse_plugin|add_library)\s*\(\s*([A-Za-z0-9_${}]+)/i);
          const targetName = targetMatch && targetMatch[1] ? targetMatch[1] : '${PROJECT_NAME}';
          const includeInjection = `\n\n# [SKSE Forge] Include root, src, and api directories when CMakeLists is nested\ntarget_include_directories(${targetName} PRIVATE "\${CMAKE_CURRENT_SOURCE_DIR}/.." "\${CMAKE_CURRENT_SOURCE_DIR}/../src" "\${CMAKE_CURRENT_SOURCE_DIR}/../api" "\${CMAKE_CURRENT_SOURCE_DIR}/../include")`;
          content = content.replace(pluginCallMatch[1], `${pluginCallMatch[1]}${includeInjection}`);
          hasChanges = true;
          appliedPatches.push({
            id: 'nested-include-dirs',
            category: 'commonlib_ng',
            description: 'Adicionados diretórios de cabeçalho pais (../src, ../api) para projeto aninhado',
            filePath: cmakePath,
          });
          onLog('[Patch] Injetados diretórios de cabeçalho pais no CMakeLists aninhado', 'info');
        }
      }
    }

    // F. Ensure BUILD_SHARED_LIBS is not ON globally (which would force vcpkg/subprojects to compile DLLs)
    const buildSharedLibsRegex = /set\s*\(\s*BUILD_SHARED_LIBS\s+ON\s*\)/gi;
    if (buildSharedLibsRegex.test(content)) {
      content = content.replace(
        buildSharedLibsRegex,
        'set(BUILD_SHARED_LIBS OFF) # [SKSE Forge] Enforced static dependency linking'
      );
      hasChanges = true;
      appliedPatches.push({
        id: 'disable-build-shared-libs',
        category: 'legacy_libs',
        description: 'Alterado BUILD_SHARED_LIBS de ON para OFF para embutir dependências estaticamente',
        filePath: cmakePath,
      });
      onLog('[Patch] BUILD_SHARED_LIBS desativado para garantir vinculação estática', 'info');
    }

    if (hasChanges) {
      fs.writeFileSync(cmakePath, content, 'utf8');
      modifiedFiles.add(cmakePath);
    }
  }

  /**
   * Patch vcpkg portfile.cmake, vcpkg-configuration.json, and vcpkg.json
   */
  private patchVcpkgPorts(
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFiles: Set<string>,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): void {
    const portFiles = this.findFilesRecursively(projectDir, (file) =>
      file.endsWith('portfile.cmake') || file.endsWith('vcpkg.json') || file.endsWith('vcpkg-configuration.json')
    );

    let hasLocalPort = false;

    for (const filePath of portFiles) {
      // 1. Portfile.cmake
      if (filePath.endsWith('portfile.cmake')) {
        let portContent = fs.readFileSync(filePath, 'utf8');
        let changed = false;

        // Check if port references CommonLibSSE (legacy or outdated commit)
        if (/REPO\s+[A-Za-z0-9_.-]+\/CommonLibSSE/i.test(portContent)) {
          hasLocalPort = true;

          // Ensure static linkage at top
          if (!portContent.includes('vcpkg_check_linkage')) {
            portContent = `vcpkg_check_linkage(ONLY_STATIC_LIBRARY)\n\n` + portContent;
            changed = true;
          }

          // Replace REPO with CharmedBaryon/CommonLibSSE-NG
          portContent = portContent.replace(
            /REPO\s+[A-Za-z0-9_.-]+\/CommonLibSSE(\-NG)?/gi,
            `REPO ${this.COMMONLIB_NG_REPO}`
          );

          // Update REF to modern commit with Address Library Format 5 support
          portContent = portContent.replace(
            /REF\s+[A-Za-z0-9_.-]+/gi,
            `REF ${this.COMMONLIB_NG_COMMIT}`
          );

          // Update or inject SHA512
          if (/SHA512\s+[A-Fa-f0-9]+/i.test(portContent)) {
            portContent = portContent.replace(
              /SHA512\s+[A-Fa-f0-9]+/gi,
              `SHA512 ${this.COMMONLIB_NG_SHA512}`
            );
          } else {
            portContent = portContent.replace(
              new RegExp(`REF\\s+${this.COMMONLIB_NG_COMMIT}`, 'g'),
              `REF ${this.COMMONLIB_NG_COMMIT}\n    SHA512 ${this.COMMONLIB_NG_SHA512}`
            );
          }

          // Ensure HEAD_REF is set to main
          if (/HEAD_REF\s+[A-Za-z0-9_.-]+/i.test(portContent)) {
            portContent = portContent.replace(/HEAD_REF\s+[A-Za-z0-9_.-]+/gi, `HEAD_REF ${this.COMMONLIB_NG_BRANCH}`);
          } else {
            portContent = portContent.replace(
              new RegExp(`REF\\s+${this.COMMONLIB_NG_COMMIT}`, 'g'),
              `REF ${this.COMMONLIB_NG_COMMIT}\n    HEAD_REF ${this.COMMONLIB_NG_BRANCH}`
            );
          }

          // Remove any previous Format 5 injection block to cleanly replace
          portContent = portContent.replace(
            /# === \[SKSE Forge[\s\S]*?(?:# === \[SKSE Forge END\] ===|endif\(\)\s*endif\(\)\s*endif\(\)|endif\(\)\s*endif\(\))/gi,
            ''
          );
          // Clean up any stray dangling endif() left from prior malformed patches
          portContent = portContent.replace(
            /\n\s*endif\(\)\s*\n\s*(?:vcpkg_configure_cmake|vcpkg_cmake_configure)/gi,
            '\nvcpkg_cmake_configure'
          );
          portContent = portContent.replace(
            /\n\s*endif\(\)\s*\n\s*vcpkg_install_cmake/gi,
            '\nvcpkg_install_cmake'
          );

          // Find insertion point: immediately after vcpkg_from_github / vcpkg_from_git
          const vcpkgFromMatch = portContent.match(/vcpkg_from_(?:github|git)\s*\([\s\S]*?\n\)/i);
          if (vcpkgFromMatch && vcpkgFromMatch.index !== undefined) {
            const insertIdx = vcpkgFromMatch.index + vcpkgFromMatch[0].length;
            portContent =
              portContent.slice(0, insertIdx) +
              '\n' +
              this.FORMAT_5_INJECTION +
              '\n' +
              portContent.slice(insertIdx);
            changed = true;
          } else {
            // Fallback: before configure command
            const configureMatch = portContent.match(/(vcpkg_(?:cmake_configure|configure_cmake|configure)\s*\()/i);
            if (configureMatch && configureMatch.index !== undefined) {
              portContent =
                portContent.slice(0, configureMatch.index) +
                '\n' +
                this.FORMAT_5_INJECTION +
                '\n' +
                portContent.slice(configureMatch.index);
              changed = true;
            } else {
              // Fallback 2: before install command
              const installMatch = portContent.match(/(vcpkg_(?:cmake_install|install_cmake)\s*\()/i);
              if (installMatch && installMatch.index !== undefined) {
                portContent =
                  portContent.slice(0, installMatch.index) +
                  '\n' +
                  this.FORMAT_5_INJECTION +
                  '\n' +
                  portContent.slice(installMatch.index);
                changed = true;
              } else {
                portContent += '\n' + this.FORMAT_5_INJECTION;
                changed = true;
              }
            }
          }

          // Ensure ENABLE_SKYRIM_SE and ENABLE_SKYRIM_AE are in OPTIONS
          if (!portContent.includes('ENABLE_SKYRIM_SE')) {
            portContent = portContent.replace(
              /OPTIONS\s+/gi,
              'OPTIONS -DENABLE_SKYRIM_SE=on -DENABLE_SKYRIM_AE=on '
            );
          }

          // Fix "Unknown CMake command vcpkg_cmake_config_fixup" with fallback helper idempotently
          if (portContent.includes('vcpkg_cmake_config_fixup') || portContent.includes('vcpkg_fixup_cmake_targets')) {
            if (portContent.includes('if(COMMAND vcpkg_cmake_config_fixup)')) {
              portContent = portContent.replace(
                /if\(COMMAND vcpkg_cmake_config_fixup\)[\s\S]*?(?:endif\(\)\s*)+/gi,
                `if(COMMAND vcpkg_cmake_config_fixup)\n    vcpkg_cmake_config_fixup(PACKAGE_NAME CommonLibSSE CONFIG_PATH lib/cmake/CommonLibSSE)\nelseif(COMMAND vcpkg_fixup_cmake_targets)\n    vcpkg_fixup_cmake_targets(CONFIG_PATH lib/cmake/CommonLibSSE TARGET_PATH share/CommonLibSSE)\nendif()\n`
              );
            } else {
              portContent = portContent.replace(
                /vcpkg_cmake_config_fixup\s*\([^)]*\)/gi,
                `if(COMMAND vcpkg_cmake_config_fixup)\n    vcpkg_cmake_config_fixup(PACKAGE_NAME CommonLibSSE CONFIG_PATH lib/cmake/CommonLibSSE)\nelseif(COMMAND vcpkg_fixup_cmake_targets)\n    vcpkg_fixup_cmake_targets(CONFIG_PATH lib/cmake/CommonLibSSE TARGET_PATH share/CommonLibSSE)\nendif()`
              );
            }
          }

          // Ensure dependencies in local port's vcpkg.json declare vcpkg-cmake and vcpkg-cmake-config and bump version to 3.8.1
          const portVcpkgJson = path.join(path.dirname(filePath), 'vcpkg.json');
          if (fs.existsSync(portVcpkgJson)) {
            try {
              const pJson = JSON.parse(fs.readFileSync(portVcpkgJson, 'utf8'));
              let pChanged = false;

              // Enforce single versioning field
              if (
                pJson.version !== '3.8.2' ||
                pJson['version-semver'] ||
                pJson['version-date'] ||
                pJson['version-string']
              ) {
                delete pJson['version-semver'];
                delete pJson['version-date'];
                delete pJson['version-string'];
                pJson.version = '3.8.2';
                pChanged = true;
              }

              if (Array.isArray(pJson.dependencies)) {
                const requiredDeps = ['vcpkg-cmake', 'vcpkg-cmake-config', 'xbyak', 'spdlog', 'rapidcsv', 'fmt'];
                for (const dep of requiredDeps) {
                  const hasDep = pJson.dependencies.some(
                    (d: any) => (typeof d === 'string' ? d : d.name) === dep
                  );
                  if (!hasDep) {
                    pJson.dependencies.push(dep);
                    pChanged = true;
                  }
                }
              }

              if (pChanged) {
                fs.writeFileSync(portVcpkgJson, JSON.stringify(pJson, null, 2), 'utf8');
                modifiedFiles.add(portVcpkgJson);
              }
            } catch {
              // ignore
            }
          }

          changed = true;
          appliedPatches.push({
            id: 'vcpkg-port-commonlib-ng',
            category: 'commonlib_ng',
            description: `Atualizado portfile para ${this.COMMONLIB_NG_REPO} (${this.COMMONLIB_NG_COMMIT.slice(0, 7)}) com suporte nativo a Address Library Format 5`,
            filePath,
          });
          onLog(
            `[Patch] Atualizado portfile.cmake em ${path.relative(projectDir, filePath)} para CommonLibSSE-NG moderna (compatível com Address Library Format 5)`,
            'info'
          );
        }

        if (changed) {
          fs.writeFileSync(filePath, portContent, 'utf8');
          modifiedFiles.add(filePath);
        }
      }

      // 2. vcpkg-configuration.json
      if (filePath.endsWith('vcpkg-configuration.json')) {
        try {
          const configContent = fs.readFileSync(filePath, 'utf8');
          const configJson = JSON.parse(configContent);
          let changed = false;

          // Check if registries contain colorglass with outdated commonlibsse-ng
          if (Array.isArray(configJson.registries)) {
            const hasColorglass = configJson.registries.some(
              (reg: any) => reg.repository && /colorglass/i.test(reg.repository)
            );

            if (hasColorglass) {
              const hasOverlayPorts = Array.isArray(configJson['overlay-ports']) && configJson['overlay-ports'].length > 0;
              if (!hasOverlayPorts) {
                // Ensure local overlay port is created and referenced
                this.ensureLocalCommonLibNgPort(projectDir, appliedPatches, modifiedFiles, onLog);
                hasLocalPort = true;

                configJson['overlay-ports'] = ['./ports'];
                changed = true;
              }

              // Remove commonlibsse-ng from colorglass registry so vcpkg uses the overlay port
              configJson.registries = configJson.registries.filter((reg: any) => {
                if (/colorglass/i.test(reg.repository)) {
                  if (Array.isArray(reg.packages)) {
                    reg.packages = reg.packages.filter(
                      (pkg: string) => pkg !== 'commonlibsse-ng' && pkg !== 'commonlibsse'
                    );
                    if (reg.packages.length === 0) {
                      changed = true;
                      return false; // remove registry entirely if empty
                    }
                    changed = true;
                  }
                }
                return true;
              });

              appliedPatches.push({
                id: 'vcpkg-config-overlay-port',
                category: 'commonlib_ng',
                description: 'Atualizado vcpkg-configuration.json para priorizar overlay port moderno de CommonLibSSE-NG',
                filePath,
              });
              onLog(`[Patch] vcpkg-configuration.json atualizado com overlay-ports para CommonLibSSE-NG v3.8.0+`, 'info');
            }
          }

          if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(configJson, null, 4), 'utf8');
            modifiedFiles.add(filePath);
          }
        } catch {
          // ignore json parse error
        }
      }

      // 3. vcpkg.json
      if (filePath.endsWith('vcpkg.json') && !filePath.includes('ports')) {
        try {
          const vcpkgJsonContent = fs.readFileSync(filePath, 'utf8');
          const json = JSON.parse(vcpkgJsonContent);
          let changed = false;

          // Check if dependencies contain legacy commonlibsse
          if (Array.isArray(json.dependencies)) {
            let hasCommonLibDep = false;
            json.dependencies = json.dependencies.map((dep: any) => {
              if (typeof dep === 'string') {
                if (dep.toLowerCase() === 'commonlibsse') {
                  changed = true;
                  hasCommonLibDep = true;
                  return 'commonlibsse-ng';
                }
                if (dep.toLowerCase() === 'commonlibsse-ng') {
                  hasCommonLibDep = true;
                }
              }
              if (typeof dep === 'object' && dep.name) {
                if (dep.name.toLowerCase() === 'commonlibsse') {
                  changed = true;
                  hasCommonLibDep = true;
                  return { ...dep, name: 'commonlibsse-ng' };
                }
                if (dep.name.toLowerCase() === 'commonlibsse-ng') {
                  hasCommonLibDep = true;
                }
              }
              return dep;
            });

            // If project depends on commonlibsse-ng but doesn't have a local port, create one
            if (hasCommonLibDep && !hasLocalPort) {
              const existingPort = path.join(projectDir, 'ports', 'commonlibsse-ng');
              const legacyPort = path.join(projectDir, 'ports', 'commonlibsse');
              if (!fs.existsSync(existingPort) && !fs.existsSync(legacyPort)) {
                this.ensureLocalCommonLibNgPort(projectDir, appliedPatches, modifiedFiles, onLog);
                hasLocalPort = true;
              }
            }
          }

          if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
            modifiedFiles.add(filePath);
            appliedPatches.push({
              id: 'vcpkg-json-dep',
              category: 'commonlib_ng',
              description: 'Atualizada dependência commonlibsse -> commonlibsse-ng no vcpkg.json',
              filePath,
            });
            onLog(`[Patch] vcpkg.json atualizado para dependência commonlibsse-ng`, 'info');
          }
        } catch {
          // ignore json parse error
        }
      }
    }
  }

  /**
   * Creates a modernized CommonLibSSE-NG overlay port in ports/commonlibsse-ng with native Address Library Format 5 support
   */
  private ensureLocalCommonLibNgPort(
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFiles: Set<string>,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): string {
    const portDir = path.join(projectDir, 'ports', 'commonlibsse-ng');
    const portfilePath = path.join(portDir, 'portfile.cmake');
    const portVcpkgJsonPath = path.join(portDir, 'vcpkg.json');

    if (!fs.existsSync(portDir)) {
      fs.mkdirSync(portDir, { recursive: true });
    }

    const portfileContent = `vcpkg_check_linkage(ONLY_STATIC_LIBRARY)

vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO ${this.COMMONLIB_NG_REPO}
    REF ${this.COMMONLIB_NG_COMMIT}
    SHA512 ${this.COMMONLIB_NG_SHA512}
    HEAD_REF ${this.COMMONLIB_NG_BRANCH}
)
${this.FORMAT_5_INJECTION}

vcpkg_cmake_configure(
    SOURCE_PATH "\${SOURCE_PATH}"
    OPTIONS
        -DENABLE_SKYRIM_SE=ON
        -DENABLE_SKYRIM_AE=ON
        -DENABLE_SKYRIM_VR=OFF
        -DBUILD_TESTS=OFF
        -DSKSE_SUPPORT_XBYAK=ON
)

vcpkg_cmake_install()

if(COMMAND vcpkg_cmake_config_fixup)
    vcpkg_cmake_config_fixup(PACKAGE_NAME CommonLibSSE CONFIG_PATH lib/cmake/CommonLibSSE)
elseif(COMMAND vcpkg_fixup_cmake_targets)
    vcpkg_fixup_cmake_targets(CONFIG_PATH lib/cmake/CommonLibSSE)
endif()

file(GLOB CMAKE_CONFIGS "\${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSE/*.cmake")
if(CMAKE_CONFIGS)
    file(INSTALL \${CMAKE_CONFIGS} DESTINATION "\${CURRENT_PACKAGES_DIR}/share/CommonLibSSE")
endif()
if(EXISTS "\${SOURCE_PATH}/cmake/CommonLibSSE.cmake")
    file(INSTALL "\${SOURCE_PATH}/cmake/CommonLibSSE.cmake" DESTINATION "\${CURRENT_PACKAGES_DIR}/share/CommonLibSSE")
endif()

file(REMOVE_RECURSE "\${CURRENT_PACKAGES_DIR}/debug/include")
file(REMOVE_RECURSE "\${CURRENT_PACKAGES_DIR}/share/CommonLibSSE/CommonLibSSE")

vcpkg_install_copyright(FILE_LIST "\${SOURCE_PATH}/LICENSE")
`;

    const vcpkgJsonContent = JSON.stringify(
      {
        name: 'commonlibsse-ng',
        version: '3.8.2',
        description: 'CommonLibSSE-NG with native Address Library Format 5 support (1.6.1130+)',
        dependencies: [
          'vcpkg-cmake',
          'vcpkg-cmake-config',
          'xbyak',
          'spdlog',
          'rapidcsv',
        ],
      },
      null,
      2
    );

    fs.writeFileSync(portfilePath, portfileContent, 'utf8');
    fs.writeFileSync(portVcpkgJsonPath, vcpkgJsonContent, 'utf8');
    modifiedFiles.add(portfilePath);
    modifiedFiles.add(portVcpkgJsonPath);

    appliedPatches.push({
      id: 'commonlib-ng-overlay-port-created',
      category: 'commonlib_ng',
      description: `Criado overlay port local ports/commonlibsse-ng com suporte a Address Library Format 5 (${this.COMMONLIB_NG_COMMIT.slice(0, 7)})`,
      filePath: portfilePath,
    });
    onLog(`[Patch] Criado overlay port local ports/commonlibsse-ng compatível com Address Library Format 5`, 'info');

    return portfilePath;
  }

  /**
   * Patch .gitmodules to point CommonLibSSE to CommonLibSSE-NG
   */
  private patchGitModules(
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFiles: Set<string>,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): void {
    const gitModulesPath = path.join(projectDir, '.gitmodules');
    if (!fs.existsSync(gitModulesPath)) {
      return;
    }

    let content = fs.readFileSync(gitModulesPath, 'utf8');
    let changed = false;

    // Check if submodule references CommonLibSSE
    if (/url\s*=\s*.*CommonLibSSE(\.git)?/i.test(content) && !content.includes('CommonLibSSE-NG')) {
      content = content.replace(
        /url\s*=\s*https:\/\/github\.com\/[A-Za-z0-9_-]+\/CommonLibSSE(\.git)?/gi,
        `url = ${this.COMMONLIB_NG_URL}`
      );
      content = content.replace(/branch\s*=\s*[A-Za-z0-9_-]+/gi, `branch = ${this.COMMONLIB_NG_BRANCH}`);
      changed = true;

      appliedPatches.push({
        id: 'gitmodule-commonlib-ng',
        category: 'commonlib_ng',
        description: `Atualizado submódulo .gitmodules para ${this.COMMONLIB_NG_URL}`,
        filePath: gitModulesPath,
      });
      onLog(`[Patch] Atualizado submódulo CommonLibSSE para CommonLibSSE-NG no .gitmodules`, 'info');
    }

    if (changed) {
      fs.writeFileSync(gitModulesPath, content, 'utf8');
      modifiedFiles.add(gitModulesPath);
    }
  }

  /**
   * Patch precompiled headers (PCH.h / pch.h) to include NOMINMAX guards
   */
  private patchPrecompiledHeaders(
    projectDir: string,
    appliedPatches: AppliedPatch[],
    modifiedFiles: Set<string>,
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): void {
    const pchFiles = this.findFilesRecursively(projectDir, (file) => {
      const lower = path.basename(file).toLowerCase();
      return (
        lower === 'pch.h' ||
        lower === 'pch.hpp' ||
        lower === 'precompiled.h' ||
        lower === 'stdafx.h'
      );
    });

    for (const pchPath of pchFiles) {
      let content = fs.readFileSync(pchPath, 'utf8');
      if (!content.includes('NOMINMAX')) {
        const guard = `// [SKSE Forge] Windows NOMINMAX conflict prevention\n#ifndef NOMINMAX\n#define NOMINMAX\n#endif\n\n`;
        content = guard + content;
        fs.writeFileSync(pchPath, content, 'utf8');
        modifiedFiles.add(pchPath);

        appliedPatches.push({
          id: 'pch-nominmax-guard',
          category: 'nominmax',
          description: 'Injetado #ifndef NOMINMAX / #define NOMINMAX no cabeçalho pré-compilado',
          filePath: pchPath,
        });
        onLog(`[Patch] Injetado NOMINMAX guard no cabeçalho ${path.relative(projectDir, pchPath)}`, 'info');
      }
    }
  }

  /**
   * Helper to recursively find matching files
   */
  private findFilesRecursively(
    dir: string,
    filter: (filePath: string) => boolean,
    results: string[] = [],
    depth = 0
  ): string[] {
    if (depth > 6) return results; // avoid deep recursion
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== '.git' &&
        entry.name !== 'build' &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist'
      ) {
        this.findFilesRecursively(fullPath, filter, results, depth + 1);
      } else if (entry.isFile() && filter(fullPath)) {
        results.push(fullPath);
      }
    }
    return results;
  }
}

