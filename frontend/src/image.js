// Preparazione delle foto nel telefono: decodifica, ridimensiona e converte in JPEG.
// Così anche le foto HEIC dell'iPhone arrivano al server come JPEG leggeri.

export const MAX_SIDE = 1280;
export const JPEG_QUALITY = 0.85;

export class ImageReadError extends Error {
  constructor(options) {
    super('Non riesco a leggere questa foto. Prova a scattarla di nuovo o scegline un\'altra.', options);
    this.name = 'ImageReadError';
  }
}

/** Dimensioni che stanno dentro maxSide mantenendo le proporzioni (mai ingrandire). */
export function fitWithin(width, height, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Alcuni browser non decodificano certi formati con createImageBitmap: si prova con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeToJpeg(file, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  let source;
  try {
    source = await decode(file);
  } catch (err) {
    throw new ImageReadError({ cause: err });
  }
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) throw new ImageReadError();

  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageReadError();
  context.drawImage(source, 0, 0, width, height);
  source.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new ImageReadError();
  return blob;
}
