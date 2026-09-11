const MAX_EDGE = 1920;
const QUALITY = 0.85;

/**
 * Downscale to at most MAX_EDGE on the long side and re-encode as JPEG.
 * The browser has already decoded the file, so this is nearly free — and it
 * keeps a Go image-resizing pipeline out of the backend. A 12MP phone photo
 * becomes a few hundred KB before it crosses Tailscale.
 *
 * This is a bandwidth optimization only — the backend independently
 * validates every upload (JPEG/PNG only, 10 MB cap, decodes the bytes
 * rather than trusting the declared type), so it is never relied on for
 * security here.
 */
export async function downscaleToJpeg(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const w = Math.round(bitmap.width * scale);
	const h = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas unavailable');
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
			'image/jpeg',
			QUALITY
		);
	});
}
