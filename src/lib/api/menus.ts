import type { SelectionMode } from './optionGroups';

export interface MenuOption {
	name: string;
	price_delta: number;
}
export interface MenuGroup {
	id: number; // shared preset id when isolated=false; clone id when isolated=true
	name: string;
	selection_mode: SelectionMode;
	isolated: boolean;
	options: MenuOption[];
}
export interface BaseOption {
	name: string;
	price: number;
} // THB
export interface Menu {
	id: number;
	name: string;
	price: number; // THB
	category_id: number | null;
	vfd_name: string;
	active: boolean;
	option_groups: MenuGroup[];
	base_options: BaseOption[];
}
export interface MenuInput {
	name: string;
	price: number;
	category_id: number | null;
	vfd_name: string;
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
async function ok(res: Response) {
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export const listMenus = () => fetch('/api/menus').then((r) => j<Menu[]>(r));
export const createMenu = (m: MenuInput) =>
	fetch('/api/menus', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	}).then((r) => j<Menu>(r));
export const updateMenu = (id: number, m: MenuInput) =>
	fetch(`/api/menus/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(m)
	}).then((r) => j<Menu>(r));
export const toggleMenu = (id: number) =>
	fetch(`/api/menus/${id}/toggle`, { method: 'PATCH' }).then(ok);
export const deleteMenu = (id: number) => fetch(`/api/menus/${id}`, { method: 'DELETE' }).then(ok);

export interface SetGroupsBody {
	groups: (
		| { isolated: false; id: number }
		| { isolated: true; name: string; selection_mode: SelectionMode; options: MenuOption[] }
	)[];
}
export const setMenuGroups = (id: number, body: SetGroupsBody) =>
	fetch(`/api/menus/${id}/option-groups`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	}).then(ok);
export const setMenuBaseOptions = (id: number, base_options: BaseOption[]) =>
	fetch(`/api/menus/${id}/base-options`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ base_options })
	}).then(ok);
