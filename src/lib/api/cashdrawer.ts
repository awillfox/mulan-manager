// Cash drawer denomination management (owner-gated on the backend).
// Counts are keyed by denomination value in SATANG (string), matching the
// backend JSON. Total is THB (already divided by 100 server-side).

export interface Denominations {
	counts: Record<string, number>;
	total: number;
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}

export const getDenominations = () =>
	fetch('/api/cash-drawer/denominations').then((r) => j<Denominations>(r));

// setDenominations replaces every denomination's absolute count. `counts` is
// keyed by satang string (e.g. { "10000": 5, "100": 20 }).
export const setDenominations = (counts: Record<string, number>) =>
	fetch('/api/cash-drawer/denominations', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ counts })
	}).then((r) => j<Denominations>(r));
