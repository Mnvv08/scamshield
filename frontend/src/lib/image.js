// Loads a user-picked image file into something drawable on a canvas.
//
// The live site's Content-Security-Policy allows images only from 'self' and
// data:, so a blob: object URL (URL.createObjectURL) is refused. createImageBitmap
// reads the file directly with no URL involved; older browsers fall back to a
// data: URL. Callers should call img.close?.() when done (ImageBitmap only).
export async function loadImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the data: URL path */
    }
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be opened as an image.'));
    img.src = dataUrl;
  });
}

export function imageSize(img) {
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}
