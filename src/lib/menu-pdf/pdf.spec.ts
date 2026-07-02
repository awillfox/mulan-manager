import { describe, it, expect } from 'vitest';
import { formatBaht, splitColumns, buildDocDefinition } from './pdf';
import type { MenuSheet, SheetSection, Branding } from './model';

const brand: Branding = {
	title: 'TH Gallery & Café',
	tagline: 'Since 2016',
	subtitle: 'Gallery & Café',
	hours: 'Open daily · 8am – 6pm',
	footer: 'All prices in Thai Baht (฿)'
};

function section(title: string, rows: number): SheetSection {
	return {
		title,
		columns: [],
		rows: Array.from({ length: rows }, (_, i) => ({ name: `${title}-${i}`, prices: [], single: 10 }))
	};
}

describe('formatBaht', () => {
	it('drops decimals for whole baht', () => {
		expect(formatBaht(75)).toBe('฿75');
	});
	it('keeps two decimals otherwise', () => {
		expect(formatBaht(75.5)).toBe('฿75.50');
	});
});

describe('splitColumns', () => {
	it('balances sections across two columns by estimated height', () => {
		const [left, right] = splitColumns([section('A', 8), section('B', 1), section('C', 1)]);
		// A alone is tallest; B and C should land opposite it.
		expect(left.map((s) => s.title)).toEqual(['A']);
		expect(right.map((s) => s.title)).toEqual(['B', 'C']);
	});
	it('returns two arrays that together contain every section once', () => {
		const [l, r] = splitColumns([section('A', 2), section('B', 2)]);
		expect([...l, ...r].map((s) => s.title).sort()).toEqual(['A', 'B']);
	});
});

describe('buildDocDefinition', () => {
	const sheet: MenuSheet = { sections: [section('Coffee', 2), section('Food', 2)] };
	const doc = buildDocDefinition(sheet, brand);

	it('is A5 portrait', () => {
		expect(doc.pageSize).toBe('A5');
		expect(doc.pageOrientation).toBe('portrait');
	});
	it('uses the embedded Sarabun font as default', () => {
		expect(doc.defaultStyle?.font).toBe('Sarabun');
	});
	it('lays the body out in two columns', () => {
		const body = doc.content as unknown as Array<Record<string, unknown>>;
		const cols = body.find((n) => 'columns' in n) as { columns: unknown[] };
		expect(cols.columns).toHaveLength(2);
	});
	it('includes the branding title somewhere in the header content', () => {
		const body = doc.content as unknown as Array<Record<string, unknown>>;
		const texts = body.map((n) => n.text).filter((t) => typeof t === 'string');
		expect(texts).toContain('TH Gallery & Café');
	});
});
