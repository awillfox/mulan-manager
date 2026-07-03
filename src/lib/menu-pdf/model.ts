import type { Menu } from '$lib/api/menus';
import type { Category } from '$lib/api/categories';

export interface Branding {
	title: string;
	tagline: string;
	subtitle: string;
	hours: string;
	footer: string;
}

export interface SheetRow {
	name: string;
	prices: (number | null)[]; // aligned to SheetSection.columns; [] when columns is empty
	single: number | null; // used when the row has no per-column prices
}

export interface SheetSection {
	title: string;
	columns: string[]; // variant headers, e.g. ['Hot','Iced','Frappé']; [] for a plain list
	rows: SheetRow[];
}

export interface MenuSheet {
	sections: SheetSection[];
}

const OTHER = 'Other';

export function buildMenuSheet(menus: Menu[], categories: Category[]): MenuSheet {
	const active = menus.filter((m) => m.active);

	// One global set of variant columns across the whole menu (first-appearance
	// order, e.g. Hot/Iced/Frappé) so the same variant lines up in the same column
	// in every section — a category serving only Iced still shows it in the middle.
	const globalColumns: string[] = [];
	const seen = new Set<string>();
	for (const m of active) {
		for (const b of m.base_options) {
			if (!seen.has(b.name)) {
				seen.add(b.name);
				globalColumns.push(b.name);
			}
		}
	}

	const byCat = new Map<number | null, Menu[]>();
	for (const m of active) {
		const key = m.category_id ?? null;
		const list = byCat.get(key) ?? [];
		list.push(m);
		byCat.set(key, list);
	}

	const sections: SheetSection[] = [];
	const emit = (key: number | null, title: string) => {
		const items = byCat.get(key);
		if (items && items.length > 0) sections.push(buildSection(title, items, globalColumns));
	};

	for (const c of categories) emit(c.id, c.name);
	emit(null, OTHER); // uncategorised, last

	return { sections };
}

function buildSection(title: string, items: Menu[], globalColumns: string[]): SheetSection {
	// A section is a "variant section" if any item has base options; those use the
	// shared global columns so they align. Sections with no variant items stay a
	// plain name/price list.
	const hasVariants = items.some((m) => m.base_options.length > 0);
	if (!hasVariants) {
		return {
			title,
			columns: [],
			rows: items.map((m) => ({ name: m.name, prices: [], single: m.price }))
		};
	}

	const columns = globalColumns;
	const rows: SheetRow[] = items.map((m) => {
		const priceByName = new Map(m.base_options.map((b) => [b.name, b.price]));
		const prices = columns.map((c) => (priceByName.has(c) ? priceByName.get(c)! : null));
		const single = m.base_options.length === 0 ? m.price : null;
		return { name: m.name, prices, single };
	});

	return { title, columns, rows };
}
