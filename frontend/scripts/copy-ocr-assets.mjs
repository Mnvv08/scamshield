// Copies the OCR engine (tesseract.js worker, WebAssembly core, English + Hindi
// language data) from node_modules into public/ocr/ so the site serves them
// itself. Two reasons not to use tesseract's default CDN:
//   1. The site's Content-Security-Policy only allows its own origin.
//   2. Privacy: no third party learns that someone scanned a screenshot.
// Runs before `dev` and `build`; public/ocr/ is gitignored, so the ~12 MB of
// binaries never enter the repository.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // Only the LSTM cores are needed (the app uses the LSTM engine only);
  // tesseract picks the SIMD build when the browser supports it.
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
  ['@tesseract.js-data/hin/4.0.0_best_int/hin.traineddata.gz', 'lang/hin.traineddata.gz'],
];

for (const [from, to] of files) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(nm, from), dest);
}
console.log(`[ocr] copied ${files.length} OCR assets to public/ocr/`);
