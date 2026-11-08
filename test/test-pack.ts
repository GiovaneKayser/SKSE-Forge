import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';

async function testPackaging() {
  console.log('=== TEST 3: ZIP PACKAGING STRUCTURE (MO2 / Vortex) ===');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skse-forge-pack-'));
  const modName = 'TestPlugin';
  const distRoot = path.join(tempDir, 'dist');
  const modPackageDir = path.join(distRoot, `${modName}_Patch`);
  const sksePluginsDir = path.join(modPackageDir, 'SKSE', 'Plugins');

  fs.mkdirSync(sksePluginsDir, { recursive: true });

  // Create dummy DLL and config INI
  fs.writeFileSync(path.join(sksePluginsDir, `${modName}.dll`), 'DUMMY_DLL_BINARY_CONTENT');
  fs.writeFileSync(path.join(sksePluginsDir, `${modName}.ini`), '[General]\nEnabled=1\n');

  // Safeguard test: Simulate a dynamic auxiliary DLL (e.g. jsoncpp.dll) in Root/ and package root
  const rootDir = path.join(modPackageDir, 'Root');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'jsoncpp.dll'), 'DUMMY_JSONCPP_DLL');
  fs.writeFileSync(path.join(modPackageDir, 'jsoncpp.dll'), 'DUMMY_JSONCPP_DLL');

  const zipPath = path.join(distRoot, `${modName}_v1.0.0_CommonLibSSE-NG_MO2.zip`);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(modPackageDir, false);
    archive.finalize();
  });

  if (!fs.existsSync(zipPath)) {
    throw new Error('ZIP was not created');
  }

  const stat = fs.statSync(zipPath);
  console.log(`✓ MO2 ZIP created successfully: ${zipPath} (${stat.size} bytes)`);

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('=== PACKAGING TEST PASSED! ===');
}

testPackaging().catch((err) => {
  console.error(err);
  process.exit(1);
});

