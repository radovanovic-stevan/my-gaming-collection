const MAX_WIDTH = 600;

/** Downscales an image to at most 600px wide and re-encodes it as JPEG, to keep the repo small. */
export async function toCoverDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new Error("That file couldn't be read as an image");
  });
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}
