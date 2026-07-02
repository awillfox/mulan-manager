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
		if (items && items.length > 0) sections.push(buildSection(title, items));
	};

	for (const c of categories) emit(c.id, c.name);
	emit(null, OTHER); // uncategorised, last

	return { sections };
}

function buildSection(title: string, items: Menu[]): SheetSection {
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const m of items) {
		for (const b of m.base_options) {
			if (!seen.has(b.name)) {
				seen.add(b.name);
				columns.push(b.name);
			}
		}
	}

	const rows: SheetRow[] = items.map((m) => {
		if (columns.length === 0) {
			return { name: m.name, prices: [], single: m.price };
		}
		const priceByName = new Map(m.base_options.map((b) => [b.name, b.price]));
		const prices = columns.map((c) => (priceByName.has(c) ? priceByName.get(c)! : null));
		const single = m.base_options.length === 0 ? m.price : null;
		return { name: m.name, prices, single };
	});

	return { title, columns, rows };
}
