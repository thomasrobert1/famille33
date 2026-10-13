// Préparation des images côté navigateur : redimensionnement, compression JPEG,
// redressement selon l'orientation de l'appareil photo. Le réencodage supprime
// au passage les métadonnées EXIF (dont la position GPS).
import { UserError } from './errors.js';

export const ACCEPT = 'image/*';
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* repli sur <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

async function encode(source, maxSide, quality) {
  const w = source.naturalWidth || source.width;
  const hgt = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(w, hgt));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(hgt * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new UserError('Impossible de préparer cette image.');
  return { blob, width, height };
}

export async function prepareImage(file, { maxSide = 2400, thumbSide = 0, quality = 0.84 } = {}) {
  if (file.size > MAX_INPUT_BYTES) {
    throw new UserError(`« ${file.name} » dépasse 30 Mo. Choisissez une image plus légère.`);
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new UserError(`« ${file.name} » n’est pas une image.`);
  }
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new UserError(`« ${file.name} » ne peut pas être lue par ce navigateur. Formats conseillés : JPEG, PNG, WebP.`);
  }
  try {
    const main = await encode(source, maxSide, quality);
    const thumb = thumbSide ? await encode(source, thumbSide, 0.8) : null;
    return { main, thumb };
  } finally {
    source.close?.();
  }
}

export function pickFiles({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.click();
  });
}
