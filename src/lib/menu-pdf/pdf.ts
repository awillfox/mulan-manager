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

function sectionContent(s: SheetSection): Content {
	const hasCols = s.columns.length > 0;
	const body: TableCell[][] = [];

	if (hasCols) {
		body.push([
			{ text: '' },
			...s.columns.map((c) => ({
				text: c.toUpperCase(),
				fontSize: 8,
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

	const widths = hasCols ? ['*', ...s.columns.map(() => 48)] : ['*', 'auto'];

	return {
		margin: [0, 0, 0, 16],
		stack: [
			{
				text: s.title.toUpperCase(),
				fontSize: 14,
				bold: true,
				characterSpacing: 2,
				alignment: 'center',
				margin: [0, 0, 0, 6]
			},
			{ table: { widths, body }, layout: 'noBorders' }
		]
	};
}

export function buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions {
	return {
		pageSize: 'A5',
		pageOrientation: 'portrait',
		pageMargins: [34, 32, 34, 38],
		defaultStyle: { font: 'Sarabun', fontSize: 11, color: INK },
		background: () => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: A5_W, h: A5_H, color: CREAM }]
		}),
		content: [
			{
				text: b.tagline.toUpperCase(),
				alignment: 'center',
				fontSize: 9,
				characterSpacing: 3,
				margin: [0, 0, 0, 2]
			},
			{ text: b.title, alignment: 'center', font: 'Oswald', fontSize: 28, characterSpacing: 1 },
			{ text: b.subtitle, alignment: 'center', fontSize: 13, margin: [0, 2, 0, 18] },
			// Single column: all sections stacked full-width.
			...sheet.sections.map(sectionContent)
		],
		footer: () => ({
			text: `${b.hours}      ${b.footer}`,
			alignment: 'center',
			fontSize: 9,
			italics: true,
			color: INK,
			margin: [0, 12, 0, 0]
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
	// pdfmake 0.3 API: fonts are registered via addVirtualFileSystem()/setFonts(),
	// NOT by assigning `.vfs`/`.fonts` (the 0.2.x API, a no-op here — createPdf reads
	// the shared virtual FS populated only through addVirtualFileSystem).
	const mk = pdfMake as {
		addVirtualFileSystem: (vfs: Record<string, string>) => void;
		setFonts: (fonts: unknown) => void;
		createPdf: (d: TDocumentDefinitions) => {
			// pdfmake 0.3: these are async and return Promises (not 0.2.x callbacks).
			getBlob: () => Promise<Blob>;
			getDataUrl: () => Promise<string>;
		};
	};
	const { vfs, fonts } = await loadFonts();
	mk.addVirtualFileSystem(vfs);
	mk.setFonts(fonts);
	const pdf = mk.createPdf(doc);
	const blob = await pdf.getBlob();
	const dataUrl = await pdf.getDataUrl();
	return { dataUrl, blob };
}
