// Client-side image downsampling — draws the image into an offscreen
// <canvas> capped to `maxDimension` on its longest edge, then re-encodes.
// Keeps the source mime type when it's one canvas.toBlob supports directly
// (png/jpeg/webp); anything else (e.g. an unusual upload) falls back to
// jpeg, which is fine since this is purely a storage-saving re-encode, not
// a format-preservation guarantee.
const CANVAS_ENCODABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function downsampleImageFile(file: File | Blob, maxDimension = 1920, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2D context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = CANVAS_ENCODABLE_TYPES.has(file.type) ? file.type : 'image/jpeg';
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))), outputType, quality);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
