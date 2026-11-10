import sharp from 'sharp';

/**
 * Foto de un aviso: se recibe en base64, se reprocesa SIEMPRE con sharp
 * antes de guardarla (nunca se guardan los bytes originales).
 *
 *  - Reencodar a JPEG limpia los metadatos EXIF por defecto (sharp no los
 *    conserva salvo que se pida explícitamente con .withMetadata()), que es
 *    justo lo que importa: un EXIF con GPS delataría la posición exacta, algo
 *    que el resto de la app evita a propósito (celda hexagonal ~450 m).
 *  - Reducir el tamaño máximo y la calidad limita cuánto pesa cada aviso y
 *    de paso descarta archivos que no sean una imagen de verdad.
 */
const MAX_INPUT_BYTES = 8 * 1024 * 1024; // antes de reprocesar (base64 ya decodificado)
const MAX_SIDE = 1280;
const JPEG_QUALITY = 70;

export interface ProcessedPhoto {
  buffer: Buffer;
  mime: string;
}

export class InvalidPhotoError extends Error {}

/** `dataUrl` tal cual la manda la app: "data:image/jpeg;base64,...." o solo el base64. */
export async function processIncidentPhoto(dataUrl: string): Promise<ProcessedPhoto> {
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  let input: Buffer;
  try {
    input = Buffer.from(base64, 'base64');
  } catch {
    throw new InvalidPhotoError('No se pudo leer la imagen.');
  }
  if (input.length === 0) throw new InvalidPhotoError('No se pudo leer la imagen.');
  if (input.length > MAX_INPUT_BYTES) throw new InvalidPhotoError('La imagen pesa demasiado.');

  try {
    const buffer = await sharp(input)
      .rotate() // aplica la orientación EXIF antes de descartar el EXIF
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { buffer, mime: 'image/jpeg' };
  } catch {
    throw new InvalidPhotoError('El archivo no es una imagen válida.');
  }
}
