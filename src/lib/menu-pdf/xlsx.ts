import type { SheetData, Row } from 'write-excel-file/browser';
import type { MenuSheet, SheetSection } from './model';
import { columnLabel } from './pdf';

// Excel caps sheet (tab) names at 31 chars and forbids these characters.
const FORBIDDEN = /[:\\/?*[\]]/g;
const MAX_TAB = 31;

// Build the rows for one category tab: a header row (Name + variant columns, or
// Name/Price for a plain list) followed by one row per item. Prices are real
// numbers; an absent price is an empty cell (null), not a placeholder string.
export function buildRows(s: SheetSection): SheetData {
	if (s.columns.length === 0) {
		const header: Row = [
			{ value: 'Name', type: String },
			{ value: 'Price', type: String }
		];
		const body = s.rows.map(
			(r): Row => [
				{ value: r.name, type: String },
				r.single == null ? null : { value: r.single, type: Number }
			]
		);
		return [header, ...body];
	}

	const header: Row = [
		{ value: 'Name', type: String },
		...s.columns.map((c) => ({ value: columnLabel(c), type: String }))
	];
	const body = s.rows.map((r): Row => {
		const priceCells: Row = r.prices.some((p) => p != null)
			? r.prices.map((p) => (p == null ? null : { value: p, type: Number }))
			: // Flat-priced item left unplaced in a variant section: put its single
				// price in the first column (the PDF spans it across all columns; a grid
				// can't, so pin it to the first).
				s.columns.map((_, i) =>
					i === 0 && r.single != null ? { value: r.single, type: Number } : null
				);
		return [{ value: r.name, type: String }, ...priceCells];
	});
	return [header, ...body];
}

// Excel tab names must be unique (case-insensitive), ≤31 chars, and free of a few
// characters. Sanitize each section title and disambiguate collisions.
export function sheetNames(sections: SheetSection[]): string[] {
	const used = new Set<string>();
	return sections.map((s) => {
		const base = s.title.replace(FORBIDDEN, '').trim().slice(0, MAX_TAB) || 'Sheet';
		let name = base;
		let n = 2;
		while (used.has(name.toLowerCase())) {
			const suffix = ` (${n++})`;
			name = base.slice(0, MAX_TAB - suffix.length) + suffix;
		}
		used.add(name.toLowerCase());
		return name;
	});
}

// Assemble the workbook (one tab per category) and return it as a Blob. The
// heavy library is loaded lazily on demand, mirroring the PDF path.
export async function buildMenuWorkbook(sheet: MenuSheet): Promise<Blob> {
	const { default: writeXlsxFile } = await import('write-excel-file/browser');
	const names = sheetNames(sheet.sections);
	const sheets = sheet.sections.map((s, i) => ({ sheet: names[i], data: buildRows(s) }));
	return writeXlsxFile(sheets, {}).toBlob();
}
