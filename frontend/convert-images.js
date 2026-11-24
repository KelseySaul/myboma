import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Let the user specify input and output folders, defaulting to public
const inputFolder = process.argv[2] || './public';
const outputFolder = process.argv[3] || './public';

console.log(`WebP Image Converter: Initializing...`);
console.log(`Input Folder:  ${path.resolve(inputFolder)}`);
console.log(`Output Folder: ${path.resolve(outputFolder)}`);

// Ensure folders exist
if (!fs.existsSync(inputFolder)) {
  console.error(`Input folder "${inputFolder}" does not exist.`);
  process.exit(1);
}

if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}

// Read and process files
fs.readdir(inputFolder, (err, files) => {
  if (err) {
    return console.error('Could not list the directory.', err);
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.tiff', '.webp'];
  let count = 0;

  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    
    // Convert common formats to webp
    if (imageExtensions.includes(ext)) {
      // Don't re-convert already optimized webp files into webp unless outputting elsewhere
      if (ext === '.webp' && inputFolder === outputFolder) {
        return;
      }

      const inputFilePath = path.join(inputFolder, file);
      const outputFileName = path.basename(file, ext) + '.webp';
      const outputFilePath = path.join(outputFolder, outputFileName);

      count++;
      sharp(inputFilePath)
        .webp({ quality: 80 })
        .toFile(outputFilePath)
        .then(() => {
          console.log(`✔ Converted: ${file} -> ${outputFileName}`);
        })
        .catch(err => {
          console.error(`✘ Failed to convert ${file}:`, err.message);
        });
    }
  });

  if (count === 0) {
    console.log('No qualifying images found for conversion.');
  }
});
