// Reads the text out of a screenshot, entirely in the browser.
//
// The OCR engine (tesseract.js) and its English + Hindi language data are
// served from this site's own /ocr/ folder (see scripts/copy-ocr-assets.mjs),
// never from a CDN: nothing about the screenshot leaves the device, and the
// site's Content-Security-Policy stays limited to its own origin.
//
// The engine is loaded only when someone first reads a screenshot (~8 MB, then
// cached by the browser), so the rest of the app pays nothing for it.
import { imageSize, loadImageFile } from './image';
import { cleanOcrText } from './ocrText.js';

let workerPromise = null;
let progressListener = null;

function ocrUrl(path) {
  return new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.origin).href;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng+hin', 1 /* LSTM engine only */, {
        workerPath: ocrUrl('worker.min.js'),
        corePath: ocrUrl('core'),
        langPath: ocrUrl('lang'),
        workerBlobURL: false, // a blob: worker would be blocked by the CSP
        gzip: true,
        logger: (m) => progressListener?.(m),
      });
    })().catch((err) => {
      workerPromise = null; // allow a retry after a failed download
      throw err;
    });
  }
  return workerPromise;
}

// Tesseract reads dark text on a light background far better than the
// reverse, so dark-mode screenshots are inverted. Small images are upscaled,
// and huge ones scaled down so recognition stays fast on a phone.
function prepareCanvas(img) {
  const { width, height } = imageSize(img);
  const scale = width < 900 ? 2 : width > 2400 ? 2400 / width : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
    total += y;
  }
  const darkMode = total / (d.length / 4) < 110;
  if (darkMode) {
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export async function readScreenshot(file, onProgress) {
  const img = await loadImageFile(file);
  let canvas;
  try {
    canvas = prepareCanvas(img);
  } finally {
    img.close?.();
  }
  progressListener = onProgress;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return { text: cleanOcrText(data.text || ''), confidence: data.confidence ?? 0 };
  } finally {
    progressListener = null;
  }
}
