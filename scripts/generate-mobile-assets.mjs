import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const logoPath = path.join(root, 'public', 'bomalog.png');

const ensureDir = (dir) => fs.mkdirSync(dir, {recursive: true});

const writePng = async (image, outputPath) => {
  ensureDir(path.dirname(outputPath));
  const tempPath = `${outputPath}.tmp`;
  await image.png().toFile(tempPath);
  fs.renameSync(tempPath, outputPath);
};

const makeLogoCanvas = async ({
  outputPath,
  size,
  background = {r: 255, g: 255, b: 255, alpha: 1},
  contentRatio = 0.82,
}) => {
  const contentSize = Math.round(size * contentRatio);
  const logo = await sharp(logoPath)
    .resize(contentSize, contentSize, {fit: 'contain'})
    .png()
    .toBuffer();

  await writePng(
    sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background,
      },
    }).composite([{input: logo, gravity: 'center'}]),
    outputPath,
  );
};

const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
};

const makePwaIcons = async () => {
  const publicIconDir = path.join(root, 'public', 'icons');
  const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

  await Promise.all(
    sizes.map((size) => makeLogoCanvas({
      outputPath: path.join(publicIconDir, `icon-${size}x${size}.png`),
      size,
    })),
  );

  await makeLogoCanvas({
    outputPath: path.join(publicIconDir, 'maskable-icon-512x512.png'),
    size: 512,
    contentRatio: 0.68,
  });
};

const makeAndroidIcons = async () => {
  const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(resDir)) return;

  const densityIcons = [
    ['mipmap-mdpi', 48, 108],
    ['mipmap-hdpi', 72, 162],
    ['mipmap-xhdpi', 96, 216],
    ['mipmap-xxhdpi', 144, 324],
    ['mipmap-xxxhdpi', 192, 432],
  ];

  await Promise.all(
    densityIcons.flatMap(([dir, launcherSize, foregroundSize]) => [
      makeLogoCanvas({
        outputPath: path.join(resDir, dir, 'ic_launcher.png'),
        size: launcherSize,
      }),
      makeLogoCanvas({
        outputPath: path.join(resDir, dir, 'ic_launcher_round.png'),
        size: launcherSize,
      }),
      makeLogoCanvas({
        outputPath: path.join(resDir, dir, 'ic_launcher_foreground.png'),
        size: foregroundSize,
        background: {r: 255, g: 255, b: 255, alpha: 0},
        contentRatio: 0.62,
      }),
    ]),
  );

  const splashPaths = walk(resDir).filter((entryPath) => path.basename(entryPath) === 'splash.png');
  await Promise.all(
    splashPaths.map(async (splashPath) => {
      const metadata = await sharp(splashPath).metadata();
      const size = Math.min(metadata.width ?? 1024, metadata.height ?? 1024);
      await makeLogoCanvas({
        outputPath: splashPath,
        size,
        contentRatio: 0.28,
      });
    }),
  );
};

const makeIosAssets = async () => {
  const assetDir = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets');
  if (!fs.existsSync(assetDir)) return;

  await makeLogoCanvas({
    outputPath: path.join(assetDir, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
    size: 1024,
  });

  await Promise.all(
    ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((filename) => (
      makeLogoCanvas({
        outputPath: path.join(assetDir, 'Splash.imageset', filename),
        size: 2732,
        contentRatio: 0.2,
      })
    )),
  );
};

await makePwaIcons();
await makeAndroidIcons();
await makeIosAssets();

console.log('Generated mobile and PWA assets.');
