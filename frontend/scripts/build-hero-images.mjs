// Converts source photos into the landing page's hero carousel backgrounds.
// The hero sits under a dark overlay with text on top, so the images are slightly blurred
// and compressed: the dark overlay and text on top hide fine detail anyway.
//
//   node scripts/build-hero-images.mjs <source-dir>
//
// Every jpg/png/webp in <source-dir> (sorted by name) becomes public/hero/hero-N.webp.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('Usage: node scripts/build-hero-images.mjs <source-dir>');
  process.exit(2);
}

const outDir = path.join(process.cwd(), 'public', 'hero');
fs.mkdirSync(outDir, {recursive: true});

const sources = fs
  .readdirSync(sourceDir)
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort();

let index = 0;
for (const name of sources) {
  index += 1;
  const output = path.join(outDir, `hero-${index}.webp`);
  const info = await sharp(path.join(sourceDir, name))
    .rotate()
    .resize({width: 1920, height: 1080, fit: 'cover', position: 'attention'})
    .blur(1.2)
    .webp({quality: 55, effort: 6})
    .toFile(output);
  console.log(`${name} -> public/hero/hero-${index}.webp (${Math.round(info.size / 1024)} KB)`);
}
