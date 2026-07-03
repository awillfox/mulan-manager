import type { MenuSheet } from './model';

// Client-side, generator-only reassignment of a partially-filled variant row's
// prices between the shared Hot/Iced/Frappé columns. Never touches the backend.
export type Overrides = Record<number, (number | null)[]>; // keyed by menu id

export interface PartialRow {
	key: number; // menu id
	sectionTitle: string;
	name: string;
	columns: string[];
	prices: (number | null)[];
	single: number | null; // set for a flat-priced item sitting in a variant section
}

function nonNullCount(prices: (number | null)[]): number {
	return prices.filter((p) => p != null).length;
}

// Rows in a variant section whose columns are worth reassigning: either some (but
// not all) columns are filled, or it's a flat-priced item (single) not yet assigned
// to any column.
export function partialRows(sheet: MenuSheet): PartialRow[] {
	const out: PartialRow[] = [];
	for (const s of sheet.sections) {
		if (s.columns.length === 0) continue;
		for (const r of s.rows) {
			const n = nonNullCount(r.prices);
			if (n < s.columns.length && (n >= 1 || r.single != null)) {
				out.push({
					key: r.id,
					sectionTitle: s.title,
					name: r.name,
					columns: s.columns,
					prices: r.prices,
					single: r.single
				});
			}
		}
	}
	return out;
}

// Move a price from column `from` into empty column `to`. Returns a new array;
// a no-op copy if `from` is empty, `to` is already filled, or an index is out of range.
export function movePrice(prices: (number | null)[], from: number, to: number): (number | null)[] {
	const next = [...prices];
	if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
	if (next[from] == null || next[to] != null) return next;
	next[to] = next[from];
	next[from] = null;
	return next;
}

// Apply per-row price overrides (keyed by menu id) to a sheet.
export function applyOverrides(sheet: MenuSheet, overrides: Overrides): MenuSheet {
	return {
		sections: sheet.sections.map((s) => ({
			...s,
			rows: s.rows.map((r) => {
				const ov = overrides[r.id];
				return ov ? { ...r, prices: ov } : r;
			})
		}))
	};
}
