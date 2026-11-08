import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { imagesToIco } from 'png-to-ico';
import { resize } from 'png-to-ico/lib/png.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const WIDTH = 256;
const HEIGHT = 256;
const png = new PNG({ width: WIDTH, height: HEIGHT });

function setPixel(pngObj, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= pngObj.width || y < 0 || y >= pngObj.height) return;
  const idx = (pngObj.width * y + x) << 2;
  // Alpha blend
  if (a === 255) {
    pngObj.data[idx] = r;
    pngObj.data[idx + 1] = g;
    pngObj.data[idx + 2] = b;
    pngObj.data[idx + 3] = 255;
  } else if (a > 0) {
    const srcA = a / 255;
    const dstA = (pngObj.data[idx + 3] || 0) / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      pngObj.data[idx] = Math.round((r * srcA + (pngObj.data[idx] || 0) * dstA * (1 - srcA)) / outA);
      pngObj.data[idx + 1] = Math.round((g * srcA + (pngObj.data[idx + 1] || 0) * dstA * (1 - srcA)) / outA);
      pngObj.data[idx + 2] = Math.round((b * srcA + (pngObj.data[idx + 2] || 0) * dstA * (1 - srcA)) / outA);
      pngObj.data[idx + 3] = Math.round(outA * 255);
    }
  }
}

// Draw authentic Skyrim Forge Icon
const cx = 128;
const cy = 128;
const radius = 118;

// 1. Draw outer circular shield / plaque
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      // Base background: dark charcoal / obsidian with subtle gradient
      const grad = (y / HEIGHT) * 0.2;
      let r = Math.round(15 + grad * 10);
      let g = Math.round(17 + grad * 12);
      let b = Math.round(23 + grad * 15);

      // Outer golden rim (Nordic brass: #c5a059 to #8c7447)
      if (dist >= radius - 8) {
        r = 197; g = 160; b = 89; // #c5a059
      } else if (dist >= radius - 12) {
        r = 50; g = 55; b = 70; // #323746 inner bevel
      } else if (dist >= radius - 15) {
        r = 140; g = 116; b = 71; // #8c7447 thin accent line
      }

      setPixel(png, x, y, r, g, b, 255);
    }
  }
}

// 2. Draw Forge Ember Glow at the bottom center
for (let y = 140; y < 220; y++) {
  for (let x = 60; x < 196; x++) {
    const dx = x - cx;
    const dy = y - 180;
    const dist = Math.sqrt(dx * dx * 1.5 + dy * dy * 3);
    if (dist < 60) {
      const alpha = Math.round((1 - dist / 60) * 120);
      setPixel(png, x, y, 224, 99, 27, alpha); // #e0631b ember glow
    }
  }
}

// 3. Draw Skyrim Anvil Silhouette
function drawAnvil() {
  for (let y = 115; y <= 185; y++) {
    for (let x = 65; x <= 191; x++) {
      let inAnvil = false;

      // Anvil Top Horn & Face (y: 115 to 135)
      if (y >= 115 && y <= 135) {
        // Flat top with horn on left
        const leftHorn = 65 + (135 - y) * 0.8;
        const rightEdge = 185;
        if (x >= leftHorn && x <= rightEdge) inAnvil = true;
      }
      // Anvil Waist (y: 136 to 160)
      else if (y > 135 && y <= 160) {
        const waistLeft = 100 - (y - 135) * 0.4;
        const waistRight = 156 + (y - 135) * 0.4;
        if (x >= waistLeft && x <= waistRight) inAnvil = true;
      }
      // Anvil Base / Feet (y: 161 to 185)
      else if (y > 160 && y <= 185) {
        const baseWidth = 45 + (y - 160) * 1.4;
        if (Math.abs(x - cx) <= baseWidth) inAnvil = true;
      }

      if (inAnvil) {
        // Anvil color: dark forged iron with golden highlights
        let ar = 46; let ag = 51; let ab = 70; // #2e3346
        if (y === 115 || y === 116) {
          ar = 197; ag = 160; ab = 89; // Golden top highlight
        }
        setPixel(png, x, y, ar, ag, ab, 255);
      }
    }
  }
}
drawAnvil();

// 4. Draw Blacksmith Hammer (tilted across the anvil)
function drawHammer() {
  // Handle line from (165, 80) to (115, 155)
  for (let t = 0; t <= 100; t++) {
    const hx = Math.round(165 - t * 0.5);
    const hy = Math.round(75 + t * 0.8);
    for (let w = -2; w <= 2; w++) {
      setPixel(png, hx + w, hy, 165, 120, 75, 255); // Wooden handle
    }
  }
  // Hammer Head (centered around 165, 75)
  for (let y = 60; y <= 90; y++) {
    for (let x = 150; x <= 185; x++) {
      // Rotated rectangular head
      const hx = x - 167;
      const hy = y - 75;
      const rx = hx * 0.8 + hy * 0.6;
      const ry = -hx * 0.6 + hy * 0.8;
      if (Math.abs(rx) <= 16 && Math.abs(ry) <= 9) {
        let hr = 180; let hg = 185; let hb = 195; // Steel
        if (Math.abs(rx) >= 14 || Math.abs(ry) >= 7) {
          hr = 197; hg = 160; hb = 89; // Gold rim
        }
        setPixel(png, x, y, hr, hg, hb, 255);
      }
    }
  }
}
drawHammer();

// 5. Draw Nordic Diamond Rune `◆` at the center top
function drawDiamond(cx, cy, size, r, g, b) {
  for (let y = cy - size; y <= cy + size; y++) {
    for (let x = cx - size; x <= cx + size; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= size) {
        setPixel(png, x, y, r, g, b, 255);
      }
    }
  }
}
drawDiamond(128, 55, 12, 197, 160, 89); // Gold Rune
drawDiamond(128, 55, 6, 245, 230, 180); // Bright center

// Save PNG
const pngBuffer = PNG.sync.write(png);
const iconPngPath = path.join(assetsDir, 'icon.png');
fs.writeFileSync(iconPngPath, pngBuffer);
console.log(`✓ Icon PNG generated: ${iconPngPath} (${pngBuffer.length} bytes)`);

// Generate multi-size ICO: 256, 128, 64, 48, 32, 16
const targetSizes = [16, 24, 32, 48, 64, 128];
const resizedImages = targetSizes.map((s) => resize(png, s, s, 'bicubicInterpolation'));
const allImages = [...resizedImages, png]; // includes 256

const icoBuffer = imagesToIco(allImages);
const iconIcoPath = path.join(assetsDir, 'icon.ico');
fs.writeFileSync(iconIcoPath, icoBuffer);
console.log(`✓ Icon ICO generated: ${iconIcoPath} (${icoBuffer.length} bytes, ${allImages.length} layers: ${targetSizes.join(', ')}, 256)`);

