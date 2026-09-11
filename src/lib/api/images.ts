import { downscaleToJpeg } from '$lib/images/downscale';

export interface DisplayImage {
	id: number;
	object_key: string;
	content_type: string;
	width: number;
	height: number;
	bytes: number;
}

// The row created by POST /api/display/promos — the display_images playlist
// entry, NOT the underlying image. `id` here is the promo id DELETE
// /api/display/promos/{id} expects (distinct from image_id).
export interface PromoSlide {
	id: number;
	image_id: number;
	sort_order: number;
	active: boolean;
}

export interface Slide {
	kind: 'menu' | 'promo';
	url: string;
	width: number;
	height: number;
	name?: string;
	price?: number;
}

async function json<T>(res: Response): Promise<T> {
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
	return body.data as T;
}

// The raw, backend-relative URL for an object key — mirrors imageURL() in
// mulan/internal/display/service/playlist.go exactly, so this is always
// equal (by plain string comparison) to a Slide's `url` for the same
// image. Kept separate from proxiedImageUrl below: this one is for
// *identity* (matching a freshly-uploaded image against a playlist entry),
// not for fetching — using it directly as an <img src> would 404, since
// "/display/img/*" is not a path this app's own origin serves.
export const imageUrl = (objectKey: string): string =>
	'/display/img/' + objectKey.replace(/^img\//, '');

// GET /api/display/playlist returns slide URLs in that same raw
// "/display/img/<file>" form — the backend's own top-level route
// (main.go mounts ServeImage outside /api entirely, so the
// unauthenticated kiosk display can fetch bytes without a token). This
// app's proxy only owns /api/*, so that URL is not directly fetchable from
// the manager's origin; for an <img src>, rewrite it to
// "/api/display/img/<file>" first. The proxy
// (src/routes/api/[...path]/+server.ts) special-cases that one prefix and
// forwards it to the backend's real path without the leading "api/" every
// other allowed path gets.
export const proxiedImageUrl = (url: string): string =>
	url.startsWith('/display/img/') ? `/api${url}` : url;

export const listPlaylist = () => fetch('/api/display/playlist').then((r) => json<Slide[]>(r));

export async function uploadImage(file: File): Promise<DisplayImage> {
	const blob = await downscaleToJpeg(file);
	const form = new FormData();
	form.append('file', blob, 'upload.jpg');
	// No Content-Type header — the browser sets the multipart boundary.
	return fetch('/api/display/images', { method: 'POST', body: form }).then((r) =>
		json<DisplayImage>(r)
	);
}

// Adding a promo is a second, separate call from uploadImage(): upload only
// stores bytes and records the images row (menu photos use the same
// endpoint and must never become promo slides just by being uploaded). This
// points an already-uploaded image_id at the promo playlist. 400s if the
// image doesn't exist.
export const addPromo = (imageId: number, sortOrder?: number) =>
	fetch('/api/display/promos', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(
			sortOrder === undefined ? { image_id: imageId } : { image_id: imageId, sort_order: sortOrder }
		)
	}).then((r) => json<PromoSlide>(r));

// 404s if the promo id doesn't exist (or was already deleted).
export const deletePromo = (id: number) =>
	fetch(`/api/display/promos/${id}`, { method: 'DELETE' }).then((r) => json<unknown>(r));
