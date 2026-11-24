/**
 * Converts a standard image File (JPEG, PNG, etc.) to high-performance WebP format
 * directly in the browser using the HTML5 Canvas API.
 * 
 * @param file The original image file
 * @param quality Quality level between 0 and 1 (default: 0.8)
 * @returns A promise resolving to a new File in WebP format
 */
export async function convertToWebP(file: File, quality = 0.8): Promise<File> {
  // If the file is already a WebP, skip conversion and return it
  if (file.type === 'image/webp') {
    return file;
  }

  // If the file is not an image at all, return it as-is
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Draw original image into the canvas context
        ctx.drawImage(img, 0, 0);

        // Convert the canvas data to a WebP blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas WebP conversion yielded null blob'));
              return;
            }

            // Replace original extension with .webp in the filename
            const newName = file.name.replace(/\.[^/.]+$/, '') + '.webp';
            
            // Create a brand new File from the blob
            const convertedFile = new File([blob], newName, {
              type: 'image/webp',
              lastModified: Date.now(),
            });

            console.log(`[Image Utility] Client-side conversion success: ${file.name} (${(file.size / 1024).toFixed(1)} KB) -> ${newName} (${(convertedFile.size / 1024).toFixed(1)} KB)`);
            resolve(convertedFile);
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to load image source in memory for WebP rendering'));
      };
    };

    reader.onerror = () => {
      reject(new Error('Failed to read binary stream of image file'));
    };
  });
}
