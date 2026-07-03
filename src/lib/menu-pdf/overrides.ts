import type { MenuSheet } from './model';

// Client-side, generator-only reassignment of a partially-filled variant row's
// prices between the shared Hot/Iced/Frappé columns. Never touches the backend.
export type Overrides = Record<string, (number | null)[]>;

export interface PartialRow {
	key: string;
	sectionTitle: string;
	name: string;
	columns: string[];
	prices: (number | null)[];
}

export function rowKey(sectionIndex: number, rowIndex: number): string {
	return `${sectionIndex}:${rowIndex}`;
}

function nonNullCount(prices: (number | null)[]): number {
	return prices.filter((p) => p != null).length;
}

// Rows in a variant section that have at least one price but not every column
// filled — the only rows whose columns are worth reassigning.
export function partialRows(sheet: MenuSheet): PartialRow[] {
	const out: PartialRow[] = [];
	sheet.sections.forEach((s, si) => {
		if (s.columns.length === 0) return;
		s.rows.forEach((r, ri) => {
			const n = nonNullCount(r.prices);
			if (n >= 1 && n < s.columns.length) {
				out.push({
					key: rowKey(si, ri),
					sectionTitle: s.title,
					name: r.name,
					columns: s.columns,
					prices: r.prices
				});
			}
		});
	});
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

// Apply per-row price overrides (keyed by section/row index) to a sheet.
export function applyOverrides(sheet: MenuSheet, overrides: Overrides): MenuSheet {
	return {
		sections: sheet.sections.map((s, si) => ({
			...s,
			rows: s.rows.map((r, ri) => {
				const ov = overrides[rowKey(si, ri)];
				return ov ? { ...r, prices: ov } : r;
			})
		}))
	};
}
