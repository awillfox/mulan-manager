import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Branding, MenuSheet, SheetRow, SheetSection } from './model';

const INK = '#2b2b2b';
const LIGHT_INK = '#f7f2e8';
// A5 portrait in points (used only for the full-page background rectangle).
const A5_W = 419.53;
const A5_H = 595.28;

// Pick a legible text color for a background: dark ink on light backgrounds,
// light ink on dark ones, by perceived luminance.
export function inkFor(bg: string): string {
	const hex = bg.replace('#', '');
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance >= 0.6 ? INK : LIGHT_INK;
}

export function formatBaht(n: number): string {
	return Number.isInteger(n) ? `฿${n}` : `฿${n.toFixed(2)}`;
}

// Display-only relabeling of variant column names (the backend stores plain ASCII).
const COLUMN_LABELS: Record<string, string> = { Frappe: 'Frappé' };
export function columnLabel(name: string): string {
	return COLUMN_LABELS[name] ?? name;
}

// Keep a category header with at least this many items on the same page; if
// they don't fit, the whole (unbreakable) head is moved to the next page.
const MIN_KEEP_ROWS = 3;

function dataRow(s: SheetSection, r: SheetRow): TableCell[] {
	if (s.columns.length === 0) {
		return [
			{ text: r.name },
			{ text: r.single == null ? '' : formatBaht(r.single), alignment: 'right' }
		];
	}
	const anyPrice = r.prices.some((p) => p != null);
	if (anyPrice) {
		return [
			{ text: r.name },
			...r.prices.map((p) => ({
				text: p == null ? '' : formatBaht(p),
				alignment: 'right' as const
			}))
		];
	}
	// item has no variant prices inside a variant section: one price spanning the price cols
	return [
		{ text: r.name },
		{
			text: r.single == null ? '' : formatBaht(r.single),
			alignment: 'right',
			colSpan: s.columns.length
		},
		...Array(Math.max(0, s.columns.length - 1)).fill({ text: '' })
	];
}

function sectionContent(s: SheetSection): Content[] {
	const hasCols = s.columns.length > 0;
	const widths = hasCols ? ['*', ...s.columns.map(() => 48)] : ['*', 'auto'];

	const headerRow: TableCell[] | null = hasCols
		? [
				{ text: '' },
				...s.columns.map((c) => ({
					text: columnLabel(c).toUpperCase(),
					fontSize: 8,
					alignment: 'right' as const,
					characterSpacing: 1
				}))
			]
		: null;

	const rows = s.rows.map((r) => dataRow(s, r));
	const first = rows.slice(0, MIN_KEEP_ROWS);
	const rest = rows.slice(MIN_KEEP_ROWS);

	const title: Content = {
		text: s.title.toUpperCase(),
		fontSize: 14,
		bold: true,
		characterSpacing: 2,
		alignment: 'center',
		margin: [0, 0, 0, 6]
	};

	// Head = title + column header + first MIN_KEEP_ROWS items, kept together.
	const head: Content = {
		unbreakable: true,
		margin: [0, 0, 0, rest.length ? 0 : 16],
		stack: [
			title,
			{
				table: { widths, body: headerRow ? [headerRow, ...first] : first },
				layout: 'noBorders'
			}
		]
	};

	if (rest.length === 0) return [head];

	// Remaining items flow normally and may break across pages.
	const tail: Content = {
		margin: [0, 0, 0, 16],
		table: { widths, body: rest },
		layout: 'noBorders'
	};
	return [head, tail];
}

export function buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions {
	const ink = inkFor(b.background);
	return {
		pageSize: 'A5',
		pageOrientation: 'portrait',
		pageMargins: [34, 32, 34, 38],
		defaultStyle: { font: 'Sarabun', fontSize: 11, color: ink },
		background: () => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: A5_W, h: A5_H, color: b.background }]
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
			...sheet.sections.flatMap(sectionContent)
		],
		footer: () => ({
			text: `${b.hours}      ${b.footer}`,
			alignment: 'center',
			fontSize: 9,
			italics: true,
			color: ink,
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
