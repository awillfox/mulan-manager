import type { TFontDictionary } from 'pdfmake/interfaces';

// vfs key (pdfmake virtual filename) -> static asset URL served by SvelteKit
const FILES: Record<string, string> = {
	'Sarabun-Regular.ttf': '/fonts/Sarabun-Regular.ttf',
	'Sarabun-Bold.ttf': '/fonts/Sarabun-Bold.ttf',
	'Sarabun-Italic.ttf': '/fonts/Sarabun-Italic.ttf',
	'Sarabun-BoldItalic.ttf': '/fonts/Sarabun-BoldItalic.ttf',
	// Oswald (variable, Latin-only) — display face for the menu title.
	'Oswald-Variable.ttf': '/fonts/Oswald-Variable.ttf'
};

let cache: { vfs: Record<string, string>; fonts: TFontDictionary } | null = null;

async function toBase64(url: string): Promise<string> {
	const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
	// Chunked to avoid blowing the call stack on String.fromCharCode(...bigArray).
	let bin = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < buf.length; i += CHUNK) {
		bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

export async function loadFonts() {
	if (cache) return cache;
	const entries = await Promise.all(
		Object.entries(FILES).map(async ([name, url]) => [name, await toBase64(url)] as const)
	);
	const vfs = Object.fromEntries(entries);
	const fonts: TFontDictionary = {
		Sarabun: {
			normal: 'Sarabun-Regular.ttf',
			bold: 'Sarabun-Bold.ttf',
			italics: 'Sarabun-Italic.ttf',
			bolditalics: 'Sarabun-BoldItalic.ttf'
		},
		// Latin-only display face; single variable file mapped to every style.
		Oswald: {
			normal: 'Oswald-Variable.ttf',
			bold: 'Oswald-Variable.ttf',
			italics: 'Oswald-Variable.ttf',
			bolditalics: 'Oswald-Variable.ttf'
		}
	};
	cache = { vfs, fonts };
	return cache;
}
