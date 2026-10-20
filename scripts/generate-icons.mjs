import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'public');
const iconsDir = join(publicDir, 'icons');
const splashDir = join(publicDir, 'splash');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
if (!existsSync(splashDir)) mkdirSync(splashDir, { recursive: true });

const svgContent = readFileSync(join(publicDir, 'favicon.svg'));

const iconSizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-152.png', size: 152 },
  { name: 'icon-167.png', size: 167 },
  { name: 'icon-180.png', size: 180 },
];

async function generateIcons() {
  for (const { name, size } of iconSizes) {
    await sharp(svgContent)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, name));
    console.log(`Generated ${name}`);
  }

  // Apple touch icon
  await sharp(svgContent)
    .resize(180, 180)
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Splash screens (simple solid color with logo)
  const splashConfigs = [
    { name: 'ipad-portrait.png', width: 1536, height: 2048 },
    { name: 'ipad-landscape.png', width: 2048, height: 1536 },
    { name: 'ipad-pro-10-portrait.png', width: 1668, height: 2224 },
    { name: 'ipad-pro-11-portrait.png', width: 1668, height: 2388 },
    { name: 'ipad-pro-12-portrait.png', width: 2048, height: 2732 },
    { name: 'ipad-pro-12-landscape.png', width: 2732, height: 2048 },
  ];

  for (const { name, width, height } of splashConfigs) {
    const logoSize = Math.min(width, height) * 0.25;
    const logo = await sharp(svgContent)
      .resize(Math.round(logoSize), Math.round(logoSize))
      .toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 }
      }
    })
      .composite([{
        input: logo,
        gravity: 'center'
      }])
      .png()
      .toFile(join(splashDir, name));
    console.log(`Generated ${name}`);
  }

  console.log('All icons generated!');
}

generateIcons().catch(console.error);
