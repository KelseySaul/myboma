import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const iconsDir = path.resolve('./public/icons');

async function processIcons() {
  const files = fs.readdirSync(iconsDir).filter(f => f.endsWith('.png'));
  
  for (const file of files) {
    const filePath = path.join(iconsDir, file);
    console.log(`Processing ${file}...`);
    
    // Read the image, composite it over a white background
    const image = sharp(filePath);
    const metadata = await image.metadata();
    
    const buffer = await image
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
      
    fs.writeFileSync(filePath, buffer);
  }
  
  // also process bomalog.png if it exists in public
  const bomaLogPath = path.resolve('./public/bomalog.png');
  if (fs.existsSync(bomaLogPath)) {
    console.log(`Processing bomalog.png...`);
    const buffer = await sharp(bomaLogPath)
      .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    fs.writeFileSync(bomaLogPath, buffer);
  }
  
  console.log('All icons processed with white background.');
}

processIcons().catch(console.error);
