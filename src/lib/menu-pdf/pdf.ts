import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Branding, MenuSheet, SheetSection } from './model';

const CREAM = '#f3ead8';
const INK = '#2b2b2b';
// A5 portrait in points (used only for the full-page background rectangle).
const A5_W = 419.53;
const A5_H = 595.28;

export function formatBaht(n: number): string {
	return Number.isInteger(n) ? `฿${n}` : `฿${n.toFixed(2)}`;
}

function estimateHeight(s: SheetSection): number {
	// title (~2 lines of vertical space) + optional column header + one line per row
	return 2 + (s.columns.length ? 1 : 0) + s.rows.length;
}

export function splitColumns(sections: SheetSection[]): [SheetSection[], SheetSection[]] {
	const left: SheetSection[] = [];
	const right: SheetSection[] = [];
	let lh = 0;
	let rh = 0;
	for (const s of sections) {
		const h = estimateHeight(s);
		if (lh <= rh) {
			left.push(s);
			lh += h;
		} else {
			right.push(s);
			rh += h;
		}
	}
	return [left, right];
}

function sectionContent(s: SheetSection): Content {
	const hasCols = s.columns.length > 0;
	const body: TableCell[][] = [];

	if (hasCols) {
		body.push([
			{ text: '' },
			...s.columns.map((c) => ({
				text: c.toUpperCase(),
				fontSize: 6,
				alignment: 'right' as const,
				characterSpacing: 1
			}))
		]);
	}

	for (const r of s.rows) {
		if (!hasCols) {
			body.push([
				{ text: r.name },
				{ text: r.single == null ? '' : formatBaht(r.single), alignment: 'right' }
			]);
			continue;
		}
		const anyPrice = r.prices.some((p) => p != null);
		if (anyPrice) {
			body.push([
				{ text: r.name },
				...r.prices.map((p) => ({
					text: p == null ? '' : formatBaht(p),
					alignment: 'right' as const
				}))
			]);
		} else {
			// item has no variant prices inside a variant section: one price, spanning the price cols
			body.push([
				{ text: r.name },
				{
					text: r.single == null ? '' : formatBaht(r.single),
					alignment: 'right',
					colSpan: s.columns.length
				},
				...Array(Math.max(0, s.columns.length - 1)).fill({ text: '' })
			]);
		}
	}

	const widths = hasCols ? ['*', ...s.columns.map(() => 30)] : ['*', 'auto'];

	return {
		margin: [0, 0, 0, 10],
		stack: [
			{
				text: s.title.toUpperCase(),
				fontSize: 9,
				bold: true,
				characterSpacing: 2,
				alignment: 'center',
				margin: [0, 0, 0, 4]
			},
			{ table: { widths, body }, layout: 'noBorders' }
		]
	};
}

export function buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions {
	const [left, right] = splitColumns(sheet.sections);
	return {
		pageSize: 'A5',
		pageOrientation: 'portrait',
		pageMargins: [28, 28, 28, 34],
		defaultStyle: { font: 'Sarabun', fontSize: 8, color: INK },
		background: () => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: A5_W, h: A5_H, color: CREAM }]
		}),
		content: [
			{
				text: b.tagline.toUpperCase(),
				alignment: 'center',
				fontSize: 7,
				characterSpacing: 3,
				margin: [0, 0, 0, 2]
			},
			{ text: b.title, alignment: 'center', fontSize: 20, bold: true },
			{ text: b.subtitle, alignment: 'center', fontSize: 10, margin: [0, 2, 0, 14] },
			{
				columns: [
					{ width: '*', stack: left.map(sectionContent) },
					{ width: '*', stack: right.map(sectionContent) }
				],
				columnGap: 18
			}
		],
		footer: () => ({
			text: `${b.hours}      ${b.footer}`,
			alignment: 'center',
			fontSize: 7,
			italics: true,
			color: INK,
			margin: [0, 10, 0, 0]
		})
	};
}

export async function generatePdf(
	doc: TDocumentDefinitions
): Promise<{ dataUrl: string; blob: Blob }> {
	const [pdfMod, { loadFonts }] = await Promise.all([
		import('pdfmake/build/pdfmake'),
		import('./fonts')
	]);
	// pdfmake's browser build is CJS; the module or its .default is the pdfMake object.
	const pdfMake = (pdfMod as unknown as { default?: unknown }).default ?? pdfMod;
	const mk = pdfMake as {
		vfs: Record<string, string>;
		fonts: unknown;
		createPdf: (d: TDocumentDefinitions) => {
			getBlob: (cb: (b: Blob) => void) => void;
			getDataUrl: (cb: (u: string) => void) => void;
		};
	};
	const { vfs, fonts } = await loadFonts();
	mk.vfs = vfs;
	mk.fonts = fonts;
	const pdf = mk.createPdf(doc);
	const blob = await new Promise<Blob>((res) => pdf.getBlob(res));
	const dataUrl = await new Promise<string>((res) => pdf.getDataUrl(res));
	return { dataUrl, blob };
}
