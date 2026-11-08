import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EnvironmentService } from '../electron/services/EnvironmentService.ts';
import { PatchEngineService } from '../electron/services/PatchEngineService.ts';
import { BuildService } from '../electron/services/BuildService.ts';

async function runTests() {
  console.log('=== TEST 1: ENVIRONMENT SERVICE ===');
  const envService = new EnvironmentService();
  const report = await envService.detectEnvironment();
  console.log('Environment Report:');
  console.log('- MSVC:', report.msvc.found ? `FOUND (${report.msvc.version})` : 'MISSING');
  console.log('- CMake:', report.cmake.found ? `FOUND (${report.cmake.version} at ${report.cmake.path})` : 'MISSING');
  console.log('- vcpkg:', report.vcpkg.found ? `FOUND (${report.vcpkg.path})` : 'MISSING');
  console.log('- Git:', report.git.found ? `FOUND (${report.git.version})` : 'MISSING');
  console.log('- isReady:', report.isReady);

  if (!report.msvc.found) {
    throw new Error('Test failed: MSVC was not found.');
  }
  if (!report.cmake.found) {
    throw new Error('Test failed: CMake was not found.');
  }

  console.log('\n=== TEST 2: PATCH ENGINE SERVICE ===');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-test-'));
  console.log('Created temporary project dir:', tempDir);

  // 1. Create a dummy legacy CMakeLists.txt
  const dummyCMake = `
cmake_minimum_required(VERSION 3.20)
project(SkyrimLegacyPlugin VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(VCPKG_TARGET_TRIPLET "x64-windows")
set(BUILD_SHARED_LIBS ON)

find_package(CommonLibSSE REQUIRED)

add_library(\${PROJECT_NAME} SHARED
    src/main.cpp
    src/PCH.h
)

target_link_libraries(\${PROJECT_NAME} PRIVATE
    CommonLibSSE::CommonLibSSE
    jsoncpp_static
)

add_custom_command(
    TARGET \${PROJECT_NAME} POST_BUILD
    COMMAND \${CMAKE_COMMAND} -E copy_if_different
    "$<TARGET_FILE:\${PROJECT_NAME}>"
    "D:/SteamLibrary/steamapps/common/Skyrim Special Edition/Data/SKSE/Plugins/"
)
`;
  fs.writeFileSync(path.join(tempDir, 'CMakeLists.txt'), dummyCMake);

  // 2. Create dummy PCH.h
  const dummyPCH = `
#pragma once
#include <windows.h>
#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>
`;
  fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'src', 'PCH.h'), dummyPCH);

  // 3. Create dummy portfile.cmake
  const portsDir = path.join(tempDir, 'ports', 'commonlibsse');
  fs.mkdirSync(portsDir, { recursive: true });
  const dummyPortfile = `
vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO Ryan-rsm-McKenzie/CommonLibSSE
    REF 1.5.97
    SHA512 abc123def456
    HEAD_REF master
)
`;
  fs.writeFileSync(path.join(portsDir, 'portfile.cmake'), dummyPortfile);

  // 4. Create dummy vcpkg.json
  const dummyVcpkgJson = {
    name: "skyrim-legacy-plugin",
    version: "1.0.0",
    dependencies: [
      "commonlibsse",
      "fmt"
    ]
  };
  fs.writeFileSync(path.join(tempDir, 'vcpkg.json'), JSON.stringify(dummyVcpkgJson, null, 2));

  // 5. Create dummy .gitmodules
  const dummyGitmodules = `
[submodule "extern/CommonLibSSE"]
    path = extern/CommonLibSSE
    url = https://github.com/Ryan-rsm-McKenzie/CommonLibSSE.git
    branch = master
`;
  fs.writeFileSync(path.join(tempDir, '.gitmodules'), dummyGitmodules);

  // Run PatchEngine
  const patchEngine = new PatchEngineService();
  const patchReport = await patchEngine.patchProject(tempDir, (line, type) => {
    console.log(`  [patch log] [${type}] ${line}`);
  });

  console.log('\nPatch Report:');
  console.log('- Success:', patchReport.success);
  console.log('- Mod Name:', patchReport.modName);
  console.log('- Patches applied:', patchReport.appliedPatches.length);
  for (const p of patchReport.appliedPatches) {
    console.log(`  * [${p.category}] ${p.description}`);
  }

  // Verify changes
  const modifiedCMake = fs.readFileSync(path.join(tempDir, 'CMakeLists.txt'), 'utf8');
  if (!modifiedCMake.includes('add_compile_definitions(NOMINMAX)')) {
    throw new Error('NOMINMAX was not injected into CMakeLists.txt');
  }
  if (!modifiedCMake.includes('set(CMAKE_CXX_STANDARD 20)')) {
    throw new Error('C++ Standard was not upgraded to C++20');
  }
  if (!modifiedCMake.includes('JsonCpp::JsonCpp')) {
    throw new Error('jsoncpp_static was not mapped to JsonCpp::JsonCpp');
  }
  if (!modifiedCMake.includes('# [SKSE Forge] Neutralizado comando pós-build')) {
    throw new Error('Local POST_BUILD command was not neutralized');
  }
  if (!modifiedCMake.includes('set(VCPKG_TARGET_TRIPLET "x64-windows-static-md" CACHE STRING "" FORCE)')) {
    throw new Error('FORCE static triplet was not injected into CMakeLists.txt');
  }
  if (!modifiedCMake.includes('set(BUILD_SHARED_LIBS OFF)')) {
    throw new Error('BUILD_SHARED_LIBS was not forced to OFF in CMakeLists.txt');
  }
  if (!modifiedCMake.includes('add_compile_definitions(ENABLE_SKYRIM_SE=ON)')) {
    throw new Error('ENABLE_SKYRIM_SE=ON was not injected into CMakeLists.txt');
  }
  if (!modifiedCMake.includes('add_compile_definitions(ENABLE_SKYRIM_AE=ON)')) {
    throw new Error('ENABLE_SKYRIM_AE=ON was not injected into CMakeLists.txt');
  }

  const modifiedPCH = fs.readFileSync(path.join(tempDir, 'src', 'PCH.h'), 'utf8');
  if (!modifiedPCH.includes('#ifndef NOMINMAX')) {
    throw new Error('NOMINMAX was not injected into PCH.h');
  }

  const modifiedPortfile = fs.readFileSync(path.join(portsDir, 'portfile.cmake'), 'utf8');
  if (!modifiedPortfile.includes('CharmedBaryon/CommonLibSSE-NG')) {
    throw new Error('portfile.cmake was not updated to CharmedBaryon/CommonLibSSE-NG');
  }
  if (!modifiedPortfile.includes('b93280e832f263dbef44e44cbe2936622a02f91a')) {
    throw new Error('portfile.cmake was not updated with modern commit REF');
  }
  if (!modifiedPortfile.includes('c98a0dde8fab45d0b5ffc8241bc6437fc1b2855e5577e9b66fe4e237c35c7111c3288f0ef7a637b2a399dd38938221619331e3b49504b76ac0e1a0a2034715a6')) {
    throw new Error('portfile.cmake was not updated with recalculated SHA512');
  }

  const modifiedVcpkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'vcpkg.json'), 'utf8'));
  if (!modifiedVcpkg.dependencies.includes('commonlibsse-ng')) {
    throw new Error('vcpkg.json dependency was not updated to commonlibsse-ng');
  }

  const modifiedGitmodules = fs.readFileSync(path.join(tempDir, '.gitmodules'), 'utf8');
  if (!modifiedGitmodules.includes('https://github.com/CharmedBaryon/CommonLibSSE-NG.git')) {
    throw new Error('.gitmodules was not updated to CommonLibSSE-NG URL');
  }

  // Cleanup temp dir 1
  fs.rmSync(tempDir, { recursive: true, force: true });

  // TEST 2.1: Test vcpkg-configuration.json registry migration (ColorGlass -> Modern Overlay Port)
  const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-vcpkg-config-'));
  const dummyCMake2 = `
cmake_minimum_required(VERSION 3.20)
project(RegistryPlugin VERSION 1.0.0 LANGUAGES CXX)
`;
  fs.writeFileSync(path.join(tempDir2, 'CMakeLists.txt'), dummyCMake2);

  const dummyVcpkgConfig = {
    "default-registry": {
      "kind": "git",
      "repository": "https://github.com/microsoft/vcpkg.git",
      "baseline": "4b77da7fed37817f124936239197833469f1b9a8"
    },
    "registries": [
      {
        "kind": "git",
        "repository": "https://gitlab.com/colorglass/vcpkg-colorglass",
        "baseline": "6fb127f7d425ae3cf3fab0f79005d907c885c0d8",
        "packages": [
          "commonlibsse-ng"
        ]
      }
    ]
  };
  fs.writeFileSync(path.join(tempDir2, 'vcpkg-configuration.json'), JSON.stringify(dummyVcpkgConfig, null, 2));

  const dummyVcpkgJson2 = {
    name: "registry-plugin",
    version: "1.0.0",
    dependencies: ["commonlibsse-ng"]
  };
  fs.writeFileSync(path.join(tempDir2, 'vcpkg.json'), JSON.stringify(dummyVcpkgJson2, null, 2));

  await patchEngine.patchProject(tempDir2, (line, type) => {
    console.log(`  [patch log 2] [${type}] ${line}`);
  });

  const createdOverlayPort = path.join(tempDir2, 'ports', 'commonlibsse-ng', 'portfile.cmake');
  if (!fs.existsSync(createdOverlayPort)) {
    throw new Error('Local overlay port ports/commonlibsse-ng/portfile.cmake was not created');
  }

  const createdPortContent = fs.readFileSync(createdOverlayPort, 'utf8');
  if (!createdPortContent.includes('CharmedBaryon/CommonLibSSE-NG') || !createdPortContent.includes('b93280e832f263dbef44e44cbe2936622a02f91a')) {
    throw new Error('Created overlay portfile.cmake does not contain expected modern CommonLibSSE-NG commit');
  }
  if (!createdPortContent.includes('vcpkg_fixup_cmake_targets') && !createdPortContent.includes('vcpkg_cmake_config_fixup')) {
    throw new Error('Created overlay portfile.cmake does not contain fixup command');
  }
  if (!createdPortContent.includes('format == 5')) {
    throw new Error('Created overlay portfile.cmake does not inject Address Library Format 5 support');
  }

  const createdPortVcpkgJson = JSON.parse(fs.readFileSync(path.join(tempDir2, 'ports', 'commonlibsse-ng', 'vcpkg.json'), 'utf8'));
  if (createdPortVcpkgJson.version !== '3.8.2') {
    throw new Error(`Expected overlay port vcpkg.json version to be 3.8.2, got: ${createdPortVcpkgJson.version}`);
  }
  if (!createdPortVcpkgJson.dependencies.includes('vcpkg-cmake') || !createdPortVcpkgJson.dependencies.includes('vcpkg-cmake-config')) {
    throw new Error('Created overlay port vcpkg.json does not declare vcpkg-cmake / vcpkg-cmake-config');
  }

  const updatedConfig = JSON.parse(fs.readFileSync(path.join(tempDir2, 'vcpkg-configuration.json'), 'utf8'));
  if (!updatedConfig['overlay-ports'] || !updatedConfig['overlay-ports'].includes('./ports')) {
    throw new Error('overlay-ports was not configured in vcpkg-configuration.json');
  }
  if (updatedConfig.registries && updatedConfig.registries.some((r: any) => /colorglass/i.test(r.repository))) {
    throw new Error('Obsolete colorglass registry was not cleaned from vcpkg-configuration.json');
  }

  fs.rmSync(tempDir2, { recursive: true, force: true });
  console.log('✓ vcpkg-configuration.json and overlay port generation tests passed!');

  // Test 3: BuildService Format 5 In-Place Shield
  console.log('\n=== TEST 3: BUILD SERVICE FORMAT 5 IN-PLACE SHIELD ===');
  const tempDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-shield-'));
  const testBuildDir = path.join(tempDir3, 'build', 'vcpkg_installed', 'x64-windows-static-md');
  const testIdHDir = path.join(testBuildDir, 'include', 'REL');
  fs.mkdirSync(testIdHDir, { recursive: true });

  const unpatchedIdH = `
namespace REL {
    class header_t {
    public:
        void read(istream_t &a_in, std::uint8_t a_formatVersion)
        {
            std::int32_t format{};
            a_in.readin(format);
            if (format != a_formatVersion) {
                stl::report_and_fail(
                        std::format(
                                "Unsupported address library format: {}\\n"
                                "This means this script extender plugin is incompatible with the address "
                                "library available for this version of the game, and thus does not "
                                "support it."sv,
                                format));
            }
        }
        [[nodiscard]] Version version() const noexcept { return _version; }
    private:
        Version      _version;
        std::int32_t _pointerSize{0};
        std::int32_t _addressCount{0};
    };
}`;
  const testIdHFile = path.join(testIdHDir, 'ID.h');
  fs.writeFileSync(testIdHFile, unpatchedIdH, 'utf8');

  const unpatchedModuleH = `
				_version = *version;
				switch (_version[1]) {
					case 4:
						_runtime = Runtime::VR;
						break;
					case 6:
						_runtime = Runtime::AE;
						break;
					default:
						_runtime = Runtime::SE;
				}
  `;
  const testModuleHFile = path.join(testIdHDir, 'Module.h');
  fs.writeFileSync(testModuleHFile, unpatchedModuleH, 'utf8');

  // Invoke private ensureFormat5Headers via reflection or instance
  const buildSvc = new BuildService();
  (buildSvc as any).ensureFormat5Headers(tempDir3, path.join(tempDir3, 'build'), (msg: string) => {
    console.log(`  [shield log] ${msg}`);
  });

  const patchedIdH = fs.readFileSync(testIdHFile, 'utf8');
  if (!patchedIdH.includes('format == 5')) {
    throw new Error('ensureFormat5Headers failed to inject format == 5');
  }
  if (!patchedIdH.includes('format() const noexcept')) {
    throw new Error('ensureFormat5Headers failed to inject format() method');
  }
  if (!patchedIdH.includes('_format{0}')) {
    throw new Error('ensureFormat5Headers failed to inject _format member');
  }

  const patchedModuleH = fs.readFileSync(testModuleHFile, 'utf8');
  if (!patchedModuleH.includes('_version[1] >= 6')) {
    throw new Error('ensureFormat5Headers failed to inject Skyrim 1.7+ (AE) runtime fix into Module.h');
  }

  fs.rmSync(tempDir3, { recursive: true, force: true });
  console.log('✓ BuildService Format 5 In-Place Shield successfully validated!');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

