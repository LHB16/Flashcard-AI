/**
 * pdfService.js — Convert images to PDF in browser using pdf-lib
 * Reference: appPython/services/gemini_service.py#images_to_pdf
 *
 * NOTE: pdf-lib is loaded lazily via dynamic import() to keep the main
 * bundle small (~300KB). The ~400KB pdf-lib chunk is only downloaded
 * when the user actually starts an AI Scan.
 */

/**
 * Convert WebP/BMP to PNG via canvas
 * @param {ArrayBuffer} arrayBuffer - raw image bytes
 * @param {string} mimeType - e.g. 'image/webp'
 * @returns {Promise<Uint8Array>} PNG bytes
 */
async function convertToPng(arrayBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        if (!pngBlob) return reject(new Error('Canvas toBlob failed'));
        pngBlob.arrayBuffer().then(buf => resolve(new Uint8Array(buf))).catch(reject);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image as ${mimeType}`));
    };
    img.src = url;
  });
}

/**
 * Convert an array of File objects into a single PDF (base64 encoded).
 * Each image becomes one page with dimensions matching the original image.
 *
 * @param {File[]} imageFiles - array of image File objects
 * @param {function} [onFileProcessed] - callback(index, total) for progress
 * @returns {Promise<{ pdfBase64: string, pageCount: number }>}
 */
export async function imagesToPdf(imageFiles, onFileProcessed) {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const ext = file.name.split('.').pop().toLowerCase();
    const arrayBuffer = await file.arrayBuffer();

    let image;
    try {
      if (ext === 'png') {
        image = await pdfDoc.embedPng(arrayBuffer);
      } else if (ext === 'jpg' || ext === 'jpeg') {
        image = await pdfDoc.embedJpg(arrayBuffer);
      } else if (ext === 'webp') {
        const pngBytes = await convertToPng(arrayBuffer, 'image/webp');
        image = await pdfDoc.embedPng(pngBytes);
      } else if (ext === 'bmp') {
        const pngBytes = await convertToPng(arrayBuffer, 'image/bmp');
        image = await pdfDoc.embedPng(pngBytes);
      } else {
        // Fallback: try as PNG
        image = await pdfDoc.embedPng(arrayBuffer);
      }
    } catch (embedErr) {
      // If embedding fails, try converting through canvas as last resort
      try {
        const guessedMime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const pngBytes = await convertToPng(arrayBuffer, guessedMime);
        image = await pdfDoc.embedPng(pngBytes);
      } catch {
        console.warn(`Skipping unreadable image: ${file.name}`, embedErr);
        continue;
      }
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    if (onFileProcessed) {
      onFileProcessed(i + 1, imageFiles.length);
    }
  }

  const pdfBytes = await pdfDoc.save();

  // Convert to base64
  const chunks = [];
  const chunkSize = 32768;
  for (let i = 0; i < pdfBytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize)));
  }
  const pdfBase64 = btoa(chunks.join(''));

  return { pdfBase64, pageCount: pdfDoc.getPageCount() };
}

/**
 * Supported image extensions
 */
export const SUPPORTED_IMAGES = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

/**
 * Filter and sort image files from a FileList
 * @param {FileList|File[]} files
 * @returns {{ imageFiles: File[], skippedCount: number }}
 */
export function filterImageFiles(files) {
  const all = [...files];
  const imageFiles = all.filter(f =>
    SUPPORTED_IMAGES.some(ext => f.name.toLowerCase().endsWith(ext))
  );
  // Sort by filename (natural order, same as Python)
  imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return {
    imageFiles,
    skippedCount: all.length - imageFiles.length,
  };
}

/**
 * Split array into chunks of given size
 * @param {any[]} arr
 * @param {number} size
 * @returns {any[][]}
 */
export function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}
