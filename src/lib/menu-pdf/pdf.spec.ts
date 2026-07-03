import { describe, it, expect } from 'vitest';
import { formatBaht, buildDocDefinition } from './pdf';
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
		rows: Array.from({ length: rows }, (_, i) => ({
			name: `${title}-${i}`,
			prices: [],
			single: 10
		}))
	};
}

// A section block rendered by sectionContent: { margin, stack: [titleNode, tableNode] }.
type SectionBlock = {
	stack: [{ text: string }, { table: { widths: unknown[]; body: unknown[][] } }];
};
function sectionBlocks(doc: ReturnType<typeof buildDocDefinition>): SectionBlock[] {
	const content = doc.content as unknown as Array<Record<string, unknown>>;
	return content.filter((n) => Array.isArray(n.stack)) as unknown as SectionBlock[];
}

describe('formatBaht', () => {
	it('drops decimals for whole baht', () => {
		expect(formatBaht(75)).toBe('฿75');
	});
	it('keeps two decimals otherwise', () => {
		expect(formatBaht(75.5)).toBe('฿75.50');
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
	it('lays sections out in a single column (no columns node)', () => {
		const content = doc.content as unknown as Array<Record<string, unknown>>;
		expect(content.find((n) => 'columns' in n)).toBeUndefined();
		const titles = sectionBlocks(doc).map((b) => b.stack[0].text);
		expect(titles).toEqual(['COFFEE', 'FOOD']);
	});
	it('includes the branding title somewhere in the header content', () => {
		const content = doc.content as unknown as Array<Record<string, unknown>>;
		const texts = content.map((n) => n.text).filter((t) => typeof t === 'string');
		expect(texts).toContain('TH Gallery & Café');
	});
});

describe('buildDocDefinition – variant columns', () => {
	const variantSheet: MenuSheet = {
		sections: [
			{
				title: 'Drinks',
				columns: ['Hot', 'Iced'],
				rows: [
					{ name: 'Americano', prices: [75, 85], single: null },
					{ name: 'Dirty Coffee', prices: [null, null], single: 110 }
				]
			}
		]
	};

	const doc = buildDocDefinition(variantSheet, brand);
	const block = sectionBlocks(doc).find((b) => b.stack[0].text === 'DRINKS')!;
	const { widths, body } = block.stack[1].table;

	it('widths length equals columns.length + 1 (name col + one per variant)', () => {
		expect(widths).toHaveLength(3);
	});

	it('every row (header + data rows) has length equal to columns.length + 1', () => {
		// This guards the colSpan fallback row: it must pad with { text: '' } cells
		// so its length still equals columns.length + 1, not 2.
		for (const row of body) {
			expect(row).toHaveLength(3);
		}
	});

	it('header row variant cells contain the uppercased column names', () => {
		const header = body[0] as Array<{ text: string }>;
		expect(header[1].text).toBe('HOT');
		expect(header[2].text).toBe('ICED');
	});
});
