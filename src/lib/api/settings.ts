export interface Settings {
	shop_name: string;
	vat_percent: number;
	receipt_footer: string;
	points_per_baht: number;
	// Customer display: how long each slide shows (seconds), how many menu
	// slides play between promos, and the crossfade duration (ms).
	display_slide_seconds: number;
	display_promo_every: number;
	display_transition_ms: number;
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const getSettings = () => fetch('/api/settings').then((r) => j<Settings>(r));
export const updateSettings = (s: Settings) =>
	fetch('/api/settings', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(s)
	}).then((r) => j<Settings>(r));
export const uploadLogo = (file: File) => {
	const fd = new FormData();
	fd.append('file', file);
	return fetch('/api/settings/logo', { method: 'PUT', body: fd }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
};
export const deleteLogo = () =>
	fetch('/api/settings/logo', { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
