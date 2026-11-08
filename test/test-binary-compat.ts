import * as fs from 'fs';
import * as path from 'path';
import { BinaryCompatibilityService } from '../electron/services/BinaryCompatibilityService';

async function runBinaryCompatibilityTests() {
  console.log('===========================================================');
  console.log('   SKSE FORGE - TESTES DO PIPELINE DE TRANSMUTAÇÃO (NO-CODE)');
  console.log('===========================================================\n');

  const binaryService = new BinaryCompatibilityService();

  // Test 1: Skyrim Installation Detection
  console.log('[TESTE 1] Detecção Automática de Instalações do Skyrim SE/AE...');
  const installs = await binaryService.detectSkyrimInstallations();
  console.log(`✓ Instalações localizadas: ${installs.length}`);
  for (const inst of installs) {
    console.log(`   - Caminho: ${inst.path}`);
    console.log(`   - Versão detectada: ${inst.gameVersion || 'Desconhecida'}`);
    console.log(`   - SKSE Loader Presente: ${inst.hasSkse}`);
    console.log(`   - Arquivos Address Library (.bin): ${inst.addressLibraryFiles.length}`);
  }

  if (installs.length === 0) {
    throw new Error('Nenhuma instalação do Skyrim foi detectada para os testes.');
  }

  // Test 2: Address Library Format 5 to Format 2 Conversion
  console.log('\n[TESTE 2] Conversão de Base Address Library (Formato 5 ➔ Formato 2)...');
  const pluginsDir = path.join(installs[0].path, 'Data', 'SKSE', 'Plugins');

  // Find a format 5 file in plugins dir
  const binFiles = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.bin'));
  let format5Path: string | null = null;
  for (const f of binFiles) {
    const full = path.join(pluginsDir, f);
    const fd = fs.openSync(full, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    if (buf.readInt32LE(0) === 5) {
      format5Path = full;
      break;
    }
  }

  if (!format5Path) {
    // If not found, check for .bak to restore
    const bakFile = binFiles.find((f) => f.endsWith('.bin.bak'));
    if (bakFile) {
      const orig = path.join(pluginsDir, bakFile.replace(/\.bak$/, ''));
      fs.copyFileSync(path.join(pluginsDir, bakFile), orig);
      format5Path = orig;
    }
  }

  if (!format5Path) {
    // If no format 5 file exists in game dir (all converted to format 2), create a valid test fixture
    const fixturePath = path.join(__dirname, 'mock_format5_fixture.bin');
    const f5Header = Buffer.alloc(96 + 1000 * 4);
    f5Header.writeInt32LE(5, 0); // format 5
    f5Header.writeUInt32LE(1, 4);
    f5Header.writeUInt32LE(7, 8);
    f5Header.writeUInt32LE(104, 12);
    f5Header.writeUInt32LE(0, 16);
    Buffer.from('SkyrimSE.exe', 'utf8').copy(f5Header, 20);
    f5Header.writeInt32LE(8, 84); // pointerSize
    f5Header.writeInt32LE(0, 88); // dataFormat
    f5Header.writeInt32LE(1000, 92); // addressCount
    for (let i = 0; i < 1000; i++) {
      f5Header.writeUInt32LE(0x100000 + i * 16, 96 + i * 4);
    }
    fs.writeFileSync(fixturePath, f5Header);
    format5Path = fixturePath;
  }

  const outTestBin = path.join(__dirname, 'temp_versionlib_format2.bin');
  const convResult = await binaryService.convertFormat5ToFormat2(format5Path, outTestBin);

  console.log(`✓ Conversão concluída em ${convResult.durationMs}ms`);
  console.log(`   - Versão do Jogo: ${convResult.gameVersion}`);
  console.log(`   - Formato de Origem: ${convResult.sourceFormat}`);
  console.log(`   - Formato Gerado: ${convResult.targetFormat}`);
  console.log(`   - Total de Endereços Convertidos: ${convResult.totalAddresses}`);
  console.log(`   - Tamanho do Arquivo Compactado: ${(convResult.outputBytes / 1024).toFixed(1)} KB`);

  if (!convResult.success || convResult.targetFormat !== 2 || convResult.totalAddresses <= 0) {
    throw new Error('Falha na validação dos dados convertidos da Address Library.');
  }

  // Clean fixture if generated
  const fixturePath = path.join(__dirname, 'mock_format5_fixture.bin');
  if (fs.existsSync(fixturePath)) {
    fs.rmSync(fixturePath, { force: true });
  }

  // Verify Format 2 binary integrity
  const v2Buf = fs.readFileSync(outTestBin);
  const outFormat = v2Buf.readInt32LE(0);
  if (outFormat !== 2) {
    throw new Error(`Cabeçalho da Address Library gerada não é Formato 2 (encontrado: ${outFormat})`);
  }
  console.log('✓ Cabeçalho binário Formato 2 validado com sucesso.');

  // Clean temp binary
  if (fs.existsSync(outTestBin)) {
    fs.rmSync(outTestBin, { force: true });
  }

  // Test 3: PE Binary Inspection & Heuristic Risk Analysis
  console.log('\n[TESTE 3] Inspeção Heurística e Análise de Risco PE em DLL Real...');
  const sampleDll = path.join(pluginsDir, 'UnsearchedCorpsesIndicator.dll');
  if (fs.existsSync(sampleDll)) {
    const analysis = await binaryService.analyzeBinary(sampleDll);
    console.log(`✓ DLL analisada: ${analysis.fileName}`);
    console.log(`   - Arquitetura: ${analysis.architecture}`);
    console.log(`   - Plugin SKSE Válido: ${analysis.isSksePlugin}`);
    console.log(`   - Exports SKSE: ${analysis.skseExports.join(', ')}`);
    console.log(`   - Nível de Risco: ${analysis.riskLevel.toUpperCase()} (Score: ${analysis.riskScore}/100)`);
    console.log(`   - Resumo: ${analysis.riskSummary}`);
    console.log(`   - Símbolos Detectados: ${analysis.detectedSymbols.length}`);

    if (analysis.architecture !== 'x64' || !analysis.isSksePlugin) {
      throw new Error('Falha na análise do cabeçalho PE da DLL de teste.');
    }
  }

  // Test 4: Hex Byte Patcher Engine
  console.log('\n[TESTE 4] Motor de Aplicação de Receitas e Patches Hexadecimais...');
  const testBuffer = Buffer.from('48895C2408574883EC208B0512345678488D0D90ABCDEF', 'hex');
  const dummyRecipe = {
    id: 'test-recipe',
    name: 'Test Pattern Recipe',
    description: 'Unit test recipe',
    gameVersionTarget: '1.6.1170',
    patches: [
      {
        offsetHex: '0x00',
        originalBytes: '48 89 5C 24 08',
        replacementBytes: '90 90 90 90 90',
        comment: 'NOP out prologue',
      },
      {
        offsetHex: '0x00', // Pattern match fallback test
        originalBytes: '8B 05 12 34 56 78',
        replacementBytes: 'B8 01 00 00 00 90',
        comment: 'Replace instruction with MOV EAX, 1',
      },
    ],
  };

  const patchLogs: string[] = [];
  const { modifiedBuffer, appliedCount } = binaryService.applyHexPatches(
    testBuffer,
    dummyRecipe,
    (msg) => patchLogs.push(msg)
  );

  console.log(`✓ Patches aplicados: ${appliedCount}/${dummyRecipe.patches.length}`);
  if (appliedCount !== 2) {
    throw new Error(`Esperado 2 patches aplicados, mas foram aplicados ${appliedCount}`);
  }
  if (modifiedBuffer.subarray(0, 5).toString('hex') !== '9090909090') {
    throw new Error('Os bytes NOP de substituição não coincidem com o esperado.');
  }
  console.log('✓ Substituição de bytes e escaneamento por padrão validados.');

  // Test 5: End-to-End Transmute Pipeline
  console.log('\n[TESTE 5] Pipeline Completo de Transmutação e Geração de Pacote MO2...');
  const tempOutputDir = path.join(__dirname, 'temp_transmuted_test');
  if (fs.existsSync(tempOutputDir)) {
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
  }

  const logs: string[] = [];
  const transmuteResult = await binaryService.transmuteMod(
    {
      inputFilePath: sampleDll,
      skyrimDir: installs[0].path,
      convertAddressLibrary: true,
      applyHexPatches: true,
      createZipPackage: true,
      outputDir: tempOutputDir,
    },
    (line, type) => {
      logs.push(`[${type}] ${line}`);
    }
  );

  console.log(`✓ Transmutação finalizada em ${transmuteResult.durationMs}ms:`);
  console.log(`   - Mod: ${transmuteResult.modName}`);
  console.log(`   - DLL Gerada: ${transmuteResult.targetDllPath}`);
  console.log(`   - Pacote ZIP: ${transmuteResult.zipPackagePath}`);
  console.log(`   - Artefatos Gerados: ${transmuteResult.generatedArtifacts.length}`);

  if (!fs.existsSync(transmuteResult.targetDllPath)) {
    throw new Error(`DLL transmutada não encontrada: ${transmuteResult.targetDllPath}`);
  }
  if (!transmuteResult.zipPackagePath || !fs.existsSync(transmuteResult.zipPackagePath)) {
    throw new Error(`Arquivo ZIP do pacote MO2 não foi gerado.`);
  }

  // Clean test output
  if (fs.existsSync(tempOutputDir)) {
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
  }

  console.log('\n===========================================================');
  console.log('   TODOS OS TESTES DE TRANSMUTAÇÃO PASSARAM COM SUCESSO! ✓');
  console.log('===========================================================');
}

runBinaryCompatibilityTests().catch((err) => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
